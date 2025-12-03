"""
AI-powered analysis assistance endpoints
Focused on results interpretation
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from services.ai_service import get_ai_service
from services.ai_assistant import get_ai_assistant

ai_bp = Blueprint('ai', __name__, url_prefix='/api/ai')


@ai_bp.route('/interpret-results', methods=['POST'])
@jwt_required()
def interpret_results():
    """
    AI interpretation of analysis results.
    
    Expected request body:
    {
        "analysis_results": {
            "results": {
                "did_estimate": 150.5,
                "standard_error": 65.2,
                "p_value": 0.023,
                "is_significant": true,
                "confidence_interval": {"lower": 20.3, "upper": 280.7},
                "statistics": {...},
                "parallel_trends_test": {...}
            }
        },
        "causal_question": "What was the effect of the policy on sales?",
        "method": "Difference-in-Differences",
        "parameters": {
            "outcome": "sales",
            "treatment": "policy"
        }
    }
    """
    try:
        print("=== AI INTERPRET RESULTS ENDPOINT CALLED ===")
        data = request.get_json()
        
        if not data:
            print("ERROR: No data provided")
            return jsonify({"error": "No data provided"}), 400
        
        analysis_results = data.get('analysis_results')
        causal_question = data.get('causal_question')
        method = data.get('method', 'Difference-in-Differences')
        parameters = data.get('parameters', {})
        
        if not analysis_results:
            print("ERROR: analysis_results is required")
            return jsonify({"error": "analysis_results is required"}), 400
        
        print(f"AI: Received request for method={method}, outcome={parameters.get('outcome')}, treatment={parameters.get('treatment')}")
        
        # Get AI service and interpret results
        try:
            ai_service = get_ai_service()
            print("AI: Service initialized successfully")
        except ValueError as ve:
            print(f"ERROR: Failed to initialize AI service: {str(ve)}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"AI service configuration error: {str(ve)}. Please check GOOGLE_API_KEY is set in backend/.env"}), 500
        except Exception as e:
            print(f"ERROR: Unexpected error initializing AI service: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"Failed to initialize AI service: {str(e)}"}), 500
        
        print("AI: Calling interpret_results...")
        try:
            interpretation = ai_service.interpret_results(
                analysis_results=analysis_results,
                causal_question=causal_question,
                method=method,
                parameters=parameters
            )
            print("AI: Interpretation completed successfully")
        except Exception as e:
            print(f"ERROR: interpret_results failed: {str(e)}")
            print(f"ERROR Type: {type(e).__name__}")
            import traceback
            traceback.print_exc()
            # Re-raise to be caught by outer exception handler
            raise
        
        return jsonify(interpretation), 200
        
    except ValueError as e:
        print(f"ERROR: Configuration error: {str(e)}")
        return jsonify({"error": f"Configuration error: {str(e)}"}), 500
    except Exception as e:
        import traceback
        print(f"ERROR: AI interpretation failed: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"AI interpretation failed: {str(e)}"}), 500


@ai_bp.route('/recommend-method', methods=['POST'])
@jwt_required()
def recommend_method():
    """
    AI recommendation for causal inference method based on study characteristics.
    
    Expected request body:
    {
        "treatment_variable": "policy",
        "outcome_variable": "sales",
        "is_time_series": true,
        "has_control_treatment_groups": true,
        "causal_question": "What was the effect of the policy on sales?"
    }
    """
    try:
        print("=== AI RECOMMEND METHOD ENDPOINT CALLED ===")
        data = request.get_json()
        
        if not data:
            print("ERROR: No data provided")
            return jsonify({"error": "No data provided"}), 400
        
        treatment_variable = data.get('treatment_variable', '').strip()
        outcome_variable = data.get('outcome_variable', '').strip()
        is_time_series = data.get('is_time_series', False)
        has_control_treatment_groups = data.get('has_control_treatment_groups', False)
        causal_question = data.get('causal_question', '').strip() or None
        
        if not treatment_variable or not outcome_variable:
            print("ERROR: treatment_variable and outcome_variable are required")
            return jsonify({"error": "treatment_variable and outcome_variable are required"}), 400
        
        print(f"AI: Received recommendation request - treatment={treatment_variable}, outcome={outcome_variable}, time_series={is_time_series}, groups={has_control_treatment_groups}")
        
        # Get AI service
        try:
            ai_service = get_ai_service()
            print("AI: Service initialized successfully")
        except ValueError as ve:
            print(f"ERROR: Failed to initialize AI service: {str(ve)}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"AI service configuration error: {str(ve)}. Please check GOOGLE_API_KEY is set in backend/.env"}), 500
        except Exception as e:
            print(f"ERROR: Unexpected error initializing AI service: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"Failed to initialize AI service: {str(e)}"}), 500
        
        print("AI: Calling recommend_method...")
        try:
            recommendation = ai_service.recommend_method(
                treatment_variable=treatment_variable,
                outcome_variable=outcome_variable,
                is_time_series=is_time_series,
                has_control_treatment_groups=has_control_treatment_groups,
                causal_question=causal_question
            )
            print("AI: Method recommendation completed successfully")
        except Exception as e:
            print(f"ERROR: recommend_method failed: {str(e)}")
            print(f"ERROR Type: {type(e).__name__}")
            import traceback
            traceback.print_exc()
            raise
        
        return jsonify(recommendation), 200
        
    except ValueError as e:
        print(f"ERROR: Configuration error: {str(e)}")
        return jsonify({"error": f"Configuration error: {str(e)}"}), 500
    except Exception as e:
        import traceback
        print(f"ERROR: AI method recommendation failed: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"AI method recommendation failed: {str(e)}"}), 500


@ai_bp.route('/suggest-variables', methods=['POST'])
@jwt_required()
def suggest_variables():
    """AI-powered variable role suggestions."""
    try:
        data = request.get_json()
        schema_info = data.get('schema_info')
        causal_question = data.get('causal_question')
        
        if not schema_info:
            return jsonify({"error": "schema_info is required"}), 400
        
        assistant = get_ai_assistant()
        suggestions = assistant.suggest_variable_roles(schema_info, causal_question)
        
        return jsonify(suggestions), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/validate-setup', methods=['POST'])
@jwt_required()
def validate_setup():
    """Validate analysis setup before running."""
    try:
        data = request.get_json()
        parameters = data.get('parameters')
        data_summary = data.get('data_summary')
        
        if not parameters:
            return jsonify({"error": "parameters are required"}), 400
        
        assistant = get_ai_assistant()
        validation = assistant.validate_did_setup(parameters, data_summary or {})
        
        return jsonify(validation), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/explain', methods=['POST'])
@jwt_required()
def explain_concept():
    """Get AI explanation of a concept."""
    try:
        data = request.get_json()
        concept = data.get('concept')
        user_level = data.get('level', 'beginner')
        
        if not concept:
            return jsonify({"error": "concept is required"}), 400
        
        assistant = get_ai_assistant()
        explanation = assistant.explain_concept(concept, user_level)
        
        return jsonify(explanation), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/next-steps', methods=['POST'])
@jwt_required()
def get_next_steps():
    """Get recommended next steps after analysis."""
    try:
        data = request.get_json()
        analysis_results = data.get('analysis_results')
        interpretation = data.get('interpretation', {})
        
        if not analysis_results:
            return jsonify({"error": "analysis_results required"}), 400
        
        assistant = get_ai_assistant()
        next_steps = assistant.generate_next_steps(analysis_results, interpretation)
        
        return jsonify(next_steps), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/data-quality-check', methods=['POST'])
@jwt_required()
def data_quality_check():
    """
    AI-powered data quality assessment for causal analysis.
    
    Expected request body:
    {
        "columns": [
            {"name": "column_name", "type": "numeric|categorical", "null_count": 0, "unique_count": 100, ...}
        ],
        "summary": {
            "total_rows": 1000,
            "total_columns": 10,
            "numeric_columns": 5,
            "categorical_columns": 5,
            "missing_cells": 50,
            "missing_percentage": 0.5
        }
    }
    """
    try:
        print("=== AI DATA QUALITY CHECK ENDPOINT CALLED ===")
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        columns = data.get('columns', [])
        summary = data.get('summary', {})
        
        if not columns:
            return jsonify({"error": "columns data is required"}), 400
        
        # Get AI service
        try:
            ai_service = get_ai_service()
        except ValueError as ve:
            return jsonify({"error": f"AI service configuration error: {str(ve)}"}), 500
        
        # Generate data quality assessment
        quality_assessment = ai_service.assess_data_quality(columns, summary)
        
        return jsonify(quality_assessment), 200
        
    except Exception as e:
        import traceback
        print(f"ERROR: AI data quality check failed: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"AI data quality check failed: {str(e)}"}), 500
