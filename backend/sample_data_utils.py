"""
Utilities for built-in sample datasets (CSV files in backend/sample data/).
Sample datasets are exposed to all users with negative IDs and resolved from local disk.
"""

import os
from datetime import datetime

# Directory containing sample CSV files (relative to this file: backend/sample data/)
SAMPLE_DATA_DIR = os.path.join(os.path.dirname(__file__), "sample data")

# Built-in sample datasets. IDs are negative to avoid clashing with DB ids.
SAMPLE_DATASETS = [
    {
        "id": -1,
        "name": "CCT Data",
        "file_name": "cct_data.csv",
        "s3_key": "__sample__/cct_data.csv",
        "user_id": None,  # Filled per-request
        "project_id": None,
        "schema_info": None,
        "created_at": None,
    },
    {
        "id": -2,
        "name": "Bodycam",
        "file_name": "bodycam.csv",
        "s3_key": "__sample__/bodycam.csv",
        "user_id": None,
        "project_id": None,
        "schema_info": None,
        "created_at": None,
    },
]


def get_sample_file_path(s3_key):
    """
    Return the absolute path to a sample CSV file given its s3_key (e.g. __sample__/cct_data.csv).
    Returns None if not a sample key or file does not exist.
    """
    if not s3_key or not s3_key.startswith("__sample__/"):
        return None
    filename = s3_key.replace("__sample__/", "", 1)
    path = os.path.join(SAMPLE_DATA_DIR, filename)
    return path if os.path.isfile(path) else None


def get_sample_dataset_by_id(dataset_id):
    """Return the sample dataset config for a negative dataset_id, or None."""
    for d in SAMPLE_DATASETS:
        if d["id"] == dataset_id:
            return d.copy()
    return None


def list_sample_datasets_for_user(current_user_id):
    """
    Return list of sample dataset dicts in API format (to_dict style),
    with user_id set to current_user_id and created_at set for display.
    """
    created = datetime.utcnow().isoformat() + "Z"
    out = []
    for d in SAMPLE_DATASETS:
        out.append({
            "id": d["id"],
            "user_id": current_user_id,
            "project_id": None,
            "name": d["name"],
            "file_name": d["file_name"],
            "s3_key": d["s3_key"],
            "schema_info": None,
            "created_at": created,
            "is_sample": True,
        })
    return out
