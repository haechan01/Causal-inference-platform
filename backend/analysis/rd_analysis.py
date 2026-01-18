"""
Core Regression Discontinuity (RD) estimation.

Phase 0: scaffolding only.

Planned:
- Sharp RD local polynomial estimation with triangular kernel weights
- HC2 robust standard errors via statsmodels WLS
- IK bandwidth selection + sensitivity analysis
"""

from __future__ import annotations

from typing import Any, Dict

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
    ):
        self.data = data
        self.running_var = running_var
        self.outcome_var = outcome_var
        self.cutoff = float(cutoff)

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
            raise ValueError(
                "Not enough observations on both sides of the cutoff "
                "within the bandwidth. "
                f"Found {n_control} below cutoff and {n_treated} at/above "
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
            "warnings": warnings,
            "diagnostics": {
                "running_var_range": diag.running_var_range,
                "bandwidth_fraction_of_range": (
                    diag.bandwidth_fraction_of_range
                ),
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
            "stability_coefficient": stability["cv"],
            "interpretation": stability["interpretation"],
            "bandwidth_method": opt.get("method"),
            "bandwidth_warnings": opt.get("warnings", []),
        }


def _stability_from_effects(effects: list[float]) -> Dict[str, Any]:
    """
    Compute coefficient of variation (CV) and a plain-English stability label.
    """
    if len(effects) < 3:
        return {
            "cv": None,
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

    denom = abs(mean) if abs(mean) > 1e-8 else 1e-8
    cv = float(std / denom)

    if cv < 0.30:
        stability = "very stable"
        msg = (
            "Your estimated effect is very consistent "
            "across bandwidth choices."
        )
    elif cv < 0.60:
        stability = "moderately stable"
        msg = "Your estimated effect changes somewhat as bandwidth changes."
    else:
        stability = "unstable"
        msg = (
            "Your estimated effect changes a lot across bandwidths; "
            "interpret with caution."
        )

    return {
        "cv": cv,
        "interpretation": {
            "stability": stability,
            "message": msg,
        },
    }
