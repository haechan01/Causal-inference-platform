"""
AI-powered analysis assistance endpoints
Focused on results interpretation
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from services.ai_service import get_ai_service

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

