"""
Causal inference analysis package.

Exports:
- RDEstimator  — Regression Discontinuity (sharp RD, IK bandwidth, triangular kernel)
- IVEstimator  — Instrumental Variables (2SLS, Wu-Hausman, Sargan-Hansen)
"""

from .rd_analysis import RDEstimator  # noqa: F401
from .iv_analysis import IVEstimator  # noqa: F401
