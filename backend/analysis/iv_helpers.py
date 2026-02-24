"""
Shared helpers for Instrumental Variable (IV / 2SLS) analysis.

Provides:
- Input validation
- First-stage partial-F computation (excluded-instruments F)
- Instrument-strength interpretation (Stock-Yogo thresholds)
- OLS comparison estimate
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
import statsmodels.api as sm
from scipy.stats import f as f_dist, chi2


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def validate_iv_data(
    data: pd.DataFrame,
    outcome_var: str,
    treatment_var: str,
    instrument_vars: List[str],
    control_vars: Optional[List[str]] = None,
) -> List[str]:
    """
    Validate that the data and column selections are suitable for 2SLS.

    Returns a list of non-fatal warning strings; raises ValueError on hard
    failures.
    """
    warnings: List[str] = []

    # --- Column existence ---
    for col in [outcome_var, treatment_var] + instrument_vars + (control_vars or []):
        if col not in data.columns:
            raise ValueError(f"Column '{col}' not found in dataset.")

    # --- Numeric coercion ---
    all_cols = [outcome_var, treatment_var] + instrument_vars + (control_vars or [])
    for col in all_cols:
        coerced = pd.to_numeric(data[col], errors="coerce")
        n_bad = coerced.isna().sum() - data[col].isna().sum()
        if n_bad > 0:
            warnings.append(
                f"Column '{col}' has {n_bad} non-numeric value(s) that will be "
                "dropped."
            )

    # --- Sample size ---
    n_params = 1 + len(instrument_vars) + len(control_vars or [])
    n_valid = (
        data[[outcome_var, treatment_var] + instrument_vars + (control_vars or [])]
        .apply(pd.to_numeric, errors="coerce")
        .dropna()
        .shape[0]
    )
    if n_valid < 30:
        raise ValueError(
            f"Only {n_valid} complete observations. Need at least 30 for IV "
            "estimation to be reliable."
        )
    if n_valid < 5 * n_params:
        warnings.append(
            f"Sample size ({n_valid}) is small relative to the number of "
            f"parameters ({n_params}). Estimates may be imprecise."
        )

    # --- Identification: need at least as many instruments as endogenous vars ---
    # (here we have one endogenous var)
    if len(instrument_vars) < 1:
        raise ValueError("At least one instrument is required.")

    # --- Instrument ≠ treatment ---
    for z in instrument_vars:
        if z == treatment_var:
            raise ValueError(
                f"Instrument '{z}' is the same as the treatment variable. "
                "Instruments must be different from the endogenous treatment."
            )

    # --- Instrument ≠ outcome ---
    for z in instrument_vars:
        if z == outcome_var:
            raise ValueError(
                f"Instrument '{z}' is the same as the outcome variable. "
                "Instruments must not directly be the outcome."
            )

    # --- Duplicate instruments ---
    if len(set(instrument_vars)) < len(instrument_vars):
        raise ValueError("Duplicate column names in instrument list.")

    return warnings


# ---------------------------------------------------------------------------
# First-stage partial-F statistic
# ---------------------------------------------------------------------------

def first_stage_partial_f(
    df: pd.DataFrame,
    treatment_var: str,
    instrument_vars: List[str],
    control_vars: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Compute the first-stage partial-F statistic for excluded instruments.

    This is the standard test of instrument strength: F-test of the null that
    all instrument coefficients in the first stage equal zero, holding controls
    fixed.

    Returns dict with: f_statistic, f_p_value, r_squared, r_squared_partial,
    n_obs, instrument_coefficients.
    """
    controls = control_vars or []

    # Build first-stage formula: treatment ~ instruments + controls
    rhs_full = " + ".join(
        [_quote(z) for z in instrument_vars] + [_quote(c) for c in controls]
    )
    rhs_restricted = " + ".join([_quote(c) for c in controls]) if controls else "1"

    formula_full = f"{_quote(treatment_var)} ~ {rhs_full}"
    formula_restricted = f"{_quote(treatment_var)} ~ {rhs_restricted}"

    model_full = smf.ols(formula_full, data=df).fit()
    model_restricted = smf.ols(formula_restricted, data=df).fit()

    n = int(model_full.nobs)
    k_full = int(model_full.df_model) + 1   # +1 for intercept
    q = len(instrument_vars)                 # number of restrictions

    # Partial F via SSR comparison
    ssr_full = float(model_full.ssr)
    ssr_restricted = float(model_restricted.ssr)
    df_denom = float(model_full.df_resid)

    if df_denom <= 0 or ssr_full <= 0:
        raise ValueError(
            "First stage has no residual degrees of freedom. "
            "Add more observations or reduce the number of instruments/controls."
        )

    f_stat = ((ssr_restricted - ssr_full) / q) / (ssr_full / df_denom)
    f_stat = float(f_stat)
    f_pvalue = float(f_dist.sf(f_stat, dfn=q, dfd=df_denom))

    # Partial R²: additional variance in treatment explained by instruments
    # beyond controls (Shea's partial R²)
    ss_total_net = float(model_restricted.ssr)  # variation left after controls
    r2_partial = float((ssr_restricted - ssr_full) / ss_total_net) if ss_total_net > 0 else 0.0

    # Instrument coefficients and t-stats from the full first-stage model
    inst_coefs: Dict[str, Any] = {}
    for z in instrument_vars:
        pname = _param_name(model_full, z)
        if pname:
            inst_coefs[z] = {
                "coefficient": round(float(model_full.params[pname]), 4),
                "se": round(float(model_full.bse[pname]), 4),
                "t_stat": round(float(model_full.tvalues[pname]), 4),
                "p_value": round(float(model_full.pvalues[pname]), 4),
            }

    return {
        "f_statistic": round(f_stat, 4),
        "f_p_value": round(f_pvalue, 4),
        "r_squared": round(float(model_full.rsquared), 4),
        "r_squared_partial": round(r2_partial, 4),
        "n_obs": n,
        "n_instruments": q,
        "instrument_coefficients": inst_coefs,
        "first_stage_summary": model_full.summary().as_text(),
    }


# ---------------------------------------------------------------------------
# Instrument strength interpretation
# ---------------------------------------------------------------------------

def interpret_instrument_strength(
    f_statistic: float,
    n_instruments: int,
) -> Dict[str, Any]:
    """
    Assess instrument strength using Stock-Yogo (2005) critical values.

    For the just-identified case (1 instrument), the conventional threshold
    is F > 10 (roughly 5% size distortion in a Wald test at the 5% level).
    For overidentified cases the threshold is higher.

    Returns dict with: strength, is_weak, message, stock_yogo_threshold.
    """
    # Stock-Yogo 10% maximal IV size critical values (Table 1, 5% significance)
    # Key: n_instruments -> critical value for ~10% size distortion
    stock_yogo_10pct = {
        1: 16.38,
        2: 19.93,
        3: 22.30,
        4: 24.58,
        5: 26.87,
    }
    # Conservative fallback for > 5 instruments
    threshold = stock_yogo_10pct.get(min(n_instruments, 5), 26.87)

    # Common rule-of-thumb thresholds
    if f_statistic >= threshold:
        strength = "strong"
        is_weak = False
        message = (
            f"Instruments appear strong (F = {f_statistic:.2f}, "
            f"Stock-Yogo threshold = {threshold:.2f}). "
            "2SLS estimates are unlikely to be substantially biased by weak instruments."
        )
    elif f_statistic >= 10:
        strength = "moderate"
        is_weak = False
        message = (
            f"Instruments are moderately strong (F = {f_statistic:.2f}). "
            f"The conventional rule-of-thumb threshold of 10 is satisfied, "
            f"but the Stock-Yogo threshold of {threshold:.2f} is not. "
            "2SLS estimates may have some size distortion."
        )
    elif f_statistic >= 5:
        strength = "weak"
        is_weak = True
        message = (
            f"Instruments may be weak (F = {f_statistic:.2f} < 10). "
            "Weak instruments lead to biased 2SLS estimates and misleadingly "
            "small standard errors. Consider using LIML or finding stronger instruments."
        )
    else:
        strength = "very_weak"
        is_weak = True
        message = (
            f"Instruments appear very weak (F = {f_statistic:.2f} < 5). "
            "2SLS estimates will be severely biased, potentially worse than OLS. "
            "The exclusion restriction alone cannot salvage weak instruments."
        )

    return {
        "strength": strength,
        "is_weak": is_weak,
        "message": message,
        "f_statistic": f_statistic,
        "stock_yogo_threshold": threshold,
        "rule_of_thumb_threshold": 10.0,
    }


# ---------------------------------------------------------------------------
# OLS comparison estimate
# ---------------------------------------------------------------------------

def ols_estimate(
    df: pd.DataFrame,
    outcome_var: str,
    treatment_var: str,
    control_vars: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Compute the naive OLS estimate for comparison with 2SLS.

    The difference (2SLS - OLS) is informative: a large gap suggests the
    instrument is correcting substantial endogeneity bias.
    """
    controls = control_vars or []
    rhs = " + ".join([_quote(treatment_var)] + [_quote(c) for c in controls])
    formula = f"{_quote(outcome_var)} ~ {rhs}"
    model = smf.ols(formula, data=df).fit()

    pname = _param_name(model, treatment_var)
    if pname is None:
        raise ValueError(
            f"Could not find '{treatment_var}' in OLS model parameters."
        )

    ci = model.conf_int().loc[pname]
    return {
        "estimate": round(float(model.params[pname]), 4),
        "se": round(float(model.bse[pname]), 4),
        "ci_lower": round(float(ci.iloc[0]), 4),
        "ci_upper": round(float(ci.iloc[1]), 4),
        "p_value": round(float(model.pvalues[pname]), 4),
    }


# ---------------------------------------------------------------------------
# Internal utilities
# ---------------------------------------------------------------------------

def _quote(col: str) -> str:
    """Wrap column name in Q() if it has spaces or special characters."""
    if " " in col or not col.replace("_", "").isalnum():
        return f"Q('{col}')"
    return col


def _param_name(model: Any, col: str) -> Optional[str]:
    """
    Find the parameter name in a fitted statsmodels model corresponding to
    a column, trying both plain and Q()-wrapped names.
    """
    for candidate in [col, f"Q('{col}')", f'Q("{col}")']:
        if candidate in model.params.index:
            return candidate
    return None
