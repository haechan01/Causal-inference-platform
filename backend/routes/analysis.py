from flask import Blueprint, request, jsonify
import pandas as pd
from utils.did_analysis import run_did

analysis_bp = Blueprint('analysis', __name__)

@analysis_bp.route("/analyze/did", methods=["POST"])
def analyze_did():
    file = request.files["file"]
    treatment_col = request.form["treatment"]
    time_col = request.form["time"]
    outcome_col = request.form["outcome"]
    treatment_time = int(request.form["treatment_time"])

    df = pd.read_csv(file)
    result = run_did(df, treatment_col, time_col, outcome_col, treatment_time)
    return jsonify(result)
