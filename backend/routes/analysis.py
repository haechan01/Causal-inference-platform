from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import pandas as pd
from utils.did_analysis import run_did

analysis_bp = Blueprint('analysis', __name__, url_prefix='/api/analysis')


@analysis_bp.route("/did", methods=["POST"])
@jwt_required()  # Protect this route - requires valid JWT token
def analyze_did():
    """
    Run Difference-in-Differences analysis
    Requires authentication via JWT token in Authorization header
    """
    current_user_id = get_jwt_identity()

    file = request.files["file"]
    treatment_col = request.form["treatment"]
    time_col = request.form["time"]
    outcome_col = request.form["outcome"]
    treatment_time = int(request.form["treatment_time"])

    df = pd.read_csv(file)
    result = run_did(df, treatment_col, time_col, outcome_col, treatment_time)

    # Add user context to result
    result['user_id'] = current_user_id

    return jsonify(result)

