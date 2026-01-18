"""
Shared helpers for Regression Discontinuity (RD) analysis.

Phase 0: light utilities and guardrails only.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

import numpy as np
import pandas as pd


def validate_polynomial_order(polynomial_order: int) -> int:
    """
    Validate polynomial order for RD.

    We default to linear (1) and allow quadratic (2) as an advanced option.
    Never allow above 2 per Gelman & Imbens (2019) guidance.
    """
    if polynomial_order not in (1, 2):
        raise ValueError("polynomial_order must be 1 (linear) or 2 (quadratic).")
    return polynomial_order


def triangular_kernel(x_centered: pd.Series | np.ndarray, bandwidth: float) -> np.ndarray:
    """
    Triangular kernel weights for local polynomial regression.

    weight = max(1 - |x/h|, 0)
    """
    if bandwidth is None or bandwidth <= 0:
        raise ValueError("bandwidth must be a positive number.")
    x = np.asarray(x_centered, dtype=float)
    u = x / float(bandwidth)
    return np.maximum(1.0 - np.abs(u), 0.0)


def create_polynomial_features(
    x_centered: pd.Series | np.ndarray,
    order: int,
) -> np.ndarray:
    """
    Create polynomial features up to the given order (excluding constant).

    Returns an array shaped (n, order) with columns [x, x^2] when order=2.
    """
    order = validate_polynomial_order(int(order))
    x = np.asarray(x_centered, dtype=float)
    cols = []
    for p in range(1, order + 1):
        cols.append(np.power(x, p))
    return np.column_stack(cols) if cols else np.empty((len(x), 0), dtype=float)


@dataclass(frozen=True)
class RDDiagnostics:
    """
    Non-fatal diagnostics and warnings for an RD run.
    """

    warnings: list[str]
    running_var_range: Optional[float] = None
    bandwidth_fraction_of_range: Optional[float] = None


def compute_running_var_range(series: pd.Series) -> float:
    """Compute range (max-min) of a numeric series."""
    s = pd.to_numeric(series, errors="coerce").dropna()
    if s.empty:
        raise ValueError("Running variable contains no numeric values.")
    return float(s.max() - s.min())


def bandwidth_sanity_warnings(bandwidth: float, running_var_range: float) -> RDDiagnostics:
    """
    Heuristic sanity checks for bandwidth relative to the running variable range.

    Per product requirements:
    - Warn if bandwidth is outside 5%–50% of the running variable range.
    """
    warnings: list[str] = []
    frac: Optional[float]
    if running_var_range <= 0:
        frac = None
        warnings.append("Running variable has zero range; RD may not be meaningful.")
    else:
        frac = float(bandwidth) / float(running_var_range)
        if frac < 0.05:
            warnings.append(
                "Bandwidth looks very small relative to the running variable range; "
                "results may be unstable. Consider increasing bandwidth."
            )
        if frac > 0.50:
            warnings.append(
                "Bandwidth looks very large relative to the running variable range; "
                "local RD assumptions may be weaker. Consider decreasing bandwidth."
            )
    return RDDiagnostics(
        warnings=warnings,
        running_var_range=running_var_range,
        bandwidth_fraction_of_range=frac,
    )


