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


    # ------------------------------------------------------------------
    # Placebo Cutoff Test
    # ------------------------------------------------------------------

    def placebo_cutoff_test(
        self,
        bandwidth: float,
        polynomial_order: int = 1,
        n_placebos: int = 20,
    ) -> Dict[str, Any]:
        """
        Placebo cutoff test: apply RD at many fake cutoff values away from
        the real cutoff.

        Under the continuity assumption there should be no jump in the outcome
        at arbitrary points of the running variable.  If we detect large
        "effects" at fake cutoffs, that suggests the running variable predicts
        the outcome through channels other than the treatment — a sign that
        the continuity assumption may be violated.

        Strategy
        --------
        1. Place n_placebos fake cutoffs spread over the portion of the
           running-variable support that is NOT used by the real estimate
           (i.e. outside [cutoff - bandwidth, cutoff + bandwidth]).
        2. For each fake cutoff, run the same local polynomial estimator
           with the same bandwidth.
        3. Compare the distribution of fake effects to the real effect.

        Returns
        -------
        dict with placebo_estimates, pseudo_p_value, passed, message,
        chart_data (for a dot-plot).
        """
        df = self.data[[self.running_var, self.outcome_var]].copy()
        df[self.running_var] = pd.to_numeric(df[self.running_var], errors="coerce")
        df[self.outcome_var] = pd.to_numeric(df[self.outcome_var], errors="coerce")
        df = df.dropna(subset=[self.running_var, self.outcome_var])

        if df.empty:
            return _empty_placebo_cutoff_result(
                "No valid data after cleaning."
            )

        order = validate_polynomial_order(int(polynomial_order))
        h = float(bandwidth)
        c = self.cutoff
        rv = df[self.running_var]

        rv_min, rv_max = float(rv.min()), float(rv.max())

        # Safe zones for fake cutoffs: left side and right side, each
        # requiring at least `h` gap from the real cutoff.
        left_max  = c - h - (rv_max - rv_min) * 0.02   # leave 2% buffer
        left_min  = rv_min + h + (rv_max - rv_min) * 0.02
        right_min = c + h + (rv_max - rv_min) * 0.02
        right_max = rv_max - h - (rv_max - rv_min) * 0.02

        candidates: List[float] = []
        n_each = n_placebos // 2

        if left_min < left_max:
            candidates += list(np.linspace(left_min, left_max, n_each))
        if right_min < right_max:
            candidates += list(np.linspace(right_min, right_max, n_each))

        if not candidates:
            return _empty_placebo_cutoff_result(
                "Not enough running-variable support away from the cutoff "
                "to place placebo cutoffs. Try a smaller bandwidth."
            )

        placebo_estimates: List[Dict[str, Any]] = []
        real_result = None
        try:
            real_result = self.estimate(bandwidth=h, polynomial_order=order)
        except Exception:
            pass
        real_effect = real_result["treatment_effect"] if real_result else None

        for fake_c in candidates:
            try:
                fake_rd = RDEstimator(
                    data=df,
                    running_var=self.running_var,
                    outcome_var=self.outcome_var,
                    cutoff=fake_c,
                    treatment_side=self.treatment_side,
                )
                est = fake_rd.estimate(bandwidth=h, polynomial_order=order)
                placebo_estimates.append({
                    "fake_cutoff": round(float(fake_c), 4),
                    "estimate":    round(float(est["treatment_effect"]), 4),
                    "se":          round(float(est["se"]), 4),
                    "ci_lower":    round(float(est["ci_lower"]), 4),
                    "ci_upper":    round(float(est["ci_upper"]), 4),
                    "p_value":     round(float(est["p_value"]), 4),
                    "n_total":     est["n_total"],
                    "is_significant": bool(est["p_value"] < 0.05),
                })
            except Exception:
                continue

        if not placebo_estimates:
            return _empty_placebo_cutoff_result(
                "No placebo estimates could be computed. "
                "Try a larger dataset or smaller bandwidth."
            )

        n_total = len(placebo_estimates)
        n_sig   = sum(1 for e in placebo_estimates if e["is_significant"])
        fpr     = round(n_sig / n_total * 100, 1)

        # Pseudo p-value: fraction of |placebo effects| >= |real effect|
        pseudo_p = None
        rank_pct = None
        passed   = None

        if real_effect is not None and np.isfinite(real_effect):
            abs_real = abs(real_effect)
            abs_plc  = [abs(e["estimate"]) for e in placebo_estimates]
            pseudo_p = round(sum(1 for v in abs_plc if v >= abs_real) / n_total, 4)
            rank_pct = round(
                sum(1 for v in abs_plc if v < abs_real) / n_total * 100, 1
            )
            passed   = pseudo_p <= 0.05

        # Human-readable message
        if pseudo_p is not None:
            if passed:
                message = (
                    f"✅ Placebo cutoff test passed. The real effect at {c} is more "
                    f"extreme than {rank_pct}% of placebo estimates "
                    f"(pseudo p = {pseudo_p:.3f}). This supports the continuity assumption."
                )
            else:
                message = (
                    f"⚠️ Placebo cutoff test inconclusive. The real effect at {c} is not "
                    f"clearly more extreme than the placebo distribution "
                    f"(pseudo p = {pseudo_p:.3f}). Interpret results with caution."
                )
        else:
            if fpr <= 10:
                message = (
                    f"✅ Only {n_sig}/{n_total} ({fpr}%) placebo cutoffs show significant "
                    f"effects, consistent with the expected 5% false-positive rate."
                )
            else:
                message = (
                    f"⚠️ {n_sig}/{n_total} ({fpr}%) placebo cutoffs show significant "
                    f"effects — more than the expected 5%. The outcome may not be smooth "
                    f"along the running variable."
                )

        chart_data = {
            "placeboEstimates": placebo_estimates,
            "realCutoff":       round(float(c), 4),
            "realEffect":       round(float(real_effect), 4) if real_effect is not None else None,
            "pseudoPValue":     pseudo_p,
            "xAxisLabel":       f"{self.running_var} (fake cutoff value)",
            "yAxisLabel":       f"Estimated Effect on {self.outcome_var}",
            "title":            "Placebo Cutoff Test",
        }

        return {
            "placebo_estimates": placebo_estimates,
            "n_total":           n_total,
            "n_significant":     n_sig,
            "false_positive_rate": fpr,
            "pseudo_p_value":    pseudo_p,
            "rank_pct":          rank_pct,
            "real_effect":       (round(float(real_effect), 4)
                                  if real_effect is not None else None),
            "passed":            passed,
            "message":           message,
            "chart_data":        chart_data,
        }

    # ------------------------------------------------------------------
    # Density / Manipulation Test  (simplified McCrary 2008)
    # ------------------------------------------------------------------

    def density_test(self, n_bins: int = 30) -> Dict[str, Any]:
        """
        Test for a discontinuity in the density of the running variable at
        the cutoff (McCrary 2008 / sorting test).

        Method
        ------
        1. Bin the running variable into ``n_bins`` equal-width bins.
        2. Fit separate weighted local linear regressions (triangular kernel)
           on the bin counts (normalised to density) on each side of the
           cutoff.
        3. The test statistic is the difference in extrapolated densities at
           the cutoff, divided by the pooled SE (both via OLS, HC2 errors).
        4. Return a Z-statistic, p-value, and rich chart data for the
           frontend histogram.

        Returns
        -------
        dict with z_stat, p_value, passed, message, chart_data
        """
        df = self.data[[self.running_var]].copy()
        df[self.running_var] = pd.to_numeric(df[self.running_var], errors="coerce")
        df = df.dropna(subset=[self.running_var])

        if df.empty or len(df) < 20:
            return _empty_density_result("Not enough data to run the density test.")

        rv   = df[self.running_var].values
        c    = self.cutoff
        n    = len(rv)

        rv_min, rv_max = float(rv.min()), float(rv.max())
        if rv_min >= rv_max:
            return _empty_density_result("Running variable has zero range.")

        # ---- Build histogram bins ----
        bin_width = (rv_max - rv_min) / n_bins
        bin_edges = np.linspace(rv_min, rv_max, n_bins + 1)
        bin_mids  = 0.5 * (bin_edges[:-1] + bin_edges[1:])
        bin_counts = np.histogram(rv, bins=bin_edges)[0].astype(float)
        # Normalise to density (probability per unit width)
        bin_density = bin_counts / (n * bin_width)

        # ---- Split bins by side ----
        left_mask  = bin_mids < c
        right_mask = bin_mids >= c

        if left_mask.sum() < 2 or right_mask.sum() < 2:
            return _empty_density_result(
                "Not enough bins on both sides of the cutoff. "
                "Try adjusting n_bins."
            )

        def _fit_side(mids, densities, cutoff_val, side_name):
            """Fit local linear regression and extrapolate to cutoff."""
            x  = mids - cutoff_val          # center at cutoff
            y  = densities
            # triangular weights: bins closer to cutoff get higher weight
            bw_side = abs(x).max()
            w  = np.maximum(1.0 - abs(x) / (bw_side + 1e-10), 0.0)
            w  = np.maximum(w, 1e-6)        # avoid zero weights
            X  = sm.add_constant(x, has_constant="add")
            try:
                model = sm.WLS(y, X, weights=w).fit(cov_type="HC2")
                intercept     = float(model.params[0])   # density at cutoff
                intercept_se  = float(model.bse[0])
                return intercept, intercept_se, model
            except Exception:
                return None, None, None

        left_interp,  left_se,  _  = _fit_side(
            bin_mids[left_mask],  bin_density[left_mask],  c, "left"
        )
        right_interp, right_se, _  = _fit_side(
            bin_mids[right_mask], bin_density[right_mask], c, "right"
        )

        if left_interp is None or right_interp is None:
            return _empty_density_result(
                "Could not fit density regressions on one or both sides."
            )

        # ---- Test statistic ----
        diff    = right_interp - left_interp
        diff_se = float(np.sqrt(left_se ** 2 + right_se ** 2))
        z_stat  = diff / diff_se if diff_se > 1e-10 else 0.0
        p_value = float(2.0 * norm.sf(abs(z_stat)))
        passed  = p_value >= 0.05   # we WANT to fail to reject (no jump)

        # ---- Smooth fitted lines for chart (50 points each side) ----
        def _smooth_curve(mids, densities, cutoff_val):
            x   = mids - cutoff_val
            bw  = abs(x).max()
            w   = np.maximum(1.0 - abs(x) / (bw + 1e-10), 1e-6)
            X   = sm.add_constant(x, has_constant="add")
            try:
                mdl = sm.WLS(densities, X, weights=w).fit(cov_type="HC2")
                x_pred = np.linspace(x.min(), x.max(), 50)
                y_pred = mdl.params[0] + mdl.params[1] * x_pred
                return (x_pred + cutoff_val).tolist(), y_pred.tolist()
            except Exception:
                return mids.tolist(), densities.tolist()

        left_xs,  left_ys  = _smooth_curve(
            bin_mids[left_mask],  bin_density[left_mask],  c
        )
        right_xs, right_ys = _smooth_curve(
            bin_mids[right_mask], bin_density[right_mask], c
        )

        # ---- Message ----
        if passed:
            message = (
                f"✅ No significant discontinuity in density detected at the cutoff "
                f"(Z = {z_stat:.3f}, p = {p_value:.3f}). "
                f"There is no strong evidence of manipulation or sorting."
            )
        else:
            message = (
                f"⚠️ Significant density discontinuity detected at the cutoff "
                f"(Z = {z_stat:.3f}, p = {p_value:.3f}). "
                f"This may indicate that units are sorting around the cutoff, "
                f"which would bias the RD estimate."
            )

        chart_data = {
            "bins": [
                {
                    "mid":     round(float(m), 6),
                    "density": round(float(d), 8),
                    "isLeft":  bool(m < c),
                }
                for m, d in zip(bin_mids, bin_density)
            ],
            "leftCurve":  [{"x": round(float(xi), 6), "y": round(float(yi), 8)}
                           for xi, yi in zip(left_xs, left_ys)],
            "rightCurve": [{"x": round(float(xi), 6), "y": round(float(yi), 8)}
                           for xi, yi in zip(right_xs, right_ys)],
            "cutoff":      float(c),
            "leftDensityAtCutoff":  round(float(left_interp), 8),
            "rightDensityAtCutoff": round(float(right_interp), 8),
            "xAxisLabel": self.running_var,
            "yAxisLabel": "Density",
            "title":      f"Density of {self.running_var} Around Cutoff ({c})",
        }

        return {
            "z_stat":    round(float(z_stat), 4),
            "p_value":   round(float(p_value), 4),
            "diff":      round(float(diff), 6),
            "diff_se":   round(float(diff_se), 6),
            "left_density_at_cutoff":  round(float(left_interp), 6),
            "right_density_at_cutoff": round(float(right_interp), 6),
            "passed":    passed,
            "message":   message,
            "chart_data": chart_data,
        }


def _empty_placebo_cutoff_result(message: str) -> Dict[str, Any]:
    return {
        "placebo_estimates":   [],
        "n_total":             0,
        "n_significant":       0,
        "false_positive_rate": None,
        "pseudo_p_value":      None,
        "rank_pct":            None,
        "real_effect":         None,
        "passed":              None,
        "message":             message,
        "chart_data":          None,
    }


def _empty_density_result(message: str) -> Dict[str, Any]:
    return {
        "z_stat":    None,
        "p_value":   None,
        "diff":      None,
        "diff_se":   None,
        "left_density_at_cutoff":  None,
        "right_density_at_cutoff": None,
        "passed":    None,
        "message":   message,
        "chart_data": None,
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
