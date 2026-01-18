"""
Bandwidth selection for Regression Discontinuity (RD).

Planned:
- Imbens-Kalyanaraman (2012) MSE-optimal bandwidth for sharp RD with triangular kernel.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple

import numpy as np
import pandas as pd
import statsmodels.api as sm

from .rd_helpers import (
    compute_running_var_range,
    triangular_kernel,
)


def imbens_kalyanaraman_bandwidth(
    data: pd.DataFrame,
    running_var: str,
    outcome_var: str,
    cutoff: float,
) -> Dict[str, Any]:
    """
    Compute Imbens-Kalyanaraman (2012) MSE-optimal bandwidth (sharp RD).

    This is a practical implementation geared for product use:
    - Triangular kernel
    - Uses a pilot bandwidth to estimate curvature and variance on each side
    - Applies the simplified IK form described in the product spec:
        h_opt = (C_K * (var_plus + var_minus) / (m2^2 * N))^(1/5)

    Returns:
      {
        "bandwidth": float,
        "method": "imbens_kalyanaraman_2012",
        "diagnostics": {...},
        "warnings": [...]
      }
    """
    if running_var not in data.columns:
        raise ValueError(f"running_var '{running_var}' not found in dataset columns.")
    if outcome_var not in data.columns:
        raise ValueError(f"outcome_var '{outcome_var}' not found in dataset columns.")

    df = data[[running_var, outcome_var]].copy()
    df[running_var] = pd.to_numeric(df[running_var], errors="coerce")
    df[outcome_var] = pd.to_numeric(df[outcome_var], errors="coerce")
    df = df.dropna(subset=[running_var, outcome_var])
    if df.empty:
        raise ValueError("No valid numeric rows found for running/outcome variables.")

    cutoff = float(cutoff)
    df["X_centered"] = df[running_var] - cutoff
    df["treated"] = (df[running_var] >= cutoff).astype(int)

    n_total = int(df.shape[0])
    if n_total < 40:
        # Estimating curvature reliably is hard with very small samples.
        raise ValueError(
            "Not enough data to auto-calculate bandwidth reliably (need at least 40 rows). "
            "Please specify bandwidth manually."
        )

    x = df["X_centered"].to_numpy(dtype=float)
    y = df[outcome_var].to_numpy(dtype=float)

    x_sd = float(np.std(x, ddof=1)) if n_total > 1 else 0.0
    x_range = compute_running_var_range(df[running_var])
    if x_sd <= 0 or not np.isfinite(x_sd):
        raise ValueError("Running variable has zero variation; cannot compute bandwidth.")

    # Pilot bandwidth: rule-of-thumb scaling for local polynomial smoothing.
    # n^{-1/5} is standard for local linear; constant chosen for practicality.
    pilot = 1.84 * x_sd * (n_total ** (-1.0 / 5.0))

    # Keep pilot within a reasonable fraction of the running variable range.
    min_h = 0.05 * x_range
    max_h = 0.50 * x_range
    pilot_h = float(np.clip(pilot, min_h, max_h))

    treated_mask = df["treated"].to_numpy(dtype=int) == 1
    control_mask = ~treated_mask

    m2_plus, var_plus, n_plus = _estimate_curvature_and_variance(
        x=x[treated_mask],
        y=y[treated_mask],
        bandwidth=pilot_h,
    )
    m2_minus, var_minus, n_minus = _estimate_curvature_and_variance(
        x=x[control_mask],
        y=y[control_mask],
        bandwidth=pilot_h,
    )

    warnings: list[str] = []
    if n_plus < 20 or n_minus < 20:
        warnings.append(
            "Pilot bandwidth leaves fewer than 20 observations on one side of the cutoff; "
            "auto bandwidth may be unstable."
        )

    # Curvature term (second derivative at 0). Use average magnitude across sides.
    m2 = float((m2_plus + m2_minus) / 2.0)
    m2_abs = abs(m2)

    # Triangular kernel constant per spec.
    c_k = 3.4375

    # If curvature is extremely small, IK formula explodes. Fall back to a
    # conservative pilot-based bandwidth.
    if not np.isfinite(m2_abs) or m2_abs < 1e-10:
        warnings.append(
            "Estimated curvature near the cutoff is close to zero; "
            "falling back to a pilot bandwidth rule-of-thumb."
        )
        h_opt = pilot_h
    else:
        numerator = c_k * float(var_plus + var_minus)
        denom = (m2_abs**2) * float(n_total)
        if denom <= 0 or not np.isfinite(numerator) or numerator <= 0:
            warnings.append(
                "Variance/curvature diagnostics were not usable; "
                "falling back to a pilot bandwidth rule-of-thumb."
            )
            h_opt = pilot_h
        else:
            h_opt = float((numerator / denom) ** (1.0 / 5.0))

    # Clamp to sane range
    h_opt = float(np.clip(h_opt, min_h, max_h))

    return {
        "bandwidth": h_opt,
        "method": "imbens_kalyanaraman_2012",
        "diagnostics": {
            "pilot_bandwidth": pilot_h,
            "n_total": n_total,
            "n_plus": n_plus,
            "n_minus": n_minus,
            "m2_plus": m2_plus,
            "m2_minus": m2_minus,
            "var_plus": var_plus,
            "var_minus": var_minus,
            "x_sd": x_sd,
            "x_range": x_range,
            "min_bandwidth": min_h,
            "max_bandwidth": max_h,
            "c_k": c_k,
        },
        "warnings": warnings,
    }


def _estimate_curvature_and_variance(
    x: np.ndarray,
    y: np.ndarray,
    bandwidth: float,
) -> Tuple[float, float, int]:
    """
    Estimate curvature (second derivative at 0) and residual variance on one side.

    We fit a weighted quadratic:
      y ~ 1 + x + x^2
    using triangular weights within |x| <= bandwidth.

    Returns: (m2, var, n_used)
      m2: second derivative at 0 = 2 * beta2
      var: residual variance estimate
    """
    if x.size == 0:
        return 0.0, float("nan"), 0

    h = float(bandwidth)
    in_bw = np.abs(x) <= h
    x_bw = x[in_bw]
    y_bw = y[in_bw]
    n = int(x_bw.size)
    if n < 5:
        return 0.0, float("nan"), n

    w = triangular_kernel(x_bw, h)
    X = np.column_stack([x_bw, x_bw**2])
    X = sm.add_constant(X, has_constant="add")

    fit = sm.WLS(y_bw, X, weights=w).fit()
    beta2 = float(fit.params[2]) if len(fit.params) >= 3 else 0.0
    m2 = float(2.0 * beta2)

    # Residual variance: use mean squared residual with dof correction
    k = int(X.shape[1])
    dof = max(n - k, 1)
    resid = fit.resid
    var = float(np.sum(resid**2) / dof)

    return m2, var, n


