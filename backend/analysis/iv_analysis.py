"""
Instrumental Variable (IV) estimation via Two-Stage Least Squares (2SLS).

Design mirrors RDEstimator: class-based, all estimation internals here,
no Flask dependencies.

Supports:
- Just-identified IV  (1 instrument, 1 endogenous variable)
- Overidentified IV   (multiple instruments, 1 endogenous variable)
- Multiple endogenous variables (e.g., education + experience + experience²)
- Optional controls   (included exogenous variables)

Key diagnostics implemented:
- First-stage partial-F (instrument strength, Stock-Yogo thresholds)
- Wu-Hausman endogeneity test (is OLS actually biased?)
- Sargan-Hansen overidentification test (are excess instruments valid?)
- OLS comparison estimate (quantifies the endogeneity-bias correction)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
import statsmodels.api as sm
from scipy.stats import norm, chi2, f as f_dist

from .iv_helpers import (
    validate_iv_data,
    first_stage_partial_f,
    interpret_instrument_strength,
    ols_estimate,
    _quote,
    _param_name,
)


class IVEstimator:
    """
    Two-Stage Least Squares (2SLS) estimator supporting one or more
    endogenous variables.

    Parameters
    ----------
    data : pd.DataFrame
    outcome_var : str
        Dependent variable (Y).
    treatment_var : str
        Primary endogenous treatment variable (D) — the variable whose
        causal effect you want to estimate.
    instrument_vars : list[str]
        Instruments for the *primary* treatment (excluded instruments).
    control_vars : list[str] | None
        Exogenous controls (X) included in both stages.
    additional_endogenous : list[dict] | None
        Extra endogenous regressors beyond the primary treatment.
        Each entry: {"variable": str, "instrument": str}.
        These variables go into the structural equation as regressors,
        and their instruments go into the instrument matrix.
    """

    def __init__(
        self,
        data: pd.DataFrame,
        outcome_var: str,
        treatment_var: str,
        instrument_vars: List[str],
        control_vars: Optional[List[str]] = None,
        additional_endogenous: Optional[List[Dict[str, str]]] = None,
    ):
        self.data = data
        self.outcome_var = outcome_var
        self.treatment_var = treatment_var
        self.instrument_vars = list(instrument_vars)
        self.control_vars = list(control_vars or [])
        self.additional_endogenous = list(additional_endogenous or [])

        # Build combined lists
        # All endogenous variables: [primary_treatment, additional...]
        self.all_endogenous_vars = [self.treatment_var]
        # All excluded instruments: [primary_instruments..., additional_instruments...]
        self.all_instrument_vars = list(self.instrument_vars)

        for entry in self.additional_endogenous:
            var = entry["variable"]
            inst = entry["instrument"]
            if var not in self.all_endogenous_vars:
                self.all_endogenous_vars.append(var)
            if inst not in self.all_instrument_vars:
                self.all_instrument_vars.append(inst)

        # Remove any additional endogenous variables and their instruments
        # from the controls list to prevent duplicate columns in the
        # X and Z matrices, which would cause rank deficiency and
        # numerically meaningless 2SLS results.
        if self.additional_endogenous:
            self.control_vars = [
                c for c in self.control_vars
                if c not in self.all_endogenous_vars
                and c not in self.all_instrument_vars
            ]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def estimate(self) -> Dict[str, Any]:
        """
        Run full 2SLS estimation and all diagnostics.

        Returns
        -------
        dict with keys:
            treatment_effect   float   — 2SLS estimate for primary treatment
            se                 float   — standard error
            ci_lower/ci_upper  float   — 95% confidence interval
            p_value            float
            n_obs              int
            n_instruments      int
            n_controls         int
            first_stage        dict    — F-stat, R², instrument coefficients
            instrument_strength dict  — Stock-Yogo interpretation
            endogeneity_test   dict    — Wu-Hausman result
            overidentification_test dict | None — Sargan-Hansen (if overidentified)
            ols_comparison     dict    — naive OLS estimate for reference
            additional_endogenous_results list | None — coefficients for extra endogenous vars
            warnings           list[str]
        """
        # ---- 1. Validate & prepare clean working frame ----
        data_warnings = validate_iv_data(
            self.data,
            self.outcome_var,
            self.treatment_var,
            self.instrument_vars,
            self.control_vars,
        )

        # Collect ALL columns we need
        all_cols = list(set(
            [self.outcome_var]
            + self.all_endogenous_vars
            + self.all_instrument_vars
            + self.control_vars
        ))
        df = self.data[all_cols].copy()
        for col in all_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df = df.dropna()

        if df.empty:
            raise ValueError(
                "No complete observations remain after converting columns to numeric."
            )

        warnings: List[str] = list(data_warnings)
        n = len(df)
        n_all_inst = len(self.all_instrument_vars)
        n_all_endog = len(self.all_endogenous_vars)
        n_ctrl = len(self.control_vars)

        # Order condition: need at least as many instruments as endogenous vars
        if n_all_inst < n_all_endog:
            raise ValueError(
                f"Under-identified: {n_all_endog} endogenous variable(s) but "
                f"only {n_all_inst} excluded instrument(s). Need at least as "
                "many instruments as endogenous variables."
            )

        # ---- 2. Build matrices for 2SLS ----
        # X = [1, endog_1, endog_2, ..., controls]   (structural regressors)
        # Z = [1, inst_1, inst_2, ..., controls]      (instrument matrix)
        Y, X, Z = _build_matrices(
            df, self.outcome_var, self.all_endogenous_vars,
            self.all_instrument_vars, self.control_vars
        )

        # ---- 3. 2SLS estimation ----
        beta, se_vec, resid, sigma2, X_hat = _tsls(Y, X, Z)

        # Coefficient index: [intercept=0, primary_treatment=1, additional_endog=2.., controls..]
        tau = float(beta[1])
        se_tau = float(se_vec[1])

        if not np.isfinite(se_tau) or se_tau <= 0:
            raise ValueError(
                "Standard error could not be computed. This often means the "
                "instruments are perfectly collinear with the controls, or the "
                "first stage has no explanatory power."
            )

        z_stat = tau / se_tau
        p_value = float(2.0 * norm.sf(abs(z_stat)))
        z_crit = float(norm.ppf(0.975))
        ci_lower = tau - z_crit * se_tau
        ci_upper = tau + z_crit * se_tau

        # ---- 3b. Additional endogenous variable results ----
        additional_results = None
        if len(self.all_endogenous_vars) > 1:
            additional_results = []
            for i, var in enumerate(self.all_endogenous_vars[1:], start=2):
                coef_i = float(beta[i])
                se_i = float(se_vec[i])
                z_i = coef_i / se_i if se_i > 0 else float("nan")
                p_i = float(2.0 * norm.sf(abs(z_i))) if np.isfinite(z_i) else float("nan")
                additional_results.append({
                    "variable": var,
                    "coefficient": round(coef_i, 4),
                    "se": round(se_i, 4),
                    "z_statistic": round(z_i, 4),
                    "p_value": round(p_i, 4),
                })

        # ---- 4. First-stage diagnostics — one per treatment-instrument pair ----
        # Primary treatment uses only its own instruments (self.instrument_vars),
        # not the additional endogenous instruments.
        fs_diag = first_stage_partial_f(
            df, self.treatment_var, self.instrument_vars, self.control_vars or None
        )
        strength_interp = interpret_instrument_strength(
            fs_diag["f_statistic"], len(self.instrument_vars)
        )

        if strength_interp["is_weak"]:
            warnings.append(strength_interp["message"])

        # Per-pair first stages (primary + each additional endogenous variable)
        first_stage_per_endogenous: Dict[str, Any] = {}
        first_stage_per_endogenous[self.treatment_var] = {
            "instruments": self.instrument_vars,
            "first_stage": fs_diag,
            "instrument_strength": strength_interp,
        }
        for entry in self.additional_endogenous:
            endo_var = entry["variable"]
            endo_inst = entry["instrument"]
            try:
                fs_pair = first_stage_partial_f(
                    df, endo_var, [endo_inst], self.control_vars or None
                )
                strength_pair = interpret_instrument_strength(fs_pair["f_statistic"], 1)
                if strength_pair["is_weak"]:
                    warnings.append(
                        f"Instrument '{endo_inst}' for '{endo_var}': "
                        + strength_pair["message"]
                    )
                first_stage_per_endogenous[endo_var] = {
                    "instruments": [endo_inst],
                    "first_stage": fs_pair,
                    "instrument_strength": strength_pair,
                }
            except Exception as fs_err:
                first_stage_per_endogenous[endo_var] = {
                    "instruments": [endo_inst],
                    "error": str(fs_err),
                }

        # ---- 5. Wu-Hausman endogeneity test ----
        wh_test = _wu_hausman_test(
            df, self.outcome_var, self.all_endogenous_vars,
            self.all_instrument_vars, self.control_vars
        )

        # ---- 6. Sargan-Hansen overidentification test (if overidentified) ----
        sargan_test = None
        n_overid = n_all_inst - n_all_endog
        if n_overid > 0:
            sargan_test = _sargan_hansen_test(
                df, resid, self.all_instrument_vars, self.control_vars,
                n_endogenous=n_all_endog
            )
            if sargan_test.get("p_value") is not None and sargan_test["p_value"] < 0.05:
                warnings.append(
                    f"Sargan-Hansen overidentification test rejected (p = "
                    f"{sargan_test['p_value']:.3f}). At least one instrument "
                    "may violate the exclusion restriction."
                )

        # ---- 7. OLS comparison (primary treatment only, with additional endog as controls) ----
        # In OLS we include additional endogenous vars as regressors alongside controls
        ols_controls = list(self.control_vars)
        for var in self.all_endogenous_vars[1:]:
            if var not in ols_controls:
                ols_controls.append(var)
        ols_est = ols_estimate(
            df, self.outcome_var, self.treatment_var, ols_controls or None
        )
        ols_bias = round(tau - ols_est["estimate"], 4)

        # ---- 8. Additional warnings ----
        if n < 100:
            warnings.append(
                f"Small sample (n = {n}). 2SLS is an asymptotic estimator and "
                "may perform poorly in small samples. Confidence intervals may be "
                "too narrow."
            )


        return {
            # Primary result
            "treatment_effect": round(tau, 4),
            "se": round(se_tau, 4),
            "ci_lower": round(ci_lower, 4),
            "ci_upper": round(ci_upper, 4),
            "p_value": round(p_value, 4),
            "z_statistic": round(z_stat, 4),
            "estimand": "LATE",   # Local Average Treatment Effect (compliers)

            # Sample info
            "n_obs": n,
            "n_instruments": n_all_inst,
            "n_endogenous": n_all_endog,
            "n_controls": n_ctrl,

            # Instrument diagnostics
            "first_stage": fs_diag,
            "instrument_strength": strength_interp,
            "first_stage_per_endogenous": first_stage_per_endogenous,

            # Specification tests
            "endogeneity_test": wh_test,
            "overidentification_test": sargan_test,

            # OLS for comparison
            "ols_comparison": {
                **ols_est,
                "iv_ols_difference": ols_bias,
                "interpretation": _interpret_ols_gap(ols_bias, tau, ols_est["estimate"]),
            },

            # Additional endogenous variable coefficients
            "additional_endogenous_results": additional_results,

            "warnings": warnings,
        }

    def sensitivity_analysis(self, n_points: int = 20) -> Dict[str, Any]:
        """
        Assess how sensitive the 2SLS estimate is to dropping individual
        instruments (leave-one-out, only applicable when overidentified).

        For just-identified IV, instead returns the Anderson-Rubin confidence
        interval, which is valid even under weak instruments.
        """
        n_all_inst = len(self.all_instrument_vars)
        n_all_endog = len(self.all_endogenous_vars)

        if n_all_inst <= n_all_endog:
            # Just-identified: Anderson-Rubin CI
            return _liml_comparison(self.data, self.outcome_var,
                                    self.treatment_var, self.instrument_vars,
                                    self.control_vars,
                                    self.additional_endogenous)
        return _leave_one_out_instruments(self.data, self.outcome_var,
                                          self.treatment_var, self.instrument_vars,
                                          self.control_vars,
                                          self.additional_endogenous)


# ---------------------------------------------------------------------------
# 2SLS core math
# ---------------------------------------------------------------------------

def _build_matrices(
    df: pd.DataFrame,
    outcome_var: str,
    endogenous_vars: List[str],
    instrument_vars: List[str],
    control_vars: List[str],
) -> tuple:
    """
    Construct Y, X, Z numpy matrices for 2SLS.

    X = [1, endog_1, endog_2, ..., controls]   — structural regressors
    Z = [1, inst_1, inst_2, ..., controls]      — instrument matrix
    """
    Y = df[outcome_var].to_numpy(dtype=float)

    endogenous = df[endogenous_vars].to_numpy(dtype=float)
    if endogenous.ndim == 1:
        endogenous = endogenous.reshape(-1, 1)

    controls = (
        df[control_vars].to_numpy(dtype=float)
        if control_vars
        else np.empty((len(df), 0))
    )
    instruments = df[instrument_vars].to_numpy(dtype=float)
    if instruments.ndim == 1:
        instruments = instruments.reshape(-1, 1)

    ones = np.ones((len(df), 1))

    # X: [intercept, endogenous vars, controls]
    X = np.hstack([ones, endogenous, controls])

    # Z: [intercept, excluded instruments, controls]
    Z = np.hstack([ones, instruments, controls])

    return Y, X, Z


def _tsls(
    Y: np.ndarray,
    X: np.ndarray,
    Z: np.ndarray,
) -> tuple:
    """
    Two-Stage Least Squares via projection.

    X_hat = P_Z X  (project all structural regressors onto instrument space)
    beta  = (X_hat'X)^{-1} X_hat'Y
    se    = sqrt(diag(sigma² (X_hat'X_hat)^{-1}))

    Residuals computed using original X (not X_hat) for correct sigma².

    Returns: (beta, se, residuals, sigma2, X_hat)
    """
    n, k = X.shape

    # First-stage projection matrix P_Z = Z(Z'Z)^{-1}Z'
    try:
        ZtZ = Z.T @ Z
        ZtZ_inv = np.linalg.inv(ZtZ)
    except np.linalg.LinAlgError:
        raise ValueError(
            "Instrument matrix is singular. Check for perfect collinearity "
            "among instruments and controls."
        )

    # Project X onto Z column by column
    P_Z = Z @ ZtZ_inv @ Z.T
    X_hat = P_Z @ X

    # 2SLS coefficient: (X_hat'X)^{-1} X_hat'Y
    XhX = X_hat.T @ X
    XhY = X_hat.T @ Y
    try:
        beta = np.linalg.solve(XhX, XhY)
    except np.linalg.LinAlgError:
        raise ValueError(
            "Cannot solve the 2SLS normal equations. The design matrix may be "
            "rank-deficient — check for perfectly collinear variables."
        )

    # Structural residuals (use original X)
    resid = Y - X @ beta

    # Homoskedastic SE: Var(beta) = sigma² (X_hat'X_hat)^{-1}
    dof = n - k
    if dof <= 0:
        raise ValueError(
            "No residual degrees of freedom. Reduce number of instruments/controls."
        )
    sigma2 = float(resid @ resid) / dof

    XhXh = X_hat.T @ X_hat
    try:
        Var = sigma2 * np.linalg.inv(XhXh)
    except np.linalg.LinAlgError:
        raise ValueError(
            "Variance matrix is singular. This typically means the instruments "
            "have no explanatory power for the treatment (complete weak-instrument failure)."
        )

    se = np.sqrt(np.diag(Var))
    return beta, se, resid, sigma2, X_hat


# ---------------------------------------------------------------------------
# Specification tests
# ---------------------------------------------------------------------------

def _wu_hausman_test(
    df: pd.DataFrame,
    outcome_var: str,
    endogenous_vars: List[str],
    instrument_vars: List[str],
    control_vars: List[str],
) -> Dict[str, Any]:
    """
    Wu-Hausman endogeneity test (generalized for multiple endogenous vars).

    H0: all endogenous variables are actually exogenous (OLS consistent)
    H1: at least one is endogenous (OLS inconsistent, 2SLS needed)

    Implementation: augmented regression (Rivers-Vuong, 1988).
    For each endogenous var, regress it on all instruments + controls to get
    residuals v_hat_i. Then add all v_hat_i to the structural equation and
    test their joint significance.
    """
    controls = control_vars or []
    df = df.copy()

    # Step 1: first-stage residuals for each endogenous variable
    v_hat_names = []
    for i, endog_var in enumerate(endogenous_vars):
        rhs_fs = " + ".join(
            [_quote(z) for z in instrument_vars] + [_quote(c) for c in controls]
        )
        fs_formula = f"{_quote(endog_var)} ~ {rhs_fs}"
        fs_model = smf.ols(fs_formula, data=df).fit()
        vname = f"_v_hat_{i}"
        df[vname] = fs_model.resid
        v_hat_names.append(vname)

    # Step 2: augmented structural equation
    rhs_aug = " + ".join(
        [_quote(e) for e in endogenous_vars]
        + [_quote(c) for c in controls]
        + v_hat_names
    )
    aug_formula = f"{_quote(outcome_var)} ~ {rhs_aug}"
    aug_model = smf.ols(aug_formula, data=df).fit()

    # Step 3: joint F-test on all v_hat coefficients
    if len(v_hat_names) == 1:
        # Single endogenous: t-test on _v_hat_0
        pname = _param_name(aug_model, v_hat_names[0])
        if pname is None:
            return {
                "statistic": None,
                "p_value": None,
                "endogenous": None,
                "error": "Could not locate first-stage residuals in augmented model.",
            }
        t_stat = float(aug_model.tvalues[pname])
        p_value = float(aug_model.pvalues[pname])
        coef = float(aug_model.params[pname])
        endogenous = p_value < 0.05

        return {
            "statistic": round(t_stat, 4),
            "p_value": round(p_value, 4),
            "endogenous": endogenous,
            "v_hat_coefficient": round(coef, 4),
            "message": (
                f"Endogeneity detected (p = {p_value:.3f}). "
                "The treatment appears to be correlated with the error term. "
                "2SLS is preferred over OLS."
            ) if endogenous else (
                f"No significant endogeneity detected (p = {p_value:.3f}). "
                "OLS may be consistent, but 2SLS remains valid if the exclusion "
                "restriction holds."
            ),
            "interpretation": (
                "Reject H0 (treatment is endogenous)" if endogenous
                else "Fail to reject H0 (treatment may be exogenous)"
            ),
        }
    else:
        # Multiple endogenous: joint F-test on all v_hat coefficients
        try:
            # Build restriction string for statsmodels
            restriction_strs = []
            for vname in v_hat_names:
                pname = _param_name(aug_model, vname)
                if pname:
                    restriction_strs.append(f"{pname} = 0")
            if not restriction_strs:
                return {
                    "statistic": None,
                    "p_value": None,
                    "endogenous": None,
                    "error": "Could not locate first-stage residuals in augmented model.",
                }
            f_test = aug_model.f_test(restriction_strs)
            f_stat = float(f_test.fvalue)
            p_value = float(f_test.pvalue)
            endogenous = p_value < 0.05

            return {
                "statistic": round(f_stat, 4),
                "p_value": round(p_value, 4),
                "endogenous": endogenous,
                "test_type": "joint_F",
                "n_endogenous": len(endogenous_vars),
                "message": (
                    f"Joint endogeneity detected (F = {f_stat:.3f}, p = {p_value:.3f}). "
                    f"At least one of the {len(endogenous_vars)} endogenous variables "
                    "appears correlated with the error term. 2SLS is preferred over OLS."
                ) if endogenous else (
                    f"No significant joint endogeneity detected (F = {f_stat:.3f}, p = {p_value:.3f}). "
                    "OLS may be consistent, but 2SLS remains valid if the exclusion "
                    "restriction holds."
                ),
                "interpretation": (
                    "Reject H0 (endogeneity present)" if endogenous
                    else "Fail to reject H0 (variables may be exogenous)"
                ),
            }
        except Exception as e:
            return {
                "statistic": None,
                "p_value": None,
                "endogenous": None,
                "error": f"Joint F-test failed: {str(e)}",
            }


def _sargan_hansen_test(
    df: pd.DataFrame,
    iv_residuals: np.ndarray,
    instrument_vars: List[str],
    control_vars: List[str],
    n_endogenous: int = 1,
) -> Dict[str, Any]:
    """
    Sargan-Hansen overidentification test.

    Only meaningful when n_instruments > n_endogenous (overidentified model).

    H0: all instruments are valid (orthogonal to structural error)
    H1: at least one instrument is invalid

    Test statistic: J = n * R² of regressing 2SLS residuals on all instruments
    + controls. Under H0, J ~ χ²(n_instruments - n_endogenous).
    """
    controls = control_vars or []
    n_inst = len(instrument_vars)
    df = df.copy()
    df["_iv_resid"] = iv_residuals

    rhs = " + ".join(
        [_quote(z) for z in instrument_vars] + [_quote(c) for c in controls]
    )
    formula = f"_iv_resid ~ {rhs}"
    model = smf.ols(formula, data=df).fit()

    n = int(model.nobs)
    r2 = float(model.rsquared)
    j_stat = n * r2
    dof = n_inst - n_endogenous   # degrees of freedom = over-identification count
    p_value = float(chi2.sf(j_stat, df=dof)) if dof > 0 else None

    if p_value is None:
        return {
            "j_statistic": None,
            "p_value": None,
            "dof": dof,
            "n_instruments": n_inst,
            "message": "Model is exactly identified — overidentification test not applicable.",
        }

    rejected = p_value < 0.05
    if rejected:
        message = (
            f"Overidentification test rejected (J = {j_stat:.3f}, p = {p_value:.3f}). "
            f"At least one instrument may be correlated with the structural error — "
            "the exclusion restriction may be violated."
        )
    else:
        message = (
            f"Overidentification test not rejected (J = {j_stat:.3f}, p = {p_value:.3f}). "
            "Consistent with all instruments satisfying the exclusion restriction. "
            "Note: this test cannot detect violations when only one instrument is invalid."
        )

    return {
        "j_statistic": round(j_stat, 4),
        "p_value": round(p_value, 4),
        "dof": dof,
        "n_instruments": n_inst,
        "rejected": rejected,
        "message": message,
        "interpretation": (
            "Reject H0: instruments may be invalid"
            if rejected
            else "Fail to reject H0: instruments appear valid"
        ),
    }


# ---------------------------------------------------------------------------
# Sensitivity analyses
# ---------------------------------------------------------------------------

def _liml_comparison(
    data: pd.DataFrame,
    outcome_var: str,
    treatment_var: str,
    instrument_vars: List[str],
    control_vars: List[str],
    additional_endogenous: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    For just-identified IV: return the Anderson-Rubin confidence interval,
    which is valid even under weak instruments.
    """
    additional_endogenous = additional_endogenous or []

    # Collect all columns
    all_endog = [treatment_var] + [e["variable"] for e in additional_endogenous]
    all_inst = list(instrument_vars) + [e["instrument"] for e in additional_endogenous]
    all_cols = list(set(
        [outcome_var] + all_endog + all_inst + (control_vars or [])
    ))

    df = data[all_cols].copy()
    for c in all_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna()

    controls = control_vars or []
    z = instrument_vars[0]

    # Anderson-Rubin statistic over a grid of b0 values for primary treatment
    tsls_est = IVEstimator(df, outcome_var, treatment_var,
                           instrument_vars, controls,
                           additional_endogenous).estimate()
    tau_hat = tsls_est["treatment_effect"]
    se_hat = tsls_est["se"]

    # Grid: ±5 SEs around the 2SLS estimate
    grid = np.linspace(tau_hat - 5 * se_hat, tau_hat + 5 * se_hat, 200)
    ar_pvals = []
    for b0 in grid:
        df_tmp = df.copy()
        df_tmp["_ar_y"] = df_tmp[outcome_var] - b0 * df_tmp[treatment_var]
        rhs = " + ".join([_quote(z)] + [_quote(c) for c in controls])
        m = smf.ols(f"_ar_y ~ {rhs}", data=df_tmp).fit()
        pname = _param_name(m, z)
        ar_pvals.append(float(m.pvalues[pname]) if pname else 1.0)

    ar_pvals = np.array(ar_pvals)
    in_ci = ar_pvals >= 0.05
    ar_ci_lower = float(grid[in_ci].min()) if in_ci.any() else None
    ar_ci_upper = float(grid[in_ci].max()) if in_ci.any() else None

    return {
        "type": "anderson_rubin_ci",
        "description": (
            "Anderson-Rubin 95% confidence interval. Valid even with weak "
            "instruments; tends to be wider than the 2SLS Wald CI when "
            "instruments are weak."
        ),
        "ar_ci_lower": round(ar_ci_lower, 4) if ar_ci_lower is not None else None,
        "ar_ci_upper": round(ar_ci_upper, 4) if ar_ci_upper is not None else None,
        "tsls_ci_lower": tsls_est["ci_lower"],
        "tsls_ci_upper": tsls_est["ci_upper"],
        "note": (
            "If the AR CI is much wider than the 2SLS Wald CI, weak instruments "
            "are a concern and you should rely on the AR CI."
        ),
    }


def _leave_one_out_instruments(
    data: pd.DataFrame,
    outcome_var: str,
    treatment_var: str,
    instrument_vars: List[str],
    control_vars: List[str],
    additional_endogenous: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Leave-one-out sensitivity: re-run 2SLS dropping each primary instrument
    in turn (only for the primary treatment's instruments).
    """
    additional_endogenous = additional_endogenous or []

    all_endog = [treatment_var] + [e["variable"] for e in additional_endogenous]
    all_inst = list(instrument_vars) + [e["instrument"] for e in additional_endogenous]
    all_cols = list(set(
        [outcome_var] + all_endog + all_inst + (control_vars or [])
    ))

    df = data[all_cols].copy()
    for c in all_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna()

    results = []
    # Only drop primary treatment instruments (not additional endog instruments)
    for drop_z in instrument_vars:
        remaining = [z for z in instrument_vars if z != drop_z]
        if not remaining:
            continue
        # Check we still satisfy order condition
        total_inst = len(remaining) + len([e["instrument"] for e in additional_endogenous])
        total_endog = len(all_endog)
        if total_inst < total_endog:
            results.append({
                "dropped_instrument": drop_z,
                "remaining_instruments": remaining,
                "error": "Under-identified after dropping this instrument.",
            })
            continue
        try:
            est = IVEstimator(df, outcome_var, treatment_var,
                              remaining, control_vars,
                              additional_endogenous).estimate()
            results.append({
                "dropped_instrument": drop_z,
                "remaining_instruments": remaining,
                "treatment_effect": est["treatment_effect"],
                "se": est["se"],
                "ci_lower": est["ci_lower"],
                "ci_upper": est["ci_upper"],
                "p_value": est["p_value"],
                "first_stage_f": est["first_stage"]["f_statistic"],
            })
        except Exception as e:
            results.append({
                "dropped_instrument": drop_z,
                "remaining_instruments": remaining,
                "error": str(e),
            })

    effects = [r["treatment_effect"] for r in results if "treatment_effect" in r]
    if len(effects) >= 2:
        effect_range = max(effects) - min(effects)
        mean_effect = np.mean(effects)
        stable = (effect_range / abs(mean_effect) < 0.30) if abs(mean_effect) > 1e-6 else True
        stability_msg = (
            "Estimates are stable across dropped-instrument specifications."
            if stable else
            "Estimates vary noticeably across dropped-instrument specifications. "
            "This may indicate that some instruments are invalid."
        )
    else:
        stable = None
        stability_msg = "Not enough results to assess stability."

    return {
        "type": "leave_one_out",
        "description": (
            "Re-estimates 2SLS dropping one instrument at a time. "
            "Stable estimates across specifications suggest results are not "
            "driven by any single (potentially invalid) instrument."
        ),
        "results": results,
        "stable": stable,
        "stability_message": stability_msg,
    }


# ---------------------------------------------------------------------------
# Interpretation helpers
# ---------------------------------------------------------------------------

def _interpret_ols_gap(
    gap: float,
    iv_estimate: float,
    ols_estimate_val: float,
) -> str:
    """
    Plain-English interpretation of the IV vs OLS difference.
    """
    if abs(iv_estimate) < 1e-8:
        return (
            "The IV estimate is near zero, so the OLS-IV gap is uninformative "
            "about the direction of endogeneity bias."
        )

    pct = abs(gap / ols_estimate_val) * 100 if abs(ols_estimate_val) > 1e-8 else float("inf")

    if abs(gap) < 0.05 * abs(ols_estimate_val):
        return (
            "OLS and IV estimates are very similar, suggesting little endogeneity "
            "bias. The instrument may not be correcting much, or treatment is "
            "approximately exogenous."
        )
    elif gap > 0:
        return (
            f"The IV estimate ({iv_estimate:.3f}) is larger than OLS "
            f"({ols_estimate_val:.3f}) by {gap:.3f} ({pct:.1f}%). "
            "This is consistent with OLS downward bias — e.g., selection of "
            "lower-ability individuals into treatment (attenuation) or "
            "treatment endogenously received by those who benefit less."
        )
    else:
        return (
            f"The IV estimate ({iv_estimate:.3f}) is smaller than OLS "
            f"({ols_estimate_val:.3f}) by {abs(gap):.3f} ({pct:.1f}%). "
            "This is consistent with OLS upward bias — e.g., higher-ability "
            "individuals selecting into treatment."
        )
