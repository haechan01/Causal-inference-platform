"""
Core Regression Discontinuity (RD) estimation.

Phase 0: scaffolding only.

Planned:
- Sharp RD local polynomial estimation with triangular kernel weights
- HC2 robust standard errors via statsmodels WLS
- IK bandwidth selection + sensitivity analysis
"""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import norm

from .rd_helpers import (
    bandwidth_sanity_warnings,
    compute_running_var_range,
    create_polynomial_features,
    triangular_kernel,
    validate_polynomial_order,
)
from .rd_bandwidth import imbens_kalyanaraman_bandwidth


class RDEstimator:
    """
    Regression Discontinuity (sharp RD) estimator.

    Phase 0: class stub only. Public API is defined now so later PRs can
    implement internals without changing call sites.
    """

    def __init__(
        self,
        data: pd.DataFrame,
        running_var: str,
        outcome_var: str,
        cutoff: float,
        treatment_side: str = 'above'
    ):
        self.data = data
        self.running_var = running_var
        self.outcome_var = outcome_var
        self.cutoff = float(cutoff)
        self.treatment_side = treatment_side

    def calculate_optimal_bandwidth(self) -> Dict[str, Any]:
        """
        Calculate optimal bandwidth (default: Imbens-Kalyanaraman).

        Returns:
          {
            "bandwidth": float,
            "method": str,
            "diagnostics": dict,
            "warnings": list[str]
          }
        """
        return imbens_kalyanaraman_bandwidth(
            data=self.data,
            running_var=self.running_var,
            outcome_var=self.outcome_var,
            cutoff=self.cutoff,
        )

    def estimate(
        self,
        bandwidth: float,
        polynomial_order: int = 1,
    ) -> Dict[str, Any]:
        """
        Estimate RD treatment effect at cutoff for a given bandwidth.

        Method:
        - Center running variable at cutoff: X = running_var - cutoff
        - Keep observations within |X| <= bandwidth
        - Fit separate local polynomial regressions on each side
        - Use triangular kernel weights
        - Use statsmodels WLS with HC2 robust standard errors
        - Treatment effect is the difference in intercepts at cutoff

        Returns a dict with treatment_effect, standard error, CI, p-value,
        sample sizes, and non-fatal warnings/diagnostics.
        """
        # ---- Validate inputs ----
        if self.running_var not in self.data.columns:
            raise ValueError(
                f"running_var '{self.running_var}' not found in dataset "
                "columns."
            )
        if self.outcome_var not in self.data.columns:
            raise ValueError(
                f"outcome_var '{self.outcome_var}' not found in dataset "
                "columns."
            )

        if bandwidth is None or float(bandwidth) <= 0:
            raise ValueError("bandwidth must be a positive number.")

        order = validate_polynomial_order(int(polynomial_order))
        h = float(bandwidth)

        # ---- Prepare working frame (do not mutate user frame) ----
        df = self.data[[self.running_var, self.outcome_var]].copy()

        # Coerce to numeric for safety
        df[self.running_var] = pd.to_numeric(
            df[self.running_var],
            errors="coerce",
        )
        df[self.outcome_var] = pd.to_numeric(
            df[self.outcome_var],
            errors="coerce",
        )
        df = df.dropna(subset=[self.running_var, self.outcome_var])
        if df.empty:
            raise ValueError(
                "No valid numeric rows found after converting running/outcome "
                "variables to numeric."
            )

        df["X_centered"] = df[self.running_var] - self.cutoff
        
        if self.treatment_side == 'below':
            df["treated"] = (df[self.running_var] < self.cutoff).astype(int)
        else:
            df["treated"] = (df[self.running_var] >= self.cutoff).astype(int)

        in_bw = df["X_centered"].abs() <= h
        df_bw = df.loc[in_bw].copy()
        if df_bw.empty:
            raise ValueError(
                "No observations fall within the selected bandwidth. "
                "Increase the bandwidth and try again."
            )

        # Minimum sample size checks
        n_total = int(df_bw.shape[0])
        n_treated = int((df_bw["treated"] == 1).sum())
        n_control = int((df_bw["treated"] == 0).sum())

        if n_total < 20:
            raise ValueError(
                f"Not enough observations within bandwidth "
                f"(found {n_total}, need at least 20). "
                "Try increasing the bandwidth."
            )
        if n_treated < 10 or n_control < 10:
            side_above = "at/above"
            side_below = "below"
            n_above = int((df_bw[self.running_var] >= self.cutoff).sum())
            n_below = int((df_bw[self.running_var] < self.cutoff).sum())
            
            raise ValueError(
                "Not enough observations on both sides of the cutoff "
                "within the bandwidth. "
                f"Found {n_below} below cutoff and {n_above} at/above "
                "cutoff (need at least 10 each). "
                "Try increasing the bandwidth."
            )

        # ---- Diagnostics / warnings ----
        running_range = compute_running_var_range(df[self.running_var])
        diag = bandwidth_sanity_warnings(h, running_range)
        warnings = list(diag.warnings)

        # ---- Split data ----
        treated_df = df_bw[df_bw["treated"] == 1].copy()
        control_df = df_bw[df_bw["treated"] == 0].copy()

        # ---- Weights ----
        w_t = triangular_kernel(treated_df["X_centered"], h)
        w_c = triangular_kernel(control_df["X_centered"], h)

        # Guard: if kernel produced all zeros (shouldn't happen given in_bw
        # filter, but defensive)
        if np.all(w_t == 0) or np.all(w_c == 0):
            raise ValueError(
                "Kernel weights are zero within bandwidth. "
                "Increase the bandwidth and try again."
            )

        # ---- Design matrices ----
        X_t = create_polynomial_features(treated_df["X_centered"], order=order)
        X_c = create_polynomial_features(control_df["X_centered"], order=order)
        X_t = sm.add_constant(X_t, has_constant="add")
        X_c = sm.add_constant(X_c, has_constant="add")

        y_t = treated_df[self.outcome_var].to_numpy(dtype=float)
        y_c = control_df[self.outcome_var].to_numpy(dtype=float)

        # ---- Fit WLS with HC2 robust covariance ----
        model_t = sm.WLS(y_t, X_t, weights=w_t).fit(cov_type="HC2")
        model_c = sm.WLS(y_c, X_c, weights=w_c).fit(cov_type="HC2")

        # Intercept is constant term (index 0)
        tau = float(model_t.params[0] - model_c.params[0])
        se_tau = float(np.sqrt((model_t.bse[0] ** 2) + (model_c.bse[0] ** 2)))

        if not np.isfinite(se_tau) or se_tau <= 0:
            raise ValueError(
                "Standard error could not be computed reliably. "
                "Try a different bandwidth."
            )

        z = float(tau / se_tau)
        p_value = float(2.0 * norm.sf(abs(z)))

        z_crit = float(norm.ppf(0.975))
        ci_lower = float(tau - z_crit * se_tau)
        ci_upper = float(tau + z_crit * se_tau)

        return {
            "treatment_effect": tau,
            "se": se_tau,
            "ci_lower": ci_lower,
            "ci_upper": ci_upper,
            "p_value": p_value,
            "bandwidth_used": h,
            "n_treated": n_treated,
            "n_control": n_control,
            "n_total": n_total,
            "polynomial_order": order,
            "kernel": "triangular",
            "treatment_side": self.treatment_side,
            "warnings": warnings,
            "diagnostics": {
                "running_var_range": diag.running_var_range,
                "bandwidth_fraction_of_range": (
                    diag.bandwidth_fraction_of_range
                ),
            },
        }

    def estimate_fuzzy(
        self,
        treatment_var: str,
        bandwidth: float,
        polynomial_order: int = 1,
    ) -> Dict[str, Any]:
        """
        Fuzzy RD estimation using the Wald ratio (Local Average Treatment Effect).

        In Fuzzy RDD the cutoff rule is only suggestive — not all assigned units
        receive treatment, and some unassigned units do. The LATE is:

            tau_LATE = (jump in Y at cutoff) / (jump in D at cutoff)
                     = Reduced Form / First Stage

        Both numerator and denominator are estimated with the same local
        polynomial + triangular kernel approach as Sharp RD. Standard errors
        are obtained via the delta method.

        Parameters
        ----------
        treatment_var : str
            Column indicating whether each unit actually *received* treatment
            (1/0 or True/False). This is distinct from crossing the cutoff.
        bandwidth : float
        polynomial_order : int
        """
        if treatment_var not in self.data.columns:
            raise ValueError(
                f"treatment_var '{treatment_var}' not found in dataset columns."
            )
        if self.running_var not in self.data.columns:
            raise ValueError(f"running_var '{self.running_var}' not found.")
        if self.outcome_var not in self.data.columns:
            raise ValueError(f"outcome_var '{self.outcome_var}' not found.")

        if bandwidth is None or float(bandwidth) <= 0:
            raise ValueError("bandwidth must be a positive number.")

        order = validate_polynomial_order(int(polynomial_order))
        h = float(bandwidth)

        # ---- Prepare working frame ----
        all_cols = [self.running_var, self.outcome_var, treatment_var]
        df = self.data[all_cols].copy()
        for col in all_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df = df.dropna(subset=all_cols)

        if df.empty:
            raise ValueError(
                "No complete numeric rows found after cleaning the data."
            )

        df["X_centered"] = df[self.running_var] - self.cutoff

        # Assignment indicator: did the running variable cross the cutoff?
        if self.treatment_side == "below":
            df["assigned"] = (df[self.running_var] < self.cutoff).astype(int)
        else:
            df["assigned"] = (df[self.running_var] >= self.cutoff).astype(int)

        in_bw = df["X_centered"].abs() <= h
        df_bw = df.loc[in_bw].copy()

        if df_bw.empty:
            raise ValueError(
                "No observations fall within the selected bandwidth."
            )

        n_total = int(df_bw.shape[0])
        n_assigned = int((df_bw["assigned"] == 1).sum())
        n_not_assigned = int((df_bw["assigned"] == 0).sum())

        if n_total < 20:
            raise ValueError(
                f"Not enough observations within bandwidth (found {n_total}, "
                "need at least 20)."
            )
        if n_assigned < 10 or n_not_assigned < 10:
            raise ValueError(
                "Not enough observations on both sides of the cutoff within "
                f"the bandwidth (assigned={n_assigned}, "
                f"not_assigned={n_not_assigned}, need at least 10 each)."
            )

        # ---- Diagnostics ----
        running_range = compute_running_var_range(df[self.running_var])
        diag = bandwidth_sanity_warnings(h, running_range)
        warnings: List[str] = list(diag.warnings)

        # ---- Split by assignment ----
        asgn_df = df_bw[df_bw["assigned"] == 1].copy()
        ctrl_df = df_bw[df_bw["assigned"] == 0].copy()

        w_a = triangular_kernel(asgn_df["X_centered"], h)
        w_c = triangular_kernel(ctrl_df["X_centered"], h)

        X_a = sm.add_constant(
            create_polynomial_features(asgn_df["X_centered"], order=order),
            has_constant="add",
        )
        X_c = sm.add_constant(
            create_polynomial_features(ctrl_df["X_centered"], order=order),
            has_constant="add",
        )

        # ---- Reduced form: Sharp RD on outcome Y ----
        y_a = asgn_df[self.outcome_var].to_numpy(dtype=float)
        y_c = ctrl_df[self.outcome_var].to_numpy(dtype=float)
        m_a_Y = sm.WLS(y_a, X_a, weights=w_a).fit(cov_type="HC2")
        m_c_Y = sm.WLS(y_c, X_c, weights=w_c).fit(cov_type="HC2")

        tau_Y = float(m_a_Y.params[0] - m_c_Y.params[0])
        se_Y = float(np.sqrt(m_a_Y.bse[0] ** 2 + m_c_Y.bse[0] ** 2))

        # ---- First stage: Sharp RD on treatment receipt D ----
        d_a = asgn_df[treatment_var].to_numpy(dtype=float)
        d_c = ctrl_df[treatment_var].to_numpy(dtype=float)
        m_a_D = sm.WLS(d_a, X_a, weights=w_a).fit(cov_type="HC2")
        m_c_D = sm.WLS(d_c, X_c, weights=w_c).fit(cov_type="HC2")

        tau_D = float(m_a_D.params[0] - m_c_D.params[0])
        se_D = float(np.sqrt(m_a_D.bse[0] ** 2 + m_c_D.bse[0] ** 2))

        if abs(tau_D) < 1e-10:
            raise ValueError(
                "First stage is essentially zero: the cutoff produces no "
                "meaningful jump in treatment receipt. Verify that your "
                "treatment_var column actually records treatment receipt and "
                "that the cutoff affects who receives treatment."
            )

        # ---- Fuzzy LATE via Wald ratio ----
        tau_fuzzy = tau_Y / tau_D

        # Delta method SE (ignoring cross-equation covariance — conservative)
        se_fuzzy = float(
            np.sqrt((se_Y / tau_D) ** 2 + (tau_Y * se_D / tau_D ** 2) ** 2)
        )

        if not np.isfinite(se_fuzzy) or se_fuzzy <= 0:
            raise ValueError(
                "Standard error could not be computed. Try a different bandwidth."
            )

        z_stat = tau_fuzzy / se_fuzzy
        p_value = float(2.0 * norm.sf(abs(z_stat)))
        z_crit = float(norm.ppf(0.975))
        ci_lower = tau_fuzzy - z_crit * se_fuzzy
        ci_upper = tau_fuzzy + z_crit * se_fuzzy

        # ---- Compliance rates ----
        compliance_assigned = float(asgn_df[treatment_var].mean())
        compliance_not_assigned = float(ctrl_df[treatment_var].mean())

        if abs(tau_D) < 0.05:
            warnings.append(
                f"Weak first stage: the jump in treatment receipt at the "
                f"cutoff is only {tau_D:.3f}. The LATE estimate may be "
                "imprecise. Consider whether the cutoff truly affects "
                "treatment receipt."
            )

        return {
            # Primary LATE result
            "treatment_effect": tau_fuzzy,
            "se": se_fuzzy,
            "ci_lower": ci_lower,
            "ci_upper": ci_upper,
            "p_value": p_value,
            "bandwidth_used": h,
            "n_treated": n_assigned,     # units above/below cutoff (assigned)
            "n_control": n_not_assigned,
            "n_total": n_total,
            "polynomial_order": order,
            "kernel": "triangular",
            "treatment_side": self.treatment_side,
            # Fuzzy-specific diagnostics
            "rd_type": "fuzzy",
            "reduced_form_effect": tau_Y,
            "reduced_form_se": se_Y,
            "first_stage_effect": tau_D,
            "first_stage_se": se_D,
            "compliance_rate_assigned": compliance_assigned,
            "compliance_rate_not_assigned": compliance_not_assigned,
            "warnings": warnings,
            "diagnostics": {
                "running_var_range": diag.running_var_range,
                "bandwidth_fraction_of_range": diag.bandwidth_fraction_of_range,
            },
        }

    def sensitivity_analysis(self, n_bandwidths: int = 20) -> Dict[str, Any]:
        """
        Sensitivity analysis over a bandwidth grid.

        Bandwidth grid:
          0.3*h_opt .. 2.5*h_opt  (n_bandwidths points)

        For each bandwidth, runs estimate() and returns results suitable for
        plotting.
        """
        if n_bandwidths is None or int(n_bandwidths) < 5:
            raise ValueError("n_bandwidths must be at least 5.")

        opt = self.calculate_optimal_bandwidth()
        h_opt = float(opt["bandwidth"])

        hs = np.linspace(0.3 * h_opt, 2.5 * h_opt, int(n_bandwidths))

        results: list[Dict[str, Any]] = []
        effects: list[float] = []

        for h in hs:
            try:
                est = self.estimate(bandwidth=float(h), polynomial_order=1)
                results.append(
                    {
                        "bandwidth": float(h),
                        "treatment_effect": est["treatment_effect"],
                        "ci_lower": est["ci_lower"],
                        "ci_upper": est["ci_upper"],
                        "se": est["se"],
                        "p_value": est["p_value"],
                        "n_total": est["n_total"],
                    }
                )
                effects.append(float(est["treatment_effect"]))
            except Exception as e:
                results.append(
                    {
                        "bandwidth": float(h),
                        "treatment_effect": None,
                        "ci_lower": None,
                        "ci_upper": None,
                        "se": None,
                        "p_value": None,
                        "n_total": None,
                        "error": str(e),
                    }
                )

        stability = _stability_from_effects(effects)

        return {
            "results": results,
            "optimal_bandwidth": h_opt,
            "stability_coefficient": stability["cv"],  # Deprecated, kept for API compatibility
            "stability_std": stability["std"],
            "stability_range": stability["range"],
            "stability_mean": stability["mean"],
            "interpretation": stability["interpretation"],
            "bandwidth_method": opt.get("method"),
            "bandwidth_warnings": opt.get("warnings", []),
        }


def _stability_from_effects(effects: list[float]) -> Dict[str, Any]:
    """
    Assess stability of treatment effects across bandwidth choices.

    Uses standard deviation and range-based metrics rather than coefficient
    of variation (CV), since CV is inappropriate for quantities that can be
    zero or negative.

    Returns:
      {
        "cv": None,  # Deprecated, kept for backward compatibility
        "std": float,
        "range": float,
        "mean": float,
        "interpretation": {...}
      }
    """
    if len(effects) < 3:
        return {
            "cv": None,
            "std": None,
            "range": None,
            "mean": None,
            "interpretation": {
                "stability": "unknown",
                "message": (
                    "Not enough successful bandwidth fits to assess stability."
                ),
            },
        }

    arr = np.asarray(effects, dtype=float)
    mean = float(np.mean(arr))
    std = float(np.std(arr, ddof=1)) if arr.size > 1 else 0.0
    effect_range = float(np.max(arr) - np.min(arr))

    # Assess stability based on absolute variability:
    # - For near-zero effects, use standard deviation alone
    # - For larger effects, use range relative to mean magnitude

    abs_mean = abs(mean)

    # If mean effect is very small (< 0.1), assess based on std alone
    if abs_mean < 0.1:
        if std < 0.05:
            stability = "highly_stable"
            msg = (
                f"Your estimated effect is consistently near zero "
                f"(std = {std:.3f}), showing strong stability across "
                f"bandwidth choices."
            )
        elif std < 0.15:
            stability = "moderately_stable"
            msg = (
                f"Your estimated effect is near zero with modest variation "
                f"(std = {std:.3f}) across bandwidth choices."
            )
        else:
            stability = "unstable"
            msg = (
                f"Your estimated effect shows substantial variation "
                f"(std = {std:.3f}) across bandwidth choices; "
                f"interpret with caution."
            )
    else:
        # For non-trivial effects, use range relative to mean magnitude
        relative_range = (
            effect_range / abs_mean if abs_mean > 0 else float("inf")
        )

        if relative_range < 0.30:
            stability = "highly_stable"
            msg = (
                f"Your estimated effect (mean = {mean:.3f}) is very "
                f"consistent across bandwidth choices "
                f"(range/|mean| = {relative_range:.2f})."
            )
        elif relative_range < 0.60:
            stability = "moderately_stable"
            msg = (
                f"Your estimated effect (mean = {mean:.3f}) changes "
                f"somewhat as bandwidth changes "
                f"(range/|mean| = {relative_range:.2f})."
            )
        else:
            stability = "unstable"
            msg = (
                f"Your estimated effect (mean = {mean:.3f}) changes "
                f"substantially across bandwidths "
                f"(range/|mean| = {relative_range:.2f}); "
                f"interpret with caution."
            )

    return {
        "cv": None,  # Deprecated: CV is not appropriate for treatment effects
        "std": std,
        "range": effect_range,
        "mean": mean,
        "interpretation": {
            "stability": stability,
            "message": msg,
        },
    }
