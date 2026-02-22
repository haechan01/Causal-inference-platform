"""
Simplified AI Service - Direct Google Gemini API Calls
Focused on results interpretation for causal analysis
"""

import json
import math
import os
import sys
import google.generativeai as genai
from typing import Dict, Any, Optional


def _safe_num(v: Any, default: float = 0) -> float:
    """Coerce value for numeric formatting. Handles None, NaN, Inf, and non-numeric from sanitize_for_json."""
    if v is None:
        return default
    try:
        n = float(v)
        if math.isnan(n) or math.isinf(n):
            return default
        return n
    except (TypeError, ValueError):
        return default


class CausalAIService:
    """
    Simplified AI service using direct Google Gemini API calls.
    Currently focused on results interpretation.
    """
    
    def __init__(self):
        self.api_key = os.getenv('GOOGLE_API_KEY')
        if not self.api_key:
            error_msg = "GOOGLE_API_KEY not found in environment variables. Please check backend/.env file."
            print(f"ERROR: {error_msg}", file=sys.stderr)
            print(f"Available env vars starting with GOOGLE: {[k for k in os.environ.keys() if 'GOOGLE' in k.upper()]}", file=sys.stderr)
            raise ValueError(error_msg)
        
        # Configure Gemini
        try:
            genai.configure(api_key=self.api_key)
        except Exception as e:
            error_msg = f"Failed to configure Gemini API: {str(e)}"
            print(f"ERROR: {error_msg}", file=sys.stderr)
            raise ValueError(error_msg)
        
        # List available models and find one that supports generateContent
        model_name_to_use = None
        list_error = None
        try:
            available_models = []
            model_list = list(genai.list_models())
            print(f"DEBUG: Found {len(model_list)} models from API", file=sys.stderr)
            sys.stderr.flush()
            
            for model in model_list:
                # Safely check supported_generation_methods (handles different SDK versions)
                try:
                    supported_methods = getattr(model, 'supported_generation_methods', [])
                    # Convert to list if needed
                    if hasattr(supported_methods, '__iter__') and not isinstance(supported_methods, str):
                        methods_list = list(supported_methods)
                    else:
                        methods_list = []
                    if 'generateContent' in methods_list:
                        # Model name might be like "models/gemini-pro" - extract the short name
                        model_name = model.name.split('/')[-1] if '/' in model.name else model.name
                        available_models.append((model_name, model.name))
                        print(f"DEBUG: Found model with generateContent: {model_name} ({model.name})", file=sys.stderr)
                except Exception as e:
                    # If we can't check methods, skip this model
                    print(f"DEBUG: Error checking model {getattr(model, 'name', 'unknown')}: {e}", file=sys.stderr)
                    continue
            
            print(f"DEBUG: Total models with generateContent: {len(available_models)}", file=sys.stderr)
            sys.stderr.flush()
            
            if not available_models:
                list_error = "No Gemini models available with generateContent support. Check your API key and permissions."
                print(f"WARNING: {list_error}", file=sys.stderr)
                sys.stderr.flush()
            else:
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
                        print(f"DEBUG: Using user-specified model: {model_name_to_use}", file=sys.stderr)
                    else:
                        # User model not found, use first available
                        model_name_to_use = available_models[0][1]
                        print(f"DEBUG: User model '{user_model}' not found, using first available: {model_name_to_use}", file=sys.stderr)
                else:
                    # Use first available model
                    model_name_to_use = available_models[0][1]
                    print(f"DEBUG: Using first available model: {model_name_to_use}", file=sys.stderr)
                sys.stderr.flush()
                
        except Exception as e:
            list_error = f"Error listing models: {str(e)}"
            print(f"WARNING: {list_error}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            sys.stderr.flush()
            model_name_to_use = None  # Will try fallbacks below
        
        # If model listing failed or no model found, try common fallbacks
        if not model_name_to_use:
            print(f"DEBUG: Trying fallback models...", file=sys.stderr)
            sys.stderr.flush()
            fallback_models = [
                'gemini-2.0-flash-exp',
                'gemini-2.0-flash',
                'gemini-1.5-flash-latest',
                'gemini-1.5-flash', 
                'gemini-1.5-pro-latest',
                'gemini-1.5-pro',
                'gemini-pro',
                'models/gemini-2.0-flash-exp',
                'models/gemini-2.0-flash',
                'models/gemini-1.5-flash-latest',
                'models/gemini-1.5-flash',
                'models/gemini-1.5-pro-latest',
                'models/gemini-1.5-pro',
                'models/gemini-pro',
            ]
            
            fallback_errors = []
            for fallback in fallback_models:
                try:
                    print(f"DEBUG: Trying fallback model: {fallback}", file=sys.stderr)
                    sys.stderr.flush()
                    # Just try to create the model - don't test it yet
                    # The actual call will happen when we use it
                    test_model = genai.GenerativeModel(model_name=fallback)
                    model_name_to_use = fallback
                    print(f"DEBUG: Successfully initialized model: {fallback}", file=sys.stderr)
                    sys.stderr.flush()
                    break
                except Exception as e:
                    error_msg = f"{fallback}: {str(e)}"
                    fallback_errors.append(error_msg)
                    print(f"DEBUG: Failed to create model {fallback}: {str(e)}", file=sys.stderr)
                    sys.stderr.flush()
                    continue
            
            if not model_name_to_use:
                error_details = f"{list_error or 'Model listing failed'}. Fallback attempts: " + "; ".join(fallback_errors[:3])
                print(f"ERROR: {error_details}", file=sys.stderr)
                sys.stderr.flush()
                raise ValueError(f"No working Gemini model found. Please check your API key permissions. Details: {error_details}")
        
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
        
        self.model = genai.GenerativeModel(
            model_name=model_name_to_use,
            generation_config={
                'temperature': float(os.getenv('AI_TEMPERATURE', '0.7')),
                'max_output_tokens': int(os.getenv('AI_MAX_TOKENS', '16384')),  # Default to 16384 for longer responses
            },
            safety_settings=safety_settings
        )
        self._model_name = model_name_to_use
        
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
            # Generate with a higher token limit
            max_tokens_str = os.getenv('AI_MAX_TOKENS', '16384')
            max_tokens = int(max_tokens_str)
            
            try:
                response = self.model.generate_content(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        max_output_tokens=max_tokens,
                        temperature=float(os.getenv('AI_TEMPERATURE', '0.7')),
                    )
                )
            except Exception as api_error:
                # Check for quota/rate limit errors
                error_str = str(api_error)
                if '429' in error_str or 'quota' in error_str.lower() or 'rate.limit' in error_str.lower():
                    # Try to extract retry delay from error message
                    retry_delay = None
                    if 'retry_delay' in error_str or 'retry in' in error_str.lower():
                        import re
                        delay_match = re.search(r'retry.*?(\d+\.?\d*)\s*s', error_str, re.IGNORECASE)
                        if delay_match:
                            retry_delay = float(delay_match.group(1))
                    
                    # Create a user-friendly error message
                    if retry_delay:
                        error_msg = f"API quota exceeded. Please wait {int(retry_delay)} seconds before trying again. You can check your usage at https://ai.dev/usage"
                    else:
                        error_msg = "API quota exceeded. Please check your Google Cloud billing and quota limits at https://ai.dev/usage"
                    
                    # Create a custom exception that includes the retry delay
                    quota_error = ValueError(error_msg)
                    quota_error.retry_delay = retry_delay
                    quota_error.is_quota_error = True
                    raise quota_error
                else:
                    # Re-raise other errors as-is
                    raise
            
            # Try multiple approaches to extract text
            response_text = None
            finish_reason = None
            
            # Approach 1: Direct response.text (works on some SDK versions)
            try:
                response_text = response.text
                if response_text and response_text.strip():
                    return response_text.strip()
            except Exception:
                pass  # Fall through to other extraction methods
            
            # Approach 2: Extract from candidates -> content -> parts
            candidates = getattr(response, 'candidates', None)
            if candidates and len(candidates) > 0:
                candidate = candidates[0]
                finish_reason = getattr(candidate, 'finish_reason', None)
                content = getattr(candidate, 'content', None)
                
                if content:
                    parts = getattr(content, 'parts', None)
                    if parts:
                        # Try to iterate through parts and extract text
                        parts_text = []
                        try:
                            for part in parts:
                                # Direct attribute access
                                text = getattr(part, 'text', '')
                                if text:
                                    parts_text.append(str(text))
                        except TypeError:
                            # If iteration fails, try treating as single part
                            text = getattr(parts, 'text', '')
                            if text:
                                parts_text.append(str(text))
                        
                        if parts_text:
                            response_text = ''.join(parts_text)
            
            # Approach 3: Try response.parts directly (some SDK versions)
            if not response_text:
                try:
                    parts = getattr(response, 'parts', None)
                    if parts:
                        parts_text = []
                        for part in parts:
                            text = getattr(part, 'text', '')
                            if text:
                                parts_text.append(str(text))
                        if parts_text:
                            response_text = ''.join(parts_text)
                except Exception:
                    pass
            
            # Check finish reason for errors
            if finish_reason == 2:
                if not response_text:
                    raise Exception("Response hit token limit before generating content.")
            elif finish_reason == 3:
                raise Exception("Content was blocked by safety filters.")
            elif finish_reason == 4:
                raise Exception("Content was blocked due to recitation detection.")
            
            if response_text and response_text.strip():
                return response_text.strip()
            
            raise Exception(f"Gemini API returned empty response. finish_reason={finish_reason}")
            
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")
    
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
            analysis_results: Results from the causal analysis (DiD or RD format)
            causal_question: Optional research question
            method: Analysis method used
            parameters: Analysis parameters (outcome, treatment, etc.)
        
        Returns:
            Dictionary with interpretation sections
        """
        results = analysis_results.get('results', {})
        params = parameters or {}
        
        if method == "Regression Discontinuity":
            return self._interpret_rd_results(results, params, causal_question)
        return self._interpret_did_results(results, params, causal_question)
    
    def _interpret_rd_results(
        self,
        results: Dict[str, Any],
        params: Dict[str, Any],
        causal_question: Optional[str]
    ) -> Dict[str, Any]:
        """Interpret Regression Discontinuity analysis results."""
        treatment_effect = _safe_num(results.get('treatment_effect'), 0)
        se = _safe_num(results.get('se'), 0)
        p_value = _safe_num(results.get('p_value'), 1.0)
        is_significant = results.get('is_significant') if results.get('is_significant') is not None else False
        ci_lower = _safe_num(results.get('ci_lower'), 0)
        ci_upper = _safe_num(results.get('ci_upper'), 0)
        n_treated = _safe_num(results.get('n_treated'), 0)
        n_control = _safe_num(results.get('n_control'), 0)
        bandwidth_used = _safe_num(results.get('bandwidth_used'), 0)
        polynomial_order = results.get('polynomial_order')
        polynomial_order = int(polynomial_order) if polynomial_order is not None else 1
        warnings = results.get('warnings') or []
        
        running_var = params.get('running_var') or '?'
        outcome_var = params.get('outcome_var') or '?'
        cutoff = params.get('cutoff') if params.get('cutoff') is not None else '?'
        treatment_side = params.get('treatment_side') or 'above'
        
        warn_str = f" Warnings:{warnings}" if warnings else ""
        
        results_summary = (
            f"RD: effect={treatment_effect:.3f}, se={se:.3f}, p={p_value:.4f}, sig={is_significant}, "
            f"CI[{ci_lower:.3f},{ci_upper:.3f}]. Running var={running_var}, cutoff={cutoff}, "
            f"outcome={outcome_var}, treatment_side={treatment_side}. "
            f"N_treated={n_treated}, N_control={n_control}, bandwidth={bandwidth_used:.3f}, "
            f"poly_order={polynomial_order}{warn_str}"
        )
        
        q = f"Q: {causal_question}\n" if causal_question else ""
        
        prompt = f"""You are a causal inference expert. Interpret these Regression Discontinuity (RD) results and provide actionable recommendations.
{q}Data: {results_summary}

Return JSON only with these exact fields:
{{
  "executive_summary": "2-3 sentences explaining the main RD finding in plain language (discontinuity at cutoff, effect size, significance)",
  "parallel_trends_interpretation": "2 sentences on bandwidth choice, local continuity assumption, and design validity (use this field for RD design/bandwidth assessment)",
  "effect_size_interpretation": "2 sentences on the practical significance of the treatment effect at the cutoff",
  "statistical_interpretation": "2 sentences on statistical significance and confidence",
  "limitations": ["limitation 1", "limitation 2", "limitation 3"],
  "implications": ["what this means for practice 1", "what this means 2"],
  "confidence_level": "high/medium/low",
  "next_steps": ["specific actionable step 1", "specific actionable step 2", "specific actionable step 3"],
  "recommendation": "1-2 sentence overall recommendation based on results"
}}"""
        
        return self._parse_interpretation_response(prompt)
    
    def _interpret_did_results(
        self,
        results: Dict[str, Any],
        params: Dict[str, Any],
        causal_question: Optional[str]
    ) -> Dict[str, Any]:
        """Interpret Difference-in-Differences analysis results."""
        did_estimate = _safe_num(results.get('did_estimate'), 0)
        standard_error = _safe_num(results.get('standard_error'), 0)
        p_value = _safe_num(results.get('p_value'), 1.0)
        is_significant = results.get('is_significant') if results.get('is_significant') is not None else False
        ci = results.get('confidence_interval') or {}
        ci_lower = _safe_num(ci.get('lower'), 0)
        ci_upper = _safe_num(ci.get('upper'), 0)
        stats = results.get('statistics') or {}
        parallel_trends_test = results.get('parallel_trends_test')
        parallel_trends_passed = parallel_trends_test.get('passed') if parallel_trends_test else None
        parallel_trends_p_value = parallel_trends_test.get('p_value') if parallel_trends_test else None
        
        n_total = _safe_num(stats.get('total_observations'), 0)
        n_treated = _safe_num(stats.get('treated_units'), 0)
        n_control = _safe_num(stats.get('control_units'), 0)
        
        results_summary = (
            f"DiD: est={did_estimate:.2f}, se={standard_error:.2f}, p={p_value:.3f}, sig={is_significant}, "
            f"CI[{ci_lower:.1f},{ci_upper:.1f}]. Y={params.get('outcome') or '?'}, D={params.get('treatment') or '?'}. "
            f"N={n_total}, T={n_treated}, C={n_control}"
        )
        pt_info = ""
        if parallel_trends_test is not None:
            pt_status = "PASS" if parallel_trends_passed else "FAIL"
            pt_info = f" PT:{pt_status}(p={_safe_num(parallel_trends_p_value, 0):.2f})" if parallel_trends_p_value is not None else f" PT:{pt_status}"
        
        q = f"Q: {causal_question}\n" if causal_question else ""
        
        prompt = f"""You are a causal inference expert. Interpret these results and provide actionable recommendations.
{q}Data: {results_summary}{pt_info}

Return JSON only with these exact fields:
{{
  "executive_summary": "2-3 sentences explaining the main finding in plain language",
  "parallel_trends_interpretation": "2 sentences on whether the parallel trends assumption holds",
  "effect_size_interpretation": "2 sentences on the practical significance of the effect",
  "statistical_interpretation": "2 sentences on statistical significance and confidence",
  "limitations": ["limitation 1", "limitation 2", "limitation 3"],
  "implications": ["what this means for practice 1", "what this means 2"],
  "confidence_level": "high/medium/low",
  "next_steps": ["specific actionable step 1", "specific actionable step 2", "specific actionable step 3"],
  "recommendation": "1-2 sentence overall recommendation based on results"
}}"""
        
        return self._parse_interpretation_response(prompt)
    
    def _parse_interpretation_response(self, prompt: str) -> Dict[str, Any]:
        """Call Gemini and parse the interpretation JSON response."""
        response = self._call_gemini(prompt)
        
        response = response.strip()
        if response.startswith('```json'):
            response = response[7:]
        elif response.startswith('```'):
            response = response[3:]
        if response.endswith('```'):
            response = response[:-3]
        response = response.strip()
        
        try:
            interpretation = json.loads(response)
            return {
                'executive_summary': interpretation.get('executive_summary', ''),
                'parallel_trends_interpretation': interpretation.get('parallel_trends_interpretation', ''),
                'effect_size_interpretation': interpretation.get('effect_size_interpretation', ''),
                'statistical_interpretation': interpretation.get('statistical_interpretation', ''),
                'limitations': interpretation.get('limitations', []),
                'implications': interpretation.get('implications', []),
                'confidence_level': interpretation.get('confidence_level', 'medium'),
                'next_steps': interpretation.get('next_steps', []),
                'recommendation': interpretation.get('recommendation', '')
            }
        except json.JSONDecodeError:
            import re
            partial_data = {}
            try:
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    partial_json = json_match.group(0)
                    open_braces = partial_json.count('{')
                    close_braces = partial_json.count('}')
                    if open_braces > close_braces:
                        partial_json += '}' * (open_braces - close_braces)
                    partial_data = json.loads(partial_json)
            except Exception:
                pass
            
            return {
                'executive_summary': partial_data.get('executive_summary', response[:500] if len(response) > 500 else response),
                'parallel_trends_interpretation': partial_data.get('parallel_trends_interpretation', 'Response was truncated.'),
                'effect_size_interpretation': partial_data.get('effect_size_interpretation', ''),
                'statistical_interpretation': partial_data.get('statistical_interpretation', ''),
                'limitations': partial_data.get('limitations', ['Response was truncated - incomplete data available']),
                'implications': partial_data.get('implications', []),
                'confidence_level': partial_data.get('confidence_level', 'unknown'),
                'next_steps': partial_data.get('next_steps', []),
                'recommendation': partial_data.get('recommendation', '')
            }
    
    def recommend_method(
        self,
        treatment_variable: str,
        outcome_variable: str,
        causal_question: Optional[str] = None,
        q1_cutoff: Optional[str] = None,
        q2_time_change: Optional[str] = None,
        q3_instrument: Optional[str] = None,
        # Legacy params kept for backward compatibility
        is_time_series: bool = False,
        has_control_treatment_groups: bool = False,
        potential_instrument: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Recommend one of: Regression Discontinuity, Difference-in-Differences, or Instrumental Variables.

        Decision logic (in priority order):
          Q1 (cutoff-based) = yes  →  Regression Discontinuity
          Q2 (time-change)  = yes  →  Difference-in-Differences
          Q3 (instrument)   = yes  →  Instrumental Variables
          else                     →  explain that more info is needed, pick best guess

        Args:
            treatment_variable: Name of the treatment/intervention variable
            outcome_variable: Name of the outcome variable
            causal_question: Optional research question
            q1_cutoff: 'yes' | 'no' | 'unsure' — treatment assigned by crossing a clear cutoff/rule
            q2_time_change: 'yes' | 'no' | 'unsure' — treatment started/changed at a specific time for some groups
            q3_instrument: 'yes' | 'no' | 'unsure' — there is a variable that affects treatment but not outcome directly
            is_time_series: legacy param (mapped to q2 if q2 not provided)
            has_control_treatment_groups: legacy param
            potential_instrument: legacy param (mapped to q3 if q3 not provided)
        """
        # Map legacy params to question answers when new ones are not supplied
        if q1_cutoff is None:
            q1_cutoff = 'unsure'
        if q2_time_change is None:
            if is_time_series and has_control_treatment_groups:
                q2_time_change = 'yes'
            elif is_time_series or has_control_treatment_groups:
                q2_time_change = 'unsure'
            else:
                q2_time_change = 'unsure'
        if q3_instrument is None:
            q3_instrument = 'yes' if potential_instrument else 'unsure'

        def fmt(val: Optional[str]) -> str:
            mapping = {'yes': 'YES', 'no': 'NO', 'unsure': 'UNSURE/Not answered'}
            return mapping.get((val or '').lower(), 'UNSURE/Not answered')

        q_str = f"Research question: {causal_question}\n" if causal_question else ""

        prompt = f"""You are an econometrics research design assistant. Recommend the most appropriate causal inference method.

You must choose EXACTLY ONE of:
- Regression Discontinuity (RD) — method_code: "rdd"
- Difference-in-Differences (DiD) — method_code: "did"
- Instrumental Variables (IV) — method_code: "iv"

STUDY CONTEXT:
Treatment variable: {treatment_variable}
Outcome variable: {outcome_variable}
{q_str}
USER'S ANSWERS TO THE THREE DESIGN QUESTIONS:
Q1 — Is treatment determined by crossing a clear cutoff or rule?
      (e.g. income above a threshold, age above 65, test score above a cutoff)
      Answer: {fmt(q1_cutoff)}

Q2 — Did treatment start or change at a specific time for some groups but not others?
      (e.g. a new law, a policy in some regions, a program rolled out in certain schools)
      Answer: {fmt(q2_time_change)}

Q3 — Is there something that strongly affects who receives treatment but does NOT directly affect the outcome?
      (e.g. lottery assignment, distance to a facility, administrative rules, encouragement letters)
      Answer: {fmt(q3_instrument)}

DECISION LOGIC (apply strictly in this priority order):
1. If Q1 = YES  →  Recommend Regression Discontinuity (rdd)
2. Else if Q2 = YES  →  Recommend Difference-in-Differences (did)
3. Else if Q3 = YES  →  Recommend Instrumental Variables (iv)
4. If multiple are YES, explain which is primary and why
5. If none are YES, pick the best guess based on context and explain what additional info is needed

OUTPUT FORMAT — Return JSON only:
{{
  "recommended_method": "full method name",
  "method_code": "rdd/did/iv",
  "explanation": "2-3 sentences in plain, non-technical language explaining why this method fits the user's specific situation, referencing their treatment and outcome variables",
  "why_not_others": "1 sentence for each of the two non-recommended methods explaining why they are less appropriate here",
  "key_assumption": "The single most important assumption for the recommended method, stated in plain language",
  "alternatives": [
    {{"method": "full name", "code": "rdd/did/iv", "when_appropriate": "1 sentence"}}
  ],
  "key_assumptions": ["assumption 1", "assumption 2"]
}}"""

        response = self._call_gemini(prompt)

        response = response.strip()
        if response.startswith('```json'):
            response = response[7:]
        elif response.startswith('```'):
            response = response[3:]
        if response.endswith('```'):
            response = response[:-3]
        response = response.strip()

        try:
            recommendation = json.loads(response)
            method_code = recommendation.get('method_code', '').lower().strip()
            if method_code not in ('did', 'rdd', 'iv'):
                # Apply decision logic as fallback
                if q1_cutoff == 'yes':
                    method_code = 'rdd'
                elif q2_time_change == 'yes':
                    method_code = 'did'
                elif q3_instrument == 'yes':
                    method_code = 'iv'
                else:
                    method_code = 'rdd'
            return {
                'recommended_method': recommendation.get('recommended_method', 'Unknown'),
                'method_code': method_code,
                'explanation': recommendation.get('explanation', ''),
                'why_not_others': recommendation.get('why_not_others', ''),
                'key_assumption': recommendation.get('key_assumption', ''),
                'alternatives': [
                    alt for alt in recommendation.get('alternatives', [])
                    if alt.get('code', '').lower() in ('did', 'rdd', 'iv')
                ],
                'key_assumptions': recommendation.get('key_assumptions', [])
            }
        except json.JSONDecodeError:
            # Deterministic fallback using decision logic
            if q1_cutoff == 'yes':
                code, name = 'rdd', 'Regression Discontinuity'
                explanation = f'Treatment of "{treatment_variable}" appears to be assigned based on a cutoff or rule, which is exactly the setting where Regression Discontinuity is most powerful.'
                assumption = 'Units just above and below the cutoff are comparable in all other respects.'
            elif q2_time_change == 'yes':
                code, name = 'did', 'Difference-in-Differences'
                explanation = f'Treatment of "{treatment_variable}" started at a specific time for some groups, which is the classic setting for Difference-in-Differences.'
                assumption = 'Without the treatment, the treated and control groups would have followed similar trends over time (parallel trends).'
            elif q3_instrument == 'yes':
                code, name = 'iv', 'Instrumental Variables'
                explanation = f'There is an external factor that affects "{treatment_variable}" but not "{outcome_variable}" directly — this is the instrument needed for IV estimation.'
                assumption = 'The instrument affects the outcome only through its effect on the treatment (exclusion restriction).'
            else:
                code, name = 'rdd', 'Regression Discontinuity'
                explanation = 'Based on the available information, Regression Discontinuity may be a candidate if a clear cutoff exists. Please provide more context about how treatment was assigned.'
                assumption = 'Units near the cutoff are comparable in all other characteristics.'
            return {
                'recommended_method': name,
                'method_code': code,
                'explanation': explanation,
                'why_not_others': '',
                'key_assumption': assumption,
                'alternatives': [],
                'key_assumptions': [assumption]
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

IMPORTANT: Data types have already been correctly detected and validated. Do NOT flag issues about incorrect data types (e.g., numeric columns labeled as categorical). Focus on other data quality issues like missing values, outliers, data completeness, and suitability for causal analysis methods.

Evaluate for causal analysis (DiD, RDD, IV). Return JSON only:
{{"overall_score":85,"quality_level":"good/fair/poor","summary":"2-3 sentence summary","issues":[{{"severity":"high/medium/low","issue":"description","column":"column_name or null","recommendation":"how to fix"}}],"strengths":["strength1","strength2"],"recommendations":["rec1","rec2"],"causal_analysis_readiness":"ready/needs_work/not_suitable","potential_variables":{{"outcome_candidates":["col1","col2"],"treatment_candidates":["col1"],"time_candidates":["col1"],"group_candidates":["col1"]}}}}"""
        
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
        except json.JSONDecodeError:
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

