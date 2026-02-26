"""
AI-powered analysis assistance endpoints
Focused on results interpretation
"""

import os
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, AIUsageLog
from services.ai_service import get_ai_service
from services.ai_assistant import get_ai_assistant
from utils.rate_limiter import limiter

ai_bp = Blueprint('ai', __name__, url_prefix='/api/ai')

# ---------------------------------------------------------------------------
# AI daily usage limits (configurable via environment variables)
# ---------------------------------------------------------------------------
# Maximum AI calls per user per day for each logical endpoint group.
# Override in .env, e.g. AI_DAILY_LIMIT_CHAT=100
AI_DAILY_LIMIT_CHAT = int(os.environ.get("AI_DAILY_LIMIT_CHAT", 50))
AI_DAILY_LIMIT_INTERPRET = int(os.environ.get("AI_DAILY_LIMIT_INTERPRET", 20))
AI_DAILY_LIMIT_RECOMMEND = int(os.environ.get("AI_DAILY_LIMIT_RECOMMEND", 30))
AI_DAILY_LIMIT_GENERAL = int(os.environ.get("AI_DAILY_LIMIT_GENERAL", 30))


def _check_and_increment_daily_limit(user_id: int, endpoint: str, daily_limit: int):
    """
    Check whether *user_id* has exceeded *daily_limit* calls for *endpoint*
    today.  If not, increment the counter atomically.

    Returns (allowed: bool, current_count: int, daily_limit: int).
    """
    current = AIUsageLog.get_daily_count(user_id, endpoint)
    if current >= daily_limit:
        return False, current, daily_limit
    new_count = AIUsageLog.increment(db.session, user_id, endpoint)
    return True, new_count, daily_limit


def _daily_limit_error(endpoint: str, current: int, limit: int):
    return jsonify({
        "error": (
            f"Daily AI usage limit reached for '{endpoint}' "
            f"({current}/{limit}). Resets at midnight UTC."
        ),
        "error_type": "daily_limit_exceeded",
        "current_usage": current,
        "daily_limit": limit,
    }), 429


@ai_bp.route('/interpret-results', methods=['POST'])
@jwt_required()
@limiter.limit("30 per minute; 100 per hour")
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

        # Daily usage limit check
        user_id = int(get_jwt_identity())
        allowed, count, limit = _check_and_increment_daily_limit(
            user_id, "interpret_results", AI_DAILY_LIMIT_INTERPRET
        )
        if not allowed:
            return _daily_limit_error("interpret-results", count, limit)

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
        # Check if this is a quota error
        if hasattr(e, 'is_quota_error') and e.is_quota_error:
            print(f"ERROR: API quota exceeded: {str(e)}")
            status_code = 429  # Too Many Requests
            error_response = {
                "error": str(e),
                "error_type": "quota_exceeded",
                "retry_after": getattr(e, 'retry_delay', None)
            }
            return jsonify(error_response), status_code
        else:
            print(f"ERROR: Configuration error: {str(e)}")
            return jsonify({"error": f"Configuration error: {str(e)}"}), 500
    except Exception as e:
            import traceback
            error_str = str(e)
            print(f"ERROR: AI interpretation failed: {error_str}")
            traceback.print_exc()
            
            # Check if it's a quota error even if not caught as ValueError
            if '429' in error_str or 'quota' in error_str.lower() or 'rate.limit' in error_str.lower():
                # Try to extract retry delay
                import re
                delay_match = re.search(r'retry.*?(\d+\.?\d*)\s*s', error_str, re.IGNORECASE)
                retry_delay = float(delay_match.group(1)) if delay_match else None
                
                error_response = {
                    "error": f"API quota exceeded. {'Please wait ' + str(int(retry_delay)) + ' seconds before trying again.' if retry_delay else 'Please check your Google Cloud billing and quota limits.'}",
                    "error_type": "quota_exceeded",
                    "retry_after": retry_delay,
                    "details": "You can check your usage at https://ai.dev/usage"
                }
                return jsonify(error_response), 429
            else:
                return jsonify({"error": f"AI interpretation failed: {error_str}"}), 500


@ai_bp.route('/recommend-method', methods=['POST'])
@jwt_required()
@limiter.limit("30 per minute; 100 per hour")
def recommend_method():
    """
    AI Interpretation for causal inference method based on study characteristics.
    
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

        # Daily usage limit check
        user_id = int(get_jwt_identity())
        allowed, count, limit = _check_and_increment_daily_limit(
            user_id, "recommend_method", AI_DAILY_LIMIT_RECOMMEND
        )
        if not allowed:
            return _daily_limit_error("recommend-method", count, limit)

        data = request.get_json()
        
        if not data:
            print("ERROR: No data provided")
            return jsonify({"error": "No data provided"}), 400
        
        treatment_variable = data.get('treatment_variable', '').strip()
        outcome_variable = data.get('outcome_variable', '').strip()
        causal_question = data.get('causal_question', '').strip() or None
        # New structured question answers
        q1_cutoff = data.get('q1_cutoff', None)         # 'yes' | 'no' | 'unsure' | None
        q2_time_change = data.get('q2_time_change', None)
        q3_instrument = data.get('q3_instrument', None)
        # Legacy params for backward compatibility
        is_time_series = data.get('is_time_series', False)
        has_control_treatment_groups = data.get('has_control_treatment_groups', False)
        potential_instrument = data.get('potential_instrument', '').strip() or None

        if not treatment_variable or not outcome_variable:
            print("ERROR: treatment_variable and outcome_variable are required")
            return jsonify({"error": "treatment_variable and outcome_variable are required"}), 400

        print(f"AI: Received recommendation request - treatment={treatment_variable}, outcome={outcome_variable}, q1={q1_cutoff}, q2={q2_time_change}, q3={q3_instrument}")
        
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
                causal_question=causal_question,
                q1_cutoff=q1_cutoff,
                q2_time_change=q2_time_change,
                q3_instrument=q3_instrument,
                is_time_series=is_time_series,
                has_control_treatment_groups=has_control_treatment_groups,
                potential_instrument=potential_instrument
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
@limiter.limit("30 per minute; 100 per hour")
def suggest_variables():
    """AI-powered variable role suggestions."""
    try:
        user_id = int(get_jwt_identity())
        allowed, count, limit = _check_and_increment_daily_limit(
            user_id, "general_ai", AI_DAILY_LIMIT_GENERAL
        )
        if not allowed:
            return _daily_limit_error("suggest-variables", count, limit)

        data = request.get_json()
        schema_info = data.get('schema_info')
        causal_question = data.get('causal_question')
        method = data.get('method', 'did')  # 'did' or 'rd'
        
        if not schema_info:
            return jsonify({"error": "schema_info is required"}), 400
        
        assistant = get_ai_assistant()
        if method == 'rd':
            suggestions = assistant.suggest_rd_variable_roles(schema_info, causal_question)
        else:
            suggestions = assistant.suggest_variable_roles(schema_info, causal_question)
        
        return jsonify(suggestions), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/validate-setup', methods=['POST'])
@jwt_required()
@limiter.limit("30 per minute; 100 per hour")
def validate_setup():
    """Validate analysis setup before running."""
    try:
        user_id = int(get_jwt_identity())
        allowed, count, limit = _check_and_increment_daily_limit(
            user_id, "general_ai", AI_DAILY_LIMIT_GENERAL
        )
        if not allowed:
            return _daily_limit_error("validate-setup", count, limit)

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
@limiter.limit("30 per minute; 100 per hour")
def explain_concept():
    """Get AI explanation of a concept."""
    try:
        user_id = int(get_jwt_identity())
        allowed, count, limit = _check_and_increment_daily_limit(
            user_id, "general_ai", AI_DAILY_LIMIT_GENERAL
        )
        if not allowed:
            return _daily_limit_error("explain", count, limit)

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
@limiter.limit("30 per minute; 100 per hour")
def get_next_steps():
    """Get recommended next steps after analysis."""
    try:
        user_id = int(get_jwt_identity())
        allowed, count, limit = _check_and_increment_daily_limit(
            user_id, "general_ai", AI_DAILY_LIMIT_GENERAL
        )
        if not allowed:
            return _daily_limit_error("next-steps", count, limit)

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
@limiter.limit("30 per minute; 100 per hour")
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

        # Daily usage limit check
        user_id = int(get_jwt_identity())
        allowed, count, limit = _check_and_increment_daily_limit(
            user_id, "general_ai", AI_DAILY_LIMIT_GENERAL
        )
        if not allowed:
            return _daily_limit_error("data-quality-check", count, limit)

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


@ai_bp.route('/chat', methods=['POST'])
@jwt_required()
@limiter.limit("20 per minute; 200 per hour")
def chat():
    """
    Chat with AI about the study, dataset, or causal inference concepts.

    Expected request body:
    {
        "message": "What is the parallel trends assumption?",
        "conversation_history": [
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."}
        ],
        "analysis_context": {
            "parameters": {...},
            "results": {...}
        }
    }

    Rate limit: 20 requests per minute (via flask-limiter) +
                AI_DAILY_LIMIT_CHAT requests per day (via db usage log).
    """
    try:
        user_id_str = get_jwt_identity()
        user_id = int(user_id_str)
        now = datetime.now()

        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        message = data.get('message', '').strip()
        if not message:
            return jsonify({"error": "Message is required"}), 400
        
        # Check message length (max 2000 characters)
        MAX_MESSAGE_LENGTH = 2000
        if len(message) > MAX_MESSAGE_LENGTH:
            return jsonify({
                "error": f"Message too long. Maximum {MAX_MESSAGE_LENGTH} characters allowed."
            }), 400

        # Daily usage limit check
        allowed, count, limit = _check_and_increment_daily_limit(
            user_id, "chat", AI_DAILY_LIMIT_CHAT
        )
        if not allowed:
            return _daily_limit_error("chat", count, limit)

        # Get conversation history, context, and dataset info
        conversation_history = data.get('conversation_history', [])
        analysis_context = data.get('analysis_context', {})
        dataset_info = data.get('dataset_info', {})
        
        # Validate conversation history format and limit length
        if conversation_history:
            # Limit to last 20 messages
            conversation_history = conversation_history[-20:]
            # Validate format
            validated_history = []
            for msg in conversation_history:
                if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                    role = msg.get('role')
                    content = str(msg.get('content', ''))
                    # Limit individual message length
                    if len(content) > 2000:
                        content = content[:2000] + "..."
                    if role in ['user', 'assistant'] and content:
                        validated_history.append({
                            'role': role,
                            'content': content
                        })
            conversation_history = validated_history
        
        # Get AI assistant
        try:
            assistant = get_ai_assistant()
        except Exception as e:
            return jsonify({"error": f"AI service error: {str(e)}"}), 500
        
        # Call chat method
        try:
            result = assistant.chat(
                user_message=message,
                conversation_history=conversation_history,
                analysis_context=analysis_context,
                dataset_info=dataset_info
            )
            
            # Limit response length (max 4000 characters)
            MAX_RESPONSE_LENGTH = 4000
            response_text = result.get('response', '')
            if len(response_text) > MAX_RESPONSE_LENGTH:
                response_text = response_text[:MAX_RESPONSE_LENGTH] + "...\n\n[Response truncated due to length limit]"
            
            return jsonify({
                "response": response_text,
                "followup_questions": result.get('followup_questions', []),
                "timestamp": now.isoformat()
            }), 200
            
        except Exception as e:
            import traceback
            print(f"ERROR: Chat failed: {str(e)}")
            traceback.print_exc()
            return jsonify({"error": f"Chat failed: {str(e)}"}), 500
            
    except Exception as e:
        import traceback
        print(f"ERROR: Chat endpoint error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"Chat endpoint error: {str(e)}"}), 500


@ai_bp.route('/usage', methods=['GET'])
@jwt_required()
def get_usage():
    """
    Return the current user's AI usage for today across all endpoint groups.

    Response example:
    {
        "date": "2026-02-26",
        "usage": {
            "chat":             {"used": 5,  "limit": 50},
            "interpret_results":{"used": 2,  "limit": 20},
            "recommend_method": {"used": 0,  "limit": 30},
            "general_ai":       {"used": 3,  "limit": 30}
        }
    }
    """
    try:
        from datetime import date
        user_id = int(get_jwt_identity())
        today = date.today()

        usage = {
            "chat": {
                "used": AIUsageLog.get_daily_count(user_id, "chat", today),
                "limit": AI_DAILY_LIMIT_CHAT,
            },
            "interpret_results": {
                "used": AIUsageLog.get_daily_count(user_id, "interpret_results", today),
                "limit": AI_DAILY_LIMIT_INTERPRET,
            },
            "recommend_method": {
                "used": AIUsageLog.get_daily_count(user_id, "recommend_method", today),
                "limit": AI_DAILY_LIMIT_RECOMMEND,
            },
            "general_ai": {
                "used": AIUsageLog.get_daily_count(user_id, "general_ai", today),
                "limit": AI_DAILY_LIMIT_GENERAL,
            },
        }

        return jsonify({"date": today.isoformat(), "usage": usage}), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch usage: {str(e)}"}), 500
