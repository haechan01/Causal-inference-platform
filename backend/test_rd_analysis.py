import unittest

import numpy as np
import pandas as pd

from analysis.rd_analysis import RDEstimator


class TestRDEstimator(unittest.TestCase):
    def test_rd_estimation_basic(self):
        rng = np.random.default_rng(0)
        n = 800
        cutoff = 70.0

        # Running variable around cutoff
        x = cutoff + rng.uniform(-10, 10, size=n)

        # True discontinuity at cutoff
        tau_true = 2.0
        y = (
            1.0
            + 0.05 * (x - cutoff)
            + tau_true * (x >= cutoff).astype(float)
            + rng.normal(0, 0.4, size=n)
        )

        df = pd.DataFrame({"test_score": x, "college_gpa": y})
        rd = RDEstimator(df, running_var="test_score", outcome_var="college_gpa", cutoff=cutoff)

        res = rd.estimate(bandwidth=5.0, polynomial_order=1)

        self.assertIn("treatment_effect", res)
        self.assertIn("se", res)
        self.assertIn("ci_lower", res)
        self.assertIn("ci_upper", res)
        self.assertIn("p_value", res)
        self.assertGreater(res["n_total"], 0)

        # Effect should be close to true discontinuity (tolerance accounts for noise and local fit)
        self.assertAlmostEqual(res["treatment_effect"], tau_true, delta=0.35)

    def test_invalid_polynomial_order(self):
        df = pd.DataFrame({"x": [0, 1, 2, 3, 4], "y": [0, 1, 1, 2, 2]})
        rd = RDEstimator(df, running_var="x", outcome_var="y", cutoff=2.0)
        with self.assertRaises(ValueError):
            rd.estimate(bandwidth=1.0, polynomial_order=3)

    def test_insufficient_sample_size(self):
        # Only a handful of points within bandwidth
        df = pd.DataFrame({"x": [0, 0.1, -0.1, 10, 11], "y": [1, 1.2, 0.8, 5, 6]})
        rd = RDEstimator(df, running_var="x", outcome_var="y", cutoff=0.0)
        with self.assertRaises(ValueError):
            rd.estimate(bandwidth=0.5, polynomial_order=1)


if __name__ == "__main__":
    unittest.main()


