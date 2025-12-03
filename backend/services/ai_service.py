"""
Simplified AI Service - Direct Google Gemini API Calls
Focused on results interpretation for causal analysis
"""

import os
import json
import google.generativeai as genai
from typing import Dict, Any, Optional


class CausalAIService:
    """
    Simplified AI service using direct Google Gemini API calls.
    Currently focused on results interpretation.
    """
    
    def __init__(self):
        self.api_key = os.getenv('GOOGLE_API_KEY')
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not found in environment variables")
        
        # Configure Gemini
        genai.configure(api_key=self.api_key)
        
        # Debug: Print what model name is configured
        user_model = os.getenv('AI_MODEL_NAME')
        print(f"DEBUG: AI_MODEL_NAME from env: {user_model}")
        
        # List available models and find one that supports generateContent
        try:
            print("=== Listing available Gemini models ===")
            available_models = []
            for model in genai.list_models():
                if 'generateContent' in model.supported_generation_methods:
                    # Model name might be like "models/gemini-pro" - extract the short name
                    model_name = model.name.split('/')[-1] if '/' in model.name else model.name
                    available_models.append((model_name, model.name))
                    print(f"  Available: {model_name} (full name: {model.name})")
            
            if not available_models:
                raise ValueError("No Gemini models available with generateContent support. Check your API key and permissions.")
            
            # Use the first available model, or user's preference
            user_model = os.getenv('AI_MODEL_NAME')
            if user_model:
                # User specified a model - try to find it
                model_found = None
                for short_name, full_name in available_models:
                    if short_name == user_model or full_name == user_model:
                        model_found = full_name
                        break
                
                if model_found:
                    model_name_to_use = model_found
                    print(f"Using user-specified model: {model_name_to_use}")
                else:
                    # User model not found, use first available
                    model_name_to_use = available_models[0][1]
                    print(f"Warning: User-specified model '{user_model}' not found. Using: {model_name_to_use}")
            else:
                # Use first available model
                model_name_to_use = available_models[0][1]
                print(f"Using first available model: {model_name_to_use}")
                
        except Exception as e:
            print(f"Error listing models: {e}")
            # Fallback to user preference or safe default
            user_model = os.getenv('AI_MODEL_NAME', 'gemini-1.5-flash')
            model_name_to_use = user_model
            print(f"Falling back to model: {model_name_to_use}")
            # Try the fallback model - if it fails, we'll catch it later
        
        # Create model instance with adjusted safety settings
        # Lower safety thresholds to allow analysis of statistical results
        safety_settings = [
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_HATE_SPEECH",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
        ]
        
        print(f"DEBUG: Creating model with name: {model_name_to_use}")
        self.model = genai.GenerativeModel(
            model_name=model_name_to_use,
            generation_config={
                'temperature': float(os.getenv('AI_TEMPERATURE', '0.7')),
                'max_output_tokens': int(os.getenv('AI_MAX_TOKENS', '16384')),  # Default to 16384 for longer responses
            },
            safety_settings=safety_settings
        )
        self._model_name = model_name_to_use
        print(f"AI Service initialized with model: {model_name_to_use}")
        
        # Knowledge base (embedded in prompts)
        self.knowledge_base = self._get_knowledge_base()
    
    def _get_knowledge_base(self) -> str:
        """
        Return knowledge base as a string to include in prompts.
        """
        return """
Causal Inference Methods Knowledge Base:

DIFFERENCE-IN-DIFFERENCES (DiD):
- Method used when treatment and control groups are observed over time
- Key Assumptions:
  * Parallel trends: Groups would follow parallel trends without treatment
  * No spillover effects
  * Stable unit treatment value assumption (SUTVA)
- Parallel trends test: If p-value > 0.05, parallel trends likely hold
- Best for: Policy evaluations, state-level interventions, program rollouts

STATISTICAL SIGNIFICANCE:
- p < 0.05: Conventionally "statistically significant"
- p < 0.01: Strong evidence
- p < 0.001: Very strong evidence
- p > 0.05: Not statistically significant (cannot reject null hypothesis)

CONFIDENCE INTERVALS:
- 95% CI: Range that contains true effect 95% of the time
- If CI includes zero: Effect not statistically significant
- Width indicates precision of estimate

EFFECT SIZE INTERPRETATION:
- Absolute effect: Raw difference in units of outcome
- Percentage effect: (Effect / Baseline mean) × 100
- Consider economic/practical importance, not just p-values

PARALLEL TRENDS ASSUMPTION:
- Treatment and control groups should follow similar trends before treatment
- Tested by: Visual inspection, statistical test of pre-treatment interaction
- If violated: Consider different control group, add covariates, or alternative method
- p-value > 0.05 suggests parallel trends likely hold
        """
    
    def _call_gemini(self, prompt: str) -> str:
        """
        Simple wrapper for Gemini API calls.
        
        Args:
            prompt: The main prompt
        
        Returns:
            Response text from Gemini
        """
        try:
            # Generate with a higher token limit - force a minimum of 8192 for JSON responses
            max_tokens_str = os.getenv('AI_MAX_TOKENS', '16384')
            max_tokens = int(max_tokens_str)  # Convert string to int
            
            print(f"AI: Generating content with max_output_tokens={max_tokens}")
            print(f"AI: Prompt preview (first 200 chars): {prompt[:200]}...")
            
            try:
                # Override generation config to use higher token limit
                response = self.model.generate_content(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        max_output_tokens=max_tokens,
                        temperature=float(os.getenv('AI_TEMPERATURE', '0.7')),
                    )
                )
                print(f"AI: Got response, candidates: {len(response.candidates) if response.candidates else 0}")
            except Exception as e:
                print(f"AI: Error calling generate_content: {type(e).__name__}: {e}")
                raise
            
            # Extract finish reason and content
            finish_reason = None
            response_text = None
            
            if response.candidates and len(response.candidates) > 0:
                candidate = response.candidates[0]
                finish_reason = getattr(candidate, 'finish_reason', None)
                
                # Try to extract text - handle finish_reason 2 specially
                if finish_reason == 2:
                    # MAX_TOKENS - might still have partial content in parts
                    print("DEBUG: finish_reason is 2 (MAX_TOKENS), attempting to extract partial content")
                    # For finish_reason 2, response.text will fail, so extract from parts directly
                    try:
                        # Access parts via protobuf - use getattr to safely access nested attributes
                        parts_text = []
                        if hasattr(candidate, 'content') and candidate.content:
                            # Try accessing parts via the content object
                            content = candidate.content
                            # Check if parts attribute exists and has items
                            if hasattr(content, 'parts'):
                                parts_list = getattr(content, 'parts', [])
                                if parts_list:
                                    for part in parts_list:
                                        # Try different ways to access text
                                        # Method 1: part.text (if it's a direct attribute)
                                        text_attr = getattr(part, 'text', None)
                                        if text_attr:
                                            parts_text.append(str(text_attr))
                                        # Method 2: Check if part has a 'text' field (protobuf)
                                        elif hasattr(part, 'WhichOneof'):
                                            # It's a protobuf message, try to find text field
                                            for field_name in ['text', 'Text']:
                                                if hasattr(part, field_name):
                                                    field_val = getattr(part, field_name)
                                                    if field_val:
                                                        parts_text.append(str(field_val))
                                        
                        if parts_text:
                            response_text = ''.join(parts_text)
                            print(f"DEBUG: Extracted {len(response_text)} chars from parts")
                        else:
                            print("DEBUG: No text found in parts - response was cut off before generating content")
                            response_text = None
                    except Exception as e:
                        print(f"DEBUG: Error extracting text from parts: {type(e).__name__}: {e}")
                        import traceback
                        traceback.print_exc()
                        response_text = None
                else:
                    # Normal case - finish_reason is STOP or other
                    # Try to get text, but handle any errors gracefully
                    try:
                        response_text = response.text
                    except (ValueError, AttributeError, NotImplementedError) as e:
                        print(f"DEBUG: response.text failed in normal case: {type(e).__name__}: {e}, extracting from parts")
                        # Fallback: extract from parts using safe methods
                        try:
                            parts_text = []
                            if hasattr(candidate, 'content') and candidate.content:
                                content = candidate.content
                                if hasattr(content, 'parts'):
                                    parts_list = getattr(content, 'parts', [])
                                    if parts_list:
                                        for part in parts_list:
                                            # Try multiple ways to get text
                                            text_attr = getattr(part, 'text', None)
                                            if text_attr:
                                                parts_text.append(str(text_attr))
                                            # Also try lowercase 'text'
                                            elif hasattr(part, 'Text'):
                                                text_attr = getattr(part, 'Text', None)
                                                if text_attr:
                                                    parts_text.append(str(text_attr))
                            if parts_text:
                                response_text = ''.join(parts_text)
                                print(f"DEBUG: Extracted {len(response_text)} chars from parts in normal case")
                            else:
                                response_text = None
                        except Exception as extract_error:
                            print(f"DEBUG: Error extracting from parts in normal case: {extract_error}")
                            response_text = None
            
            # Map finish reason codes to messages
            finish_reasons = {
                1: "STOP (normal completion)",
                2: "MAX_TOKENS (hit token limit)",
                3: "SAFETY (content blocked by safety filters)",
                4: "RECITATION (potentially copyrighted content detected)",
            }
            
            reason_name = finish_reasons.get(finish_reason, f"UNKNOWN ({finish_reason})")
            
            # Handle finish_reason 2 (MAX_TOKENS) - may still have partial content
            if finish_reason == 2:
                if response_text and len(response_text.strip()) > 50:  # Require at least 50 chars
                    print(f"Warning: Response hit token limit, but extracted {len(response_text)} chars of partial content")
                    return response_text.strip()
                else:
                    # No usable content - the response was cut off before generating anything
                    # This usually means the prompt is too long or max_output_tokens is too low
                    # Try increasing max_output_tokens significantly
                    raise Exception(
                        f"Response hit token limit before generating usable content (finish_reason: MAX_TOKENS). "
                        f"Current max_output_tokens: {max_tokens}. "
                        f"Try increasing AI_MAX_TOKENS in .env to 16384 or higher, "
                        f"or reduce the size of your analysis results."
                    )
            elif finish_reason == 3:
                # Safety filter blocked
                raise Exception(
                    f"Content was blocked by safety filters (finish_reason: {reason_name}). "
                    f"This might be due to sensitive content in your analysis results."
                )
            elif finish_reason == 4:
                raise Exception(
                    f"Content was blocked due to recitation detection (finish_reason: {reason_name}). "
                    f"The model detected potentially copyrighted content."
                )
            elif not response_text:
                # No content and unknown finish reason
                raise Exception(
                    f"Gemini API returned empty response (finish_reason: {reason_name}). "
                    f"Response may have been blocked or truncated. "
                    f"Debug: {len(response.candidates) if response.candidates else 0} candidates"
                )
            
            return response_text.strip() if response_text else ""
            
        except Exception as e:
            import traceback
            error_msg = str(e)
            error_type = type(e).__name__
            
            print(f"ERROR in _call_gemini: {error_type}: {error_msg}")
            print(f"Traceback: {traceback.format_exc()}")
            
            # If model not found, suggest alternatives
            if "404" in error_msg or "not found" in error_msg.lower():
                raise Exception(
                    f"Gemini API error: {error_msg}\n\n"
                    f"Tip: The model '{getattr(self, '_model_name', 'unknown')}' may not be available. "
                    f"Try updating your .env file:\n"
                    f"AI_MODEL_NAME=gemini-1.5-flash  (or gemini-1.5-pro)"
                )
            
            # Provide more context in the error message
            if not error_msg:
                error_msg = f"{error_type}: Unknown error occurred"
            
            raise Exception(f"Gemini API error: {error_msg}")
    
    def interpret_results(
        self,
        analysis_results: Dict[str, Any],
        causal_question: Optional[str] = None,
        method: str = "Difference-in-Differences",
        parameters: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Interpret causal analysis results in plain language.
        
        Args:
            analysis_results: Results from the causal analysis (DiD format)
            causal_question: Optional research question
            method: Analysis method used
            parameters: Analysis parameters (outcome, treatment, etc.)
        
        Returns:
            Dictionary with interpretation sections
        """
        # Extract results data safely
        results = analysis_results.get('results', {})
        params = parameters or {}
        
        did_estimate = results.get('did_estimate', 0)
        standard_error = results.get('standard_error', 0)
        p_value = results.get('p_value', 1.0)
        is_significant = results.get('is_significant', False)
        ci = results.get('confidence_interval', {})
        ci_lower = ci.get('lower', 0)
        ci_upper = ci.get('upper', 0)
        
        stats = results.get('statistics', {})
        
        # Parallel trends test info
        parallel_trends_test = results.get('parallel_trends_test')
        parallel_trends_passed = None
        parallel_trends_p_value = None
        if parallel_trends_test:
            parallel_trends_passed = parallel_trends_test.get('passed')
            parallel_trends_p_value = parallel_trends_test.get('p_value')
        
        # Build ultra-concise results summary (minimize input tokens to maximize output space)
        results_summary = f"{method}: est={did_estimate:.2f}, se={standard_error:.2f}, p={p_value:.3f}, sig={is_significant}, CI[{ci_lower:.1f},{ci_upper:.1f}]. Y={params.get('outcome','?')}, D={params.get('treatment','?')}. N={stats.get('total_observations',0)}, T={stats.get('treated_units',0)}, C={stats.get('control_units',0)}"
        
        # Add parallel trends info if available (ultra concise)
        pt_info = ""
        if parallel_trends_test is not None:
            pt_status = "PASS" if parallel_trends_passed else "FAIL"
            pt_info = f" PT:{pt_status}(p={parallel_trends_p_value:.2f})" if parallel_trends_p_value is not None else f" PT:{pt_status}"
        
        # Build minimal prompt (maximize room for response)
        q = f"Q: {causal_question}\n" if causal_question else ""
        
        prompt = f"""Interpret causal results. {q}Data: {results_summary}{pt_info}

Return JSON only:
{{"executive_summary":"2 sentences","parallel_trends_interpretation":"2 sentences","effect_size_interpretation":"2 sentences","statistical_interpretation":"2 sentences","limitations":["item1","item2"],"implications":["item1","item2"],"confidence_level":"high/medium/low","recommendation":"1 sentence"}}"""
        
        # Log prompt length for debugging
        prompt_length = len(prompt)
        print(f"AI: Prompt length: {prompt_length} characters (~{prompt_length // 4} tokens)")
        
        response = self._call_gemini(prompt)
        
        # Clean response (remove markdown code blocks if present)
        response = response.strip()
        if response.startswith('```json'):
            response = response[7:]
        elif response.startswith('```'):
            response = response[3:]
        if response.endswith('```'):
            response = response[:-3]
        response = response.strip()
        
        # Try to parse JSON - handle partial/incomplete JSON gracefully
        try:
            interpretation = json.loads(response)
            # Ensure all required fields exist
            return {
                'executive_summary': interpretation.get('executive_summary', ''),
                'parallel_trends_interpretation': interpretation.get('parallel_trends_interpretation', ''),
                'effect_size_interpretation': interpretation.get('effect_size_interpretation', ''),
                'statistical_interpretation': interpretation.get('statistical_interpretation', ''),
                'limitations': interpretation.get('limitations', []),
                'implications': interpretation.get('implications', []),
                'confidence_level': interpretation.get('confidence_level', 'medium'),
                'recommendation': interpretation.get('recommendation', '')
            }
        except json.JSONDecodeError as e:
            # Try to extract partial JSON fields if response was truncated
            print(f"WARNING: JSON parsing failed: {e}")
            print(f"Response length: {len(response)} chars")
            print(f"Response preview: {response[:500]}...")
            
            # Try to extract what we can from partial JSON
            partial_data = {}
            try:
                # Try to find JSON object in the response
                import re
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    partial_json = json_match.group(0)
                    # Try to fix common truncation issues
                    # Add closing braces if needed
                    open_braces = partial_json.count('{')
                    close_braces = partial_json.count('}')
                    if open_braces > close_braces:
                        partial_json += '}' * (open_braces - close_braces)
                    # Try parsing the fixed JSON
                    partial_data = json.loads(partial_json)
                    print(f"Successfully parsed partial JSON with {len(partial_data)} fields")
            except Exception as parse_error:
                print(f"Could not parse partial JSON: {parse_error}")
            
            # Return what we have, with fallbacks
            return {
                'executive_summary': partial_data.get('executive_summary', response[:500] if len(response) > 500 else response),
                'parallel_trends_interpretation': partial_data.get('parallel_trends_interpretation', 'Response was truncated - unable to parse full content. Try increasing AI_MAX_TOKENS in .env'),
                'effect_size_interpretation': partial_data.get('effect_size_interpretation', ''),
                'statistical_interpretation': partial_data.get('statistical_interpretation', ''),
                'limitations': partial_data.get('limitations', ['Response was truncated - incomplete data available']),
                'implications': partial_data.get('implications', []),
                'confidence_level': partial_data.get('confidence_level', 'unknown'),
                'recommendation': partial_data.get('recommendation', '')
            }
    
    def recommend_method(
        self,
        treatment_variable: str,
        outcome_variable: str,
        is_time_series: bool,
        has_control_treatment_groups: bool,
        causal_question: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Recommend the most appropriate causal inference method based on study characteristics.
        
        Args:
            treatment_variable: Name of the treatment/intervention variable
            outcome_variable: Name of the outcome variable
            is_time_series: Whether the data is time series (longitudinal)
            has_control_treatment_groups: Whether there are distinct control and treatment groups
            causal_question: Optional research question
        
        Returns:
            Dictionary with recommended method, explanation, and alternatives
        """
        # Build concise prompt
        q = f"Research question: {causal_question}\n" if causal_question else ""
        prompt = f"""Recommend causal inference method. {q}Treatment: {treatment_variable}, Outcome: {outcome_variable}, Time series: {is_time_series}, Control/treatment groups: {has_control_treatment_groups}

Available methods: Difference-in-Differences (DiD), Regression Discontinuity Design (RDD), Instrumental Variables (IV), Synthetic Control, Matching, Panel Fixed Effects.

Return JSON only:
{{"recommended_method":"method name","method_code":"did/rdd/iv/etc","explanation":"2-3 sentences why","alternatives":[{{"method":"name","code":"code","when_appropriate":"1 sentence"}}],"key_assumptions":["assumption1","assumption2"]}}"""
        
        print(f"AI: Recommending method for treatment={treatment_variable}, outcome={outcome_variable}, time_series={is_time_series}, groups={has_control_treatment_groups}")
        
        response = self._call_gemini(prompt)
        
        # Clean response (remove markdown code blocks if present)
        response = response.strip()
        if response.startswith('```json'):
            response = response[7:]
        elif response.startswith('```'):
            response = response[3:]
        if response.endswith('```'):
            response = response[:-3]
        response = response.strip()
        
        # Parse JSON response
        try:
            recommendation = json.loads(response)
            return {
                'recommended_method': recommendation.get('recommended_method', 'Unknown'),
                'method_code': recommendation.get('method_code', ''),
                'explanation': recommendation.get('explanation', ''),
                'alternatives': recommendation.get('alternatives', []),
                'key_assumptions': recommendation.get('key_assumptions', [])
            }
        except json.JSONDecodeError as e:
            print(f"WARNING: JSON parsing failed: {e}")
            print(f"Response: {response[:500]}...")
            # Return fallback
            return {
                'recommended_method': 'Difference-in-Differences',
                'method_code': 'did',
                'explanation': 'Unable to parse AI response. Based on your inputs, Difference-in-Differences may be appropriate if you have time series data with control and treatment groups.',
                'alternatives': [],
                'key_assumptions': []
            }

    def assess_data_quality(
        self,
        columns: list,
        summary: dict
    ) -> Dict[str, Any]:
        """
        Assess data quality for causal analysis.
        
        Args:
            columns: List of column info dicts with name, type, null_count, unique_count, etc.
            summary: Summary stats (total_rows, total_columns, missing_percentage, etc.)
        
        Returns:
            Dictionary with quality assessment, issues, and recommendations
        """
        # Build concise data summary for the prompt
        total_rows = summary.get('total_rows', 0)
        total_cols = summary.get('total_columns', 0)
        missing_pct = summary.get('missing_percentage', 0)
        numeric_cols = summary.get('numeric_columns', 0)
        categorical_cols = summary.get('categorical_columns', 0)
        
        # Summarize columns (abbreviated for token efficiency)
        col_summary = []
        for col in columns[:20]:  # Limit to 20 columns to avoid huge prompts
            null_pct = (col.get('null_count', 0) / total_rows * 100) if total_rows > 0 else 0
            col_info = f"{col['name']}({col['type'][:3]},nulls:{null_pct:.0f}%,uniq:{col.get('unique_count', 0)})"
            col_summary.append(col_info)
        
        cols_str = "; ".join(col_summary)
        
        prompt = f"""Assess data quality for causal inference analysis.

Data: {total_rows} rows, {total_cols} cols ({numeric_cols} numeric, {categorical_cols} categorical), {missing_pct:.1f}% missing overall.
Columns: {cols_str}

Evaluate for causal analysis (DiD, RDD, IV). Return JSON only:
{{"overall_score":85,"quality_level":"good/fair/poor","summary":"2-3 sentence summary","issues":[{{"severity":"high/medium/low","issue":"description","column":"column_name or null","recommendation":"how to fix"}}],"strengths":["strength1","strength2"],"recommendations":["rec1","rec2"],"causal_analysis_readiness":"ready/needs_work/not_suitable","potential_variables":{{"outcome_candidates":["col1","col2"],"treatment_candidates":["col1"],"time_candidates":["col1"],"group_candidates":["col1"]}}}}"""
        
        print(f"AI: Assessing data quality for {total_rows} rows, {total_cols} columns")
        
        response = self._call_gemini(prompt)
        
        # Clean response
        response = response.strip()
        if response.startswith('```json'):
            response = response[7:]
        elif response.startswith('```'):
            response = response[3:]
        if response.endswith('```'):
            response = response[:-3]
        response = response.strip()
        
        # Parse JSON response
        try:
            assessment = json.loads(response)
            return {
                'overall_score': assessment.get('overall_score', 0),
                'quality_level': assessment.get('quality_level', 'unknown'),
                'summary': assessment.get('summary', ''),
                'issues': assessment.get('issues', []),
                'strengths': assessment.get('strengths', []),
                'recommendations': assessment.get('recommendations', []),
                'causal_analysis_readiness': assessment.get('causal_analysis_readiness', 'unknown'),
                'potential_variables': assessment.get('potential_variables', {})
            }
        except json.JSONDecodeError as e:
            print(f"WARNING: JSON parsing failed: {e}")
            print(f"Response: {response[:500]}...")
            # Return fallback
            return {
                'overall_score': 50,
                'quality_level': 'unknown',
                'summary': 'Unable to parse AI response. Please review your data manually.',
                'issues': [],
                'strengths': [],
                'recommendations': ['Review data for missing values', 'Ensure you have appropriate columns for causal analysis'],
                'causal_analysis_readiness': 'unknown',
                'potential_variables': {}
            }


# Singleton instance
_ai_service_instance = None

def get_ai_service() -> CausalAIService:
    """Get or create the AI service singleton."""
    global _ai_service_instance
    if _ai_service_instance is None:
        _ai_service_instance = CausalAIService()
    return _ai_service_instance

