"""Unit tests for Regression Discontinuity (RD) estimator utilities."""

import unittest

import numpy as np
import pandas as pd

from analysis.rd_analysis import RDEstimator


class TestRDEstimator(unittest.TestCase):
    """Basic behavioral tests for RD estimation, bandwidth, and sensitivity."""

    def test_rd_estimation_basic(self):
        """Estimate a known discontinuity and ensure we recover it."""
        rng = np.random.default_rng(0)
        n_obs = 800
        cutoff = 70.0

        # Running variable around cutoff
        x_vals = cutoff + rng.uniform(-10, 10, size=n_obs)

        # True discontinuity at cutoff
        tau_true = 2.0
        y_vals = (
            1.0
            + 0.05 * (x_vals - cutoff)
            + tau_true * (x_vals >= cutoff).astype(float)
            + rng.normal(0, 0.4, size=n_obs)
        )

        df = pd.DataFrame({"test_score": x_vals, "college_gpa": y_vals})
        rd = RDEstimator(
            df,
            running_var="test_score",
            outcome_var="college_gpa",
            cutoff=cutoff,
        )

        res = rd.estimate(bandwidth=5.0, polynomial_order=1)

        self.assertIn("treatment_effect", res)
        self.assertIn("se", res)
        self.assertIn("ci_lower", res)
        self.assertIn("ci_upper", res)
        self.assertIn("p_value", res)
        self.assertGreater(res["n_total"], 0)

        # Effect should be close to true discontinuity (tolerance accounts for
        # noise and local fit)
        self.assertAlmostEqual(res["treatment_effect"], tau_true, delta=0.35)

    def test_invalid_polynomial_order(self):
        """Reject polynomials above quadratic."""
        df = pd.DataFrame({"x": [0, 1, 2, 3, 4], "y": [0, 1, 1, 2, 2]})
        rd = RDEstimator(df, running_var="x", outcome_var="y", cutoff=2.0)
        with self.assertRaises(ValueError):
            rd.estimate(bandwidth=1.0, polynomial_order=3)

    def test_insufficient_sample_size(self):
        """Require minimum sample sizes within bandwidth and on each side."""
        # Only a handful of points within bandwidth
        df = pd.DataFrame(
            {"x": [0, 0.1, -0.1, 10, 11], "y": [1, 1.2, 0.8, 5, 6]}
        )
        rd = RDEstimator(df, running_var="x", outcome_var="y", cutoff=0.0)
        with self.assertRaises(ValueError):
            rd.estimate(bandwidth=0.5, polynomial_order=1)

    def test_optimal_bandwidth_and_sensitivity(self):
        """Ensure bandwidth + sensitivity return expected structure."""
        rng = np.random.default_rng(1)
        n_obs = 600
        cutoff = 0.0

        x = rng.uniform(-10, 10, size=n_obs)
        y = (
            0.2 * x
            + 1.5 * (x >= cutoff).astype(float)
            + rng.normal(0, 1.0, size=n_obs)
        )

        df = pd.DataFrame({"x": x, "y": y})
        rd = RDEstimator(df, running_var="x", outcome_var="y", cutoff=cutoff)

        bw = rd.calculate_optimal_bandwidth()
        self.assertIn("bandwidth", bw)
        self.assertGreater(bw["bandwidth"], 0)

        sens = rd.sensitivity_analysis(n_bandwidths=10)
        self.assertIn("results", sens)
        self.assertEqual(len(sens["results"]), 10)
        self.assertIn("optimal_bandwidth", sens)
        self.assertIn("stability_coefficient", sens)
        self.assertIn("interpretation", sens)


if __name__ == "__main__":
    unittest.main()
