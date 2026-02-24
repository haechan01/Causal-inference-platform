from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import pandas as pd
from utils.did_analysis import run_did
from analysis.iv_analysis import IVEstimator

analysis_bp = Blueprint('analysis', __name__, url_prefix='/api/analysis')

@analysis_bp.route("/did", methods=["POST"])
@jwt_required()
def analyze_did():
    """
    Run Difference-in-Differences analysis.
    
    Required form fields:
    - file: CSV file with panel data
    - treatment: Column name for treatment indicator (0/1)
    - time: Column name for time periods
    - outcome: Column name for outcome variable
    - treatment_time: Time period when treatment begins
    
    Optional form fields:
    - unit: Column name for unit identifier (e.g., state_id, person_id)
           If provided, enables unit fixed effects and clustered standard errors
    
    Returns:
    - DiD estimate with confidence intervals
    - Parallel trends test results
    - Diagnostic visualizations
    """
    current_user_id = get_jwt_identity()
    
    # =========================================================
    # STEP 1: Validate required fields
    # =========================================================
    
    required_fields = ["treatment", "time", "outcome", "treatment_time"]
    missing_fields = [f for f in required_fields if f not in request.form]
    
    if missing_fields:
        return jsonify({
            "error": f"Missing required fields: {', '.join(missing_fields)}"
        }), 400
    
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    # =========================================================
    # STEP 2: Extract parameters
    # =========================================================
    
    file = request.files["file"]
    treatment_col = request.form["treatment"]
    time_col = request.form["time"]
    outcome_col = request.form["outcome"]
    
    # Handle treatment_time (could be int or float depending on data)
    try:
        treatment_time_str = request.form["treatment_time"]
        # Try int first, then float
        if '.' in treatment_time_str:
            treatment_time = float(treatment_time_str)
        else:
            treatment_time = int(treatment_time_str)
    except ValueError:
        return jsonify({
            "error": "treatment_time must be a number"
        }), 400
    
    # Optional: unit column for panel data
    unit_col = request.form.get("unit", None)
    if unit_col == "":  # Handle empty string from form
        unit_col = None
    
    # =========================================================
    # STEP 3: Load and validate data
    # =========================================================
    
    try:
        df = pd.read_csv(file)
    except Exception as e:
        return jsonify({
            "error": f"Could not read CSV file: {str(e)}"
        }), 400
    
    # Check that all specified columns exist
    required_columns = [treatment_col, time_col, outcome_col]
    if unit_col:
        required_columns.append(unit_col)
    
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        return jsonify({
            "error": f"Columns not found in data: {', '.join(missing_columns)}",
            "available_columns": list(df.columns)
        }), 400
    
    # Validate treatment column (should be 0/1)
    unique_treatments = df[treatment_col].dropna().unique()
    if not set(unique_treatments).issubset({0, 1}):
        return jsonify({
            "error": f"Treatment column '{treatment_col}' should contain only 0 and 1. "
                     f"Found: {list(unique_treatments)}"
        }), 400
    
    # Validate treatment_time exists in data
    unique_times = df[time_col].unique()
    if treatment_time not in unique_times:
        return jsonify({
            "error": f"treatment_time '{treatment_time}' not found in time column. "
                     f"Available periods: {sorted(unique_times)}"
        }), 400
    
    # Check for sufficient pre-treatment periods
    pre_periods = [t for t in unique_times if t < treatment_time]
    if len(pre_periods) < 2:
        # Not an error, but add a warning - analysis will still run
        pass  # Warning will be included in results
    
    # =========================================================
    # STEP 4: Run analysis
    # =========================================================
    
    try:
        result = run_did(
            df=df,
            treatment_col=treatment_col,
            time_col=time_col,
            outcome_col=outcome_col,
            treatment_time=treatment_time,
            unit_col=unit_col  # Pass the optional unit column
        )
    except Exception as e:
        return jsonify({
            "error": f"Analysis failed: {str(e)}"
        }), 500
    
    # =========================================================
    # STEP 5: Add metadata and return
    # =========================================================
    
    result['metadata'] = {
        'user_id': current_user_id,
        'columns_used': {
            'treatment': treatment_col,
            'time': time_col,
            'outcome': outcome_col,
            'unit': unit_col
        },
        'treatment_time': treatment_time,
        'used_unit_fixed_effects': unit_col is not None
    }
    
    return jsonify(result)

@analysis_bp.route("/did/validate", methods=["POST"])
@jwt_required()
def validate_did_data():
    """
    Validate uploaded data before running full analysis.
    Returns column information and data summary to help users select correct columns.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files["file"]
    
    try:
        df = pd.read_csv(file)
    except Exception as e:
        return jsonify({"error": f"Could not read CSV file: {str(e)}"}), 400
    
    # Analyze each column
    columns_info = []
    for col in df.columns:
        col_data = df[col].dropna()
        
        info = {
            "name": col,
            "dtype": str(df[col].dtype),
            "unique_values": int(col_data.nunique()),
            "null_count": int(df[col].isnull().sum()),
            "sample_values": col_data.head(5).tolist()
        }
        
        # Suggest column type based on characteristics
        if set(col_data.unique()).issubset({0, 1}):
            info["suggested_role"] = "treatment"
            info["suggestion_reason"] = "Contains only 0 and 1"
        elif pd.api.types.is_numeric_dtype(col_data):
            if col_data.nunique() < 20 and col_data.min() >= 1900:
                info["suggested_role"] = "time"
                info["suggestion_reason"] = "Looks like year values"
            elif col_data.nunique() < 50:
                info["suggested_role"] = "time_or_unit"
                info["suggestion_reason"] = "Few unique numeric values"
            else:
                info["suggested_role"] = "outcome"
                info["suggestion_reason"] = "Continuous numeric variable"
        elif pd.api.types.is_string_dtype(col_data) or col_data.nunique() < len(df) / 2:
            info["suggested_role"] = "unit"
            info["suggestion_reason"] = "Categorical/identifier variable"
        else:
            info["suggested_role"] = "unknown"
            info["suggestion_reason"] = ""
        
        columns_info.append(info)
    
    # Get time period information if we can identify it
    time_candidates = [c for c in columns_info if c["suggested_role"] in ["time", "time_or_unit"]]
    
    return jsonify({
        "row_count": len(df),
        "column_count": len(df.columns),
        "columns": columns_info,
        "time_candidates": [c["name"] for c in time_candidates],
        "preview": df.head(10).to_dict(orient="records")
    })

@analysis_bp.route("/did/columns", methods=["POST"])  
@jwt_required()
def suggest_columns():
    """
    AI-powered column suggestion endpoint.
    Uses heuristics to suggest which columns to use for treatment, time, outcome, and unit.
    
    This can be enhanced with your Gemini integration later.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files["file"]
    
    try:
        df = pd.read_csv(file)
    except Exception as e:
        return jsonify({"error": f"Could not read CSV file: {str(e)}"}), 400
    
    suggestions = {
        "treatment": None,
        "time": None,
        "outcome": None,
        "unit": None,
        "confidence": {}
    }
    
    for col in df.columns:
        col_lower = col.lower()
        col_data = df[col].dropna()
        
        # Treatment detection
        if set(col_data.unique()).issubset({0, 1}):
            if any(word in col_lower for word in ['treat', 'intervention', 'policy', 'program']):
                suggestions["treatment"] = col
                suggestions["confidence"]["treatment"] = "high"
            elif suggestions["treatment"] is None:
                suggestions["treatment"] = col
                suggestions["confidence"]["treatment"] = "medium"
        
        # Time detection
        if pd.api.types.is_numeric_dtype(col_data):
            unique_vals = sorted(col_data.unique())
            if any(word in col_lower for word in ['year', 'time', 'period', 'date']):
                suggestions["time"] = col
                suggestions["confidence"]["time"] = "high"
            elif len(unique_vals) < 30 and all(1900 <= v <= 2100 for v in unique_vals if pd.notna(v)):
                if suggestions["time"] is None:
                    suggestions["time"] = col
                    suggestions["confidence"]["time"] = "medium"
        
        # Unit detection
        if any(word in col_lower for word in ['id', 'unit', 'state', 'county', 'person', 'firm', 'entity']):
            suggestions["unit"] = col
            suggestions["confidence"]["unit"] = "high"
        
        # Outcome detection (continuous numeric, not already assigned)
        if pd.api.types.is_numeric_dtype(col_data) and col_data.nunique() > 20:
            if any(word in col_lower for word in ['outcome', 'result', 'value', 'amount', 'rate', 'score']):
                suggestions["outcome"] = col
                suggestions["confidence"]["outcome"] = "high"
            elif suggestions["outcome"] is None and col not in [suggestions["treatment"], suggestions["time"], suggestions["unit"]]:
                suggestions["outcome"] = col
                suggestions["confidence"]["outcome"] = "low"
    
    # Suggest treatment_time if we identified time column
    if suggestions["time"]:
        time_values = sorted(df[suggestions["time"]].unique())
        if len(time_values) >= 2:
            # Suggest middle point as treatment time
            mid_idx = len(time_values) // 2
            suggestions["treatment_time"] = {
                "suggested": time_values[mid_idx],
                "available_periods": time_values,
                "note": "Please verify this is when treatment actually began"
            }
    
    return jsonify(suggestions)


# =============================================================================
# INSTRUMENTAL VARIABLES (IV / 2SLS)
# =============================================================================

@analysis_bp.route("/iv", methods=["POST"])
@jwt_required()
def analyze_iv():
    """
    Run Two-Stage Least Squares (2SLS) IV estimation.

    Required form fields:
    - file        : CSV file
    - outcome     : outcome / dependent variable column
    - treatment   : endogenous treatment column
    - instruments : comma-separated list of instrument columns

    Optional form fields:
    - controls    : comma-separated list of exogenous control columns
    - run_sensitivity : "true" to run sensitivity analysis (leave-one-out /
                        Anderson-Rubin CI). Defaults to false.

    Returns:
    - 2SLS treatment effect with 95% CI
    - First-stage F-statistic and instrument-strength assessment
    - Wu-Hausman endogeneity test
    - Sargan-Hansen overidentification test (if >1 instrument)
    - OLS comparison estimate
    - Sensitivity analysis (optional)
    """
    current_user_id = get_jwt_identity()

    # =========================================================
    # STEP 1: Validate required fields
    # =========================================================
    required_fields = ["outcome", "treatment", "instruments"]
    missing_fields = [f for f in required_fields if f not in request.form]
    if missing_fields:
        return jsonify({
            "error": f"Missing required fields: {', '.join(missing_fields)}"
        }), 400

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    # =========================================================
    # STEP 2: Extract parameters
    # =========================================================
    file = request.files["file"]
    outcome_col = request.form["outcome"].strip()
    treatment_col = request.form["treatment"].strip()

    # instruments and controls are comma-separated column names
    instruments_raw = request.form["instruments"].strip()
    instrument_cols = [c.strip() for c in instruments_raw.split(",") if c.strip()]
    if not instrument_cols:
        return jsonify({"error": "At least one instrument column must be specified."}), 400

    controls_raw = request.form.get("controls", "").strip()
    control_cols = [c.strip() for c in controls_raw.split(",") if c.strip()] or None

    run_sensitivity = request.form.get("run_sensitivity", "false").lower() == "true"

    # =========================================================
    # STEP 3: Load and validate data
    # =========================================================
    try:
        df = pd.read_csv(file)
    except Exception as e:
        return jsonify({"error": f"Could not read CSV file: {str(e)}"}), 400

    # Verify all referenced columns exist
    required_columns = [outcome_col, treatment_col] + instrument_cols + (control_cols or [])
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        return jsonify({
            "error": f"Columns not found in data: {', '.join(missing_columns)}",
            "available_columns": list(df.columns),
        }), 400

    # Sanity: instruments must differ from treatment and outcome
    for z in instrument_cols:
        if z == treatment_col:
            return jsonify({
                "error": f"Instrument '{z}' is the same as the treatment column. "
                         "Instruments must be distinct from the endogenous treatment."
            }), 400
        if z == outcome_col:
            return jsonify({
                "error": f"Instrument '{z}' is the same as the outcome column."
            }), 400

    # =========================================================
    # STEP 4: Run analysis
    # =========================================================
    try:
        estimator = IVEstimator(
            data=df,
            outcome_var=outcome_col,
            treatment_var=treatment_col,
            instrument_vars=instrument_cols,
            control_vars=control_cols,
        )
        result = estimator.estimate()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

    # =========================================================
    # STEP 5: Optional sensitivity analysis
    # =========================================================
    if run_sensitivity:
        try:
            result["sensitivity_analysis"] = estimator.sensitivity_analysis()
        except Exception as e:
            result["sensitivity_analysis"] = {"error": str(e)}

    # =========================================================
    # STEP 6: Add metadata and return
    # =========================================================
    result["metadata"] = {
        "user_id": current_user_id,
        "columns_used": {
            "outcome": outcome_col,
            "treatment": treatment_col,
            "instruments": instrument_cols,
            "controls": control_cols,
        },
    }

    return jsonify(result)


@analysis_bp.route("/iv/validate", methods=["POST"])
@jwt_required()
def validate_iv_data_route():
    """
    Validate uploaded data and return column information to help the user
    select appropriate outcome, treatment, instrument, and control columns.

    Returns column summaries with suggested roles.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    try:
        df = pd.read_csv(file)
    except Exception as e:
        return jsonify({"error": f"Could not read CSV file: {str(e)}"}), 400

    columns_info = []
    for col in df.columns:
        col_data = df[col].dropna()
        numeric = pd.api.types.is_numeric_dtype(col_data)

        info = {
            "name": col,
            "dtype": str(df[col].dtype),
            "unique_values": int(col_data.nunique()),
            "null_count": int(df[col].isnull().sum()),
            "sample_values": col_data.head(5).tolist(),
            "is_numeric": numeric,
        }

        col_lower = col.lower()

        # Suggest role heuristics
        if set(col_data.unique()).issubset({0, 1}):
            info["suggested_role"] = "treatment"
            info["suggestion_reason"] = "Binary variable (0/1)"
        elif numeric and col_data.nunique() > 20:
            if any(w in col_lower for w in ["outcome", "result", "wage", "earn", "income",
                                             "score", "rate", "amount", "value", "gdp"]):
                info["suggested_role"] = "outcome"
                info["suggestion_reason"] = "Continuous numeric, name suggests outcome"
            elif any(w in col_lower for w in ["instrument", "iv", "distance", "lottery",
                                               "assign", "random", "quarter", "birth"]):
                info["suggested_role"] = "instrument"
                info["suggestion_reason"] = "Name suggests a potential instrument"
            else:
                info["suggested_role"] = "outcome_or_control"
                info["suggestion_reason"] = "Continuous numeric variable"
        elif not numeric:
            info["suggested_role"] = "identifier"
            info["suggestion_reason"] = "Non-numeric, likely an identifier"
        else:
            info["suggested_role"] = "control_or_instrument"
            info["suggestion_reason"] = "Low-cardinality numeric"

        columns_info.append(info)

    return jsonify({
        "row_count": len(df),
        "column_count": len(df.columns),
        "columns": columns_info,
        "preview": df.head(10).to_dict(orient="records"),
    })
