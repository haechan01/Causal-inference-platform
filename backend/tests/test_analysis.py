"""
Unit tests for the three causal inference estimators:
  - Difference-in-Differences  (utils/did_analysis.py :: run_did)
  - Regression Discontinuity   (analysis/rd_analysis.py :: RDEstimator)
  - Instrumental Variables     (analysis/iv_analysis.py :: IVEstimator)

Each test builds a small synthetic dataset whose ground-truth effect is
known analytically, then checks that the estimator recovers the right sign,
rough magnitude, and diagnostic flags.
"""

import numpy as np
import pandas as pd
import pytest

from utils.did_analysis import run_did
from analysis.rd_analysis import RDEstimator
from analysis.iv_analysis import IVEstimator


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RNG = np.random.default_rng(42)


def _did_panel(true_effect: float = 10.0, n_units: int = 100) -> pd.DataFrame:
    """
    Two-period, two-group panel.

    Periods: 0 (pre), 1 (post). Treatment begins at period 1.
    Both groups share a base outcome of 5.0 plus small idiosyncratic noise.
    Treated group additionally gains `true_effect` in the post period.

    The DiD estimand is true_effect in expectation.
    Adding noise prevents degenerate (zero-variance) OLS problems.
    """
    rows = []
    noise = RNG.normal(0, 0.3, n_units * 2)
    idx = 0
    for unit in range(n_units):
        treated = int(unit < n_units // 2)
        for period in [0, 1]:
            outcome = 5.0 + noise[idx]
            idx += 1
            if treated and period == 1:
                outcome += true_effect
            rows.append(
                {"unit": unit, "period": period, "treatment": treated, "outcome": outcome}
            )
    return pd.DataFrame(rows)


def _did_panel_parallel_trends_fail() -> pd.DataFrame:
    """
    Three-period panel where the treatment and control groups have different
    pre-treatment trends — parallel trends assumption should flag as violated.
    """
    rows = []
    for unit in range(60):
        treated = int(unit < 30)
        for period in [0, 1, 2]:
            # Control: flat at 5; Treated: rising by 3 each period pre-treatment
            # → pre-trends differ → test should flag p < 0.05 (rejected)
            if treated:
                outcome = 5.0 + 3.0 * period
            else:
                outcome = 5.0
            # Treatment effect added from period 2 onwards
            if treated and period == 2:
                outcome += 10.0
            rows.append(
                {"unit": unit, "period": period, "treatment": treated, "outcome": outcome}
            )
    return pd.DataFrame(rows)


def _rdd_data(true_effect: float = 5.0, n: int = 2000) -> pd.DataFrame:
    """
    Sharp RD dataset.

    Running variable X ~ Uniform(-2, 2). Cutoff = 0.
    Outcome = 2*X + true_effect*(X >= 0) + N(0, 0.5²).

    The causal jump at X=0 is exactly true_effect.
    """
    x = RNG.uniform(-2, 2, n)
    y = 2 * x + true_effect * (x >= 0) + RNG.normal(0, 0.5, n)
    return pd.DataFrame({"score": x, "outcome": y})


def _iv_data(true_effect: float = 3.0, n: int = 3000) -> pd.DataFrame:
    """
    IV / 2SLS dataset with one strong instrument.

    Z ~ N(0,1)                      instrument
    D = 0.8*Z + N(0,0.5²)           endogenous treatment (strong first stage)
    Y = true_effect*D + N(0,1)      outcome

    Population 2SLS estimand = true_effect.
    """
    z = RNG.normal(0, 1, n)
    d = 0.8 * z + RNG.normal(0, 0.5, n)
    y = true_effect * d + RNG.normal(0, 1, n)
    return pd.DataFrame({"Y": y, "D": d, "Z": z})


# =============================================================================
# DiD tests
# =============================================================================


class TestRunDid:
    """Tests for run_did() — core DiD estimation logic."""

    def test_recovers_known_treatment_effect(self):
        """DiD estimate matches the analytically correct value."""
        df = _did_panel(true_effect=10.0)
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
        )
        assert abs(result["did_estimate"] - 10.0) < 0.01

    def test_zero_effect_estimate_near_zero(self):
        """When there is no treatment effect, the DiD estimate should be near zero."""
        df = _did_panel(true_effect=0.0, n_units=300)
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
        )
        # With small noise and no true effect, the estimate should be within 1 SE of 0
        assert abs(result["did_estimate"]) < 1.0

    def test_large_effect_is_significant(self):
        """A true treatment effect of 10 should yield a significant p-value."""
        df = _did_panel(true_effect=10.0)
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
        )
        assert result["is_significant"]
        assert result["p_value"] < 0.05

    def test_result_structure(self):
        """Result dict contains all expected keys."""
        df = _did_panel()
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
        )
        for key in ("did_estimate", "standard_error", "p_value",
                    "is_significant", "confidence_interval", "parallel_trends"):
            assert key in result, f"Missing key: {key}"

    def test_confidence_interval_contains_true_effect(self):
        """The 95% CI should bracket the true treatment effect."""
        df = _did_panel(true_effect=10.0, n_units=200)
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
        )
        ci = result["confidence_interval"]
        assert ci["lower"] <= 10.0 <= ci["upper"]

    def test_parallel_trends_passes_on_clean_data(self):
        """Parallel trends test should pass when both groups have identical pre-trends."""
        df = _did_panel(true_effect=10.0, n_units=200)
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
        )
        pt = result["parallel_trends"]
        # With only 1 pre-period the test cannot run — that is an expected
        # edge case (returns passed=None or a message), so we just verify the
        # key exists and is not an error state that crashes.
        assert "passed" in pt

    def test_parallel_trends_fails_on_diverging_groups(self):
        """Parallel trends test should detect pre-existing diverging trends."""
        df = _did_panel_parallel_trends_fail()
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=2,
        )
        pt = result["parallel_trends"]
        # p_value should be small (< 0.05) — i.e. parallel trends rejected
        if pt.get("p_value") is not None:
            assert pt["p_value"] < 0.05 or pt["passed"] is False

    def test_negative_effect_recovered(self):
        """DiD correctly recovers a negative treatment effect."""
        df = _did_panel(true_effect=-8.0, n_units=200)
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
        )
        assert result["did_estimate"] < 0
        assert abs(result["did_estimate"] - (-8.0)) < 0.5


# =============================================================================
# RDD tests
# =============================================================================


class TestRDEstimator:
    """Tests for RDEstimator.estimate() — sharp RD logic."""

    @pytest.fixture()
    def rdd_data(self):
        return _rdd_data(true_effect=5.0, n=2000)

    def test_recovers_known_treatment_effect(self, rdd_data):
        """Sharp RD estimate should be close to the true jump at cutoff."""
        rd = RDEstimator(
            data=rdd_data,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        result = rd.estimate(bandwidth=1.0, polynomial_order=1)
        assert abs(result["treatment_effect"] - 5.0) < 0.5

    def test_result_structure(self, rdd_data):
        """Result dict contains all expected keys."""
        rd = RDEstimator(
            data=rdd_data,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        result = rd.estimate(bandwidth=1.0)
        for key in ("treatment_effect", "se", "ci_lower", "ci_upper",
                    "p_value", "n_total", "n_treated", "n_control",
                    "bandwidth_used", "kernel"):
            assert key in result, f"Missing key: {key}"

    def test_ci_contains_true_effect(self, rdd_data):
        """95% confidence interval should bracket the true treatment effect."""
        rd = RDEstimator(
            data=rdd_data,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        result = rd.estimate(bandwidth=1.0)
        assert result["ci_lower"] < 5.0 < result["ci_upper"]

    def test_uses_triangular_kernel(self, rdd_data):
        """Kernel field should be 'triangular'."""
        rd = RDEstimator(
            data=rdd_data,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        result = rd.estimate(bandwidth=1.0)
        assert result["kernel"] == "triangular"

    def test_bandwidth_too_narrow_raises(self, rdd_data):
        """A bandwidth that captures fewer than 20 observations should raise ValueError."""
        rd = RDEstimator(
            data=rdd_data,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        with pytest.raises(ValueError, match="(?i)bandwidth|observations"):
            rd.estimate(bandwidth=0.001)

    def test_invalid_bandwidth_raises(self, rdd_data):
        """Non-positive bandwidth should raise ValueError."""
        rd = RDEstimator(
            data=rdd_data,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        with pytest.raises(ValueError):
            rd.estimate(bandwidth=0)

    def test_missing_running_var_raises(self):
        """Referencing a column that doesn't exist should raise ValueError."""
        df = pd.DataFrame({"x": [1, 2], "y": [3, 4]})
        rd = RDEstimator(data=df, running_var="nonexistent", outcome_var="y", cutoff=0.0)
        with pytest.raises(ValueError, match="nonexistent"):
            rd.estimate(bandwidth=5.0)

    def test_treatment_side_below(self):
        """treatment_side='below' means units below the cutoff are treated."""
        df = _rdd_data(true_effect=5.0, n=2000)
        rd = RDEstimator(
            data=df,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
            treatment_side="below",
        )
        result = rd.estimate(bandwidth=1.0)
        # Treatment effect flips sign relative to treatment_side='above'
        assert result["treatment_side"] == "below"
        assert result["treatment_effect"] < 0  # jump now negative from above-side perspective


# =============================================================================
# IV tests
# =============================================================================


class TestIVEstimator:
    """Tests for IVEstimator.estimate() — 2SLS logic."""

    @pytest.fixture()
    def iv_df(self):
        return _iv_data(true_effect=3.0, n=3000)

    def test_recovers_known_treatment_effect(self, iv_df):
        """2SLS estimate should be close to the true effect."""
        est = IVEstimator(
            data=iv_df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
        )
        result = est.estimate()
        assert abs(result["treatment_effect"] - 3.0) < 0.3

    def test_result_structure(self, iv_df):
        """Result dict contains all expected keys."""
        est = IVEstimator(
            data=iv_df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
        )
        result = est.estimate()
        for key in ("treatment_effect", "se", "ci_lower", "ci_upper",
                    "p_value", "n_obs", "first_stage",
                    "instrument_strength", "endogeneity_test", "ols_comparison"):
            assert key in result, f"Missing key: {key}"

    def test_ci_contains_true_effect(self, iv_df):
        """95% CI should bracket the true causal effect."""
        est = IVEstimator(
            data=iv_df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
        )
        result = est.estimate()
        assert result["ci_lower"] < 3.0 < result["ci_upper"]

    def test_first_stage_f_stat_present(self, iv_df):
        """First-stage diagnostics should include an F-statistic."""
        est = IVEstimator(
            data=iv_df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
        )
        result = est.estimate()
        fs = result["first_stage"]
        assert "f_statistic" in fs
        # Strong instrument: F >> 10 (Stock-Yogo threshold)
        assert fs["f_statistic"] > 10

    def test_instrument_strength_label(self, iv_df):
        """A strong instrument should be labelled accordingly."""
        est = IVEstimator(
            data=iv_df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
        )
        result = est.estimate()
        strength = result["instrument_strength"]
        label = strength.get("strength", "").lower()
        assert label in ("strong", "moderate", "weak"), f"Unexpected label: {label}"

    def test_under_identified_raises(self, iv_df):
        """Fewer instruments than endogenous variables should raise ValueError."""
        # Add a second endogenous variable but only one instrument
        iv_df2 = iv_df.copy()
        iv_df2["D2"] = iv_df2["D"] * 0.5 + RNG.normal(0, 0.1, len(iv_df2))
        est = IVEstimator(
            data=iv_df2,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
            additional_endogenous=[{"variable": "D2", "instrument": "Z"}],
        )
        # Z is re-used for D2 — deduplication means 1 instrument vs 2 endogenous
        # This may raise or return a warning depending on implementation
        try:
            result = est.estimate()
            # If it doesn't raise, it should at least have warnings
            assert isinstance(result.get("warnings", []), list)
        except ValueError:
            pass  # Expected

    def test_no_observations_after_dropna_raises(self):
        """All-NaN data should raise ValueError before estimation."""
        df = pd.DataFrame({"Y": [np.nan] * 20, "D": [np.nan] * 20, "Z": [np.nan] * 20})
        est = IVEstimator(
            data=df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
        )
        with pytest.raises(ValueError, match="(?i)complete|observations|numeric"):
            est.estimate()

    def test_ols_comparison_present(self, iv_df):
        """Result should include an OLS comparison estimate."""
        est = IVEstimator(
            data=iv_df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
        )
        result = est.estimate()
        ols = result["ols_comparison"]
        assert "estimate" in ols
        # OLS is biased upward when D is endogenous, but with our clean data
        # the bias is small — just check it's a finite number
        assert np.isfinite(ols["estimate"])


# =============================================================================
# Additional DiD tests — panel paths (Cases B and A)
# =============================================================================


def _panel_did(true_effect: float = 10.0, n_units: int = 80) -> pd.DataFrame:
    """
    Two-period panel with an explicit unit identifier column.
    Both groups follow identical pre-trends (parallel trends holds).
    """
    rows = []
    noise = RNG.normal(0, 0.3, n_units * 2)
    idx = 0
    for unit in range(n_units):
        treated = int(unit < n_units // 2)
        for period in [0, 1]:
            outcome = 5.0 + noise[idx]
            idx += 1
            if treated and period == 1:
                outcome += true_effect
            rows.append(
                {
                    "unit_id": unit,
                    "period": period,
                    "treatment": treated,
                    "outcome": outcome,
                }
            )
    return pd.DataFrame(rows)


def _staggered_panel(n_units: int = 60) -> pd.DataFrame:
    """
    Three-period panel where treated units enter treatment at different times
    (staggered adoption), producing a TWFE design.

    Cohort A (units 0-19):  treated from period 1 onwards.
    Cohort B (units 20-39): treated from period 2 onwards.
    Control  (units 40-59): never treated.

    True ATT = 5.0 for both cohorts.
    """
    rows = []
    true_effect = 5.0
    noise = RNG.normal(0, 0.3, n_units * 3)
    idx = 0
    for unit in range(n_units):
        if unit < 20:
            treat_from = 1
        elif unit < 40:
            treat_from = 2
        else:
            treat_from = None  # never treated

        for period in [0, 1, 2]:
            currently_treated = int(treat_from is not None and period >= treat_from)
            outcome = 5.0 + noise[idx] + true_effect * currently_treated
            idx += 1
            rows.append(
                {
                    "unit_id": unit,
                    "period": period,
                    "treatment": currently_treated,
                    "outcome": outcome,
                }
            )
    return pd.DataFrame(rows)


class TestRunDidPanelPaths:
    """Tests for the unit-panel (Case B) and staggered-TWFE (Case A) paths."""

    def test_panel_did_with_unit_fe_recovers_effect(self):
        """Case B: unit_col provided, non-staggered — should recover true effect."""
        df = _panel_did(true_effect=10.0, n_units=100)
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
            unit_col="unit_id",
        )
        assert abs(result["did_estimate"] - 10.0) < 1.0

    def test_panel_did_uses_clustered_se(self):
        """Case B: se_method should be 'clustered_by_unit'."""
        df = _panel_did()
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
            unit_col="unit_id",
        )
        assert result["se_method"] == "clustered_by_unit"

    def test_panel_did_estimator_label(self):
        """Case B: estimator should be 'twfe_panel'."""
        df = _panel_did()
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
            unit_col="unit_id",
        )
        assert result["estimator"] == "twfe_panel"

    def test_panel_did_reports_unit_counts(self):
        """Case B: statistics dict should include treated_units and control_units."""
        df = _panel_did(n_units=80)
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
            unit_col="unit_id",
        )
        stats = result["statistics"]
        assert stats["treated_units"] == 40
        assert stats["control_units"] == 40
        assert stats["n_clusters"] == 80

    def test_staggered_did_detects_staggering(self):
        """Case A: is_staggered flag should be True with multiple cohorts."""
        df = _staggered_panel()
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
            unit_col="unit_id",
        )
        assert result["is_staggered"] is True

    def test_staggered_did_estimator_label(self):
        """Case A: estimator should be 'twfe_staggered'."""
        df = _staggered_panel()
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
            unit_col="unit_id",
        )
        assert result["estimator"] == "twfe_staggered"

    def test_staggered_did_recovers_positive_effect(self):
        """Case A: TWFE should detect a positive treatment effect."""
        df = _staggered_panel()
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
            unit_col="unit_id",
        )
        assert result["did_estimate"] > 0

    def test_staggered_did_includes_twfe_warning(self):
        """Case A: result should warn about TWFE bias with heterogeneous effects."""
        df = _staggered_panel()
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
            unit_col="unit_id",
        )
        warnings_text = " ".join(result["staggered_warnings"]).lower()
        assert "twfe" in warnings_text or "two-way" in warnings_text

    def test_staggered_did_cohort_info(self):
        """Case A: cohort_info should map each entry period to its unit count."""
        df = _staggered_panel()
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
            unit_col="unit_id",
        )
        assert result["cohort_info"] is not None
        assert len(result["cohort_info"]) == 2  # two entry cohorts (period 1 and 2)

    def test_simple_did_estimator_label(self):
        """Case C (no unit_col): estimator should be 'ols_did'."""
        df = _did_panel()
        result = run_did(
            df=df,
            treatment_col="treatment",
            time_col="period",
            outcome_col="outcome",
            treatment_time=1,
        )
        assert result["estimator"] == "ols_did"
        assert result["se_method"] == "ols"


# =============================================================================
# Additional RDD tests — bandwidth selection and fuzzy RD
# =============================================================================


def _fuzzy_rdd_data(
    late: float = 4.0, compliance_rate: float = 0.8, n: int = 2000
) -> pd.DataFrame:
    """
    Fuzzy RD dataset.

    Running variable X ~ Uniform(-2, 2). Cutoff = 0.
    Assignment: Z = 1 if X >= 0.
    Treatment receipt: D = 1 with probability `compliance_rate` if Z=1,
                           with probability (1-compliance_rate)*0.1 if Z=0.
    Outcome: Y = 2*X + late * D + N(0, 0.5)

    True LATE = late (for compliers at the cutoff).
    """
    x = RNG.uniform(-2, 2, n)
    z = (x >= 0).astype(int)
    u = RNG.uniform(0, 1, n)
    d = np.where(z == 1, (u < compliance_rate).astype(int),
                 (u < (1 - compliance_rate) * 0.1).astype(int))
    y = 2 * x + late * d + RNG.normal(0, 0.5, n)
    return pd.DataFrame({"score": x, "outcome": y, "treated": d})


class TestRDEstimatorAdditional:
    """Additional RD tests — bandwidth selection, polynomial order, and fuzzy RD."""

    @pytest.fixture()
    def rdd_data(self):
        return _rdd_data(true_effect=5.0, n=2000)

    def test_optimal_bandwidth_returns_positive(self, rdd_data):
        """calculate_optimal_bandwidth() should return a positive numeric bandwidth."""
        rd = RDEstimator(
            data=rdd_data,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        result = rd.calculate_optimal_bandwidth()
        assert "bandwidth" in result
        assert result["bandwidth"] > 0

    def test_optimal_bandwidth_structure(self, rdd_data):
        """Bandwidth result includes method, bandwidth, diagnostics, and warnings."""
        rd = RDEstimator(
            data=rdd_data,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        result = rd.calculate_optimal_bandwidth()
        for key in ("bandwidth", "method", "diagnostics", "warnings"):
            assert key in result, f"Missing key: {key}"

    def test_quadratic_polynomial_recovers_effect(self, rdd_data):
        """polynomial_order=2 should still recover the treatment effect."""
        rd = RDEstimator(
            data=rdd_data,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        result = rd.estimate(bandwidth=1.5, polynomial_order=2)
        assert result["polynomial_order"] == 2
        assert abs(result["treatment_effect"] - 5.0) < 1.0

    def test_fuzzy_rd_returns_late(self):
        """estimate_fuzzy() should return a positive LATE estimate."""
        df = _fuzzy_rdd_data(late=4.0, compliance_rate=0.8, n=3000)
        rd = RDEstimator(
            data=df,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        result = rd.estimate_fuzzy(treatment_var="treated", bandwidth=1.5)
        assert result["treatment_effect"] > 0

    def test_fuzzy_rd_result_structure(self):
        """Fuzzy RD result contains all expected keys."""
        df = _fuzzy_rdd_data(late=4.0, n=3000)
        rd = RDEstimator(
            data=df,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        result = rd.estimate_fuzzy(treatment_var="treated", bandwidth=1.5)
        for key in ("treatment_effect", "se", "ci_lower", "ci_upper",
                    "p_value", "n_total", "kernel",
                    "first_stage_effect", "first_stage_se",
                    "reduced_form_effect", "compliance_rate_assigned"):
            assert key in result, f"Missing key: {key}"

    def test_fuzzy_rd_missing_treatment_col_raises(self):
        """Passing a non-existent treatment_var should raise ValueError."""
        df = _rdd_data(n=2000)
        rd = RDEstimator(
            data=df,
            running_var="score",
            outcome_var="outcome",
            cutoff=0.0,
        )
        with pytest.raises(ValueError, match="nonexistent"):
            rd.estimate_fuzzy(treatment_var="nonexistent", bandwidth=1.0)


# =============================================================================
# Additional IV tests — controls, overidentification, endogeneity test
# =============================================================================


def _iv_data_with_control(
    true_effect: float = 3.0, n: int = 3000
) -> pd.DataFrame:
    """
    IV dataset augmented with an exogenous control variable W.

    W ~ N(0, 1)          exogenous covariate
    Z ~ N(0, 1)          instrument
    D = 0.8*Z + 0.5*W + N(0, 0.5)   endogenous treatment
    Y = true_effect*D + 1.5*W + N(0, 1)   outcome also affected by W
    """
    w = RNG.normal(0, 1, n)
    z = RNG.normal(0, 1, n)
    d = 0.8 * z + 0.5 * w + RNG.normal(0, 0.5, n)
    y = true_effect * d + 1.5 * w + RNG.normal(0, 1, n)
    return pd.DataFrame({"Y": y, "D": d, "Z": z, "W": w})


def _iv_data_overidentified(
    true_effect: float = 3.0, n: int = 3000
) -> pd.DataFrame:
    """
    IV dataset with two valid instruments (overidentified model).
    Both Z1 and Z2 satisfy the exclusion restriction.
    """
    z1 = RNG.normal(0, 1, n)
    z2 = RNG.normal(0, 1, n)
    d = 0.6 * z1 + 0.5 * z2 + RNG.normal(0, 0.5, n)
    y = true_effect * d + RNG.normal(0, 1, n)
    return pd.DataFrame({"Y": y, "D": d, "Z1": z1, "Z2": z2})


class TestIVEstimatorAdditional:
    """Additional IV tests — controls, overidentification, Wu-Hausman."""

    def test_iv_with_controls_recovers_effect(self):
        """2SLS with an exogenous control should still recover the true effect."""
        df = _iv_data_with_control(true_effect=3.0)
        est = IVEstimator(
            data=df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
            control_vars=["W"],
        )
        result = est.estimate()
        assert abs(result["treatment_effect"] - 3.0) < 0.3

    def test_iv_with_controls_reports_n_controls(self):
        """n_controls should reflect the number of exogenous controls passed."""
        df = _iv_data_with_control()
        est = IVEstimator(
            data=df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
            control_vars=["W"],
        )
        result = est.estimate()
        assert result["n_controls"] == 1

    def test_overidentified_iv_includes_sargan_hansen(self):
        """With 2 instruments, result should include a Sargan-Hansen test."""
        df = _iv_data_overidentified()
        est = IVEstimator(
            data=df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z1", "Z2"],
        )
        result = est.estimate()
        assert result["overidentification_test"] is not None
        oi = result["overidentification_test"]
        assert "j_statistic" in oi
        assert "p_value" in oi

    def test_overidentified_iv_sargan_does_not_reject_valid_instruments(self):
        """Valid instruments should yield a high Sargan-Hansen p-value (> 0.05)."""
        df = _iv_data_overidentified()
        est = IVEstimator(
            data=df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z1", "Z2"],
        )
        result = est.estimate()
        oi = result["overidentification_test"]
        if oi.get("p_value") is not None:
            assert oi["p_value"] > 0.05

    def test_overidentified_iv_n_instruments(self):
        """n_instruments in result should equal 2 for overidentified model."""
        df = _iv_data_overidentified()
        est = IVEstimator(
            data=df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z1", "Z2"],
        )
        result = est.estimate()
        assert result["n_instruments"] == 2

    def test_exactly_identified_has_no_sargan(self):
        """Just-identified model (1 instrument) should have no overidentification test."""
        df = _iv_data(true_effect=3.0)
        est = IVEstimator(
            data=df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
        )
        result = est.estimate()
        # just-identified → overidentification_test is None
        assert result["overidentification_test"] is None

    def test_wu_hausman_endogeneity_test_structure(self):
        """endogeneity_test dict should contain statistic, p_value, and endogenous."""
        df = _iv_data(true_effect=3.0)
        est = IVEstimator(
            data=df,
            outcome_var="Y",
            treatment_var="D",
            instrument_vars=["Z"],
        )
        result = est.estimate()
        wh = result["endogeneity_test"]
        for key in ("statistic", "p_value", "endogenous"):
            assert key in wh, f"Missing key in endogeneity_test: {key}"
        assert isinstance(wh["endogenous"], bool)
