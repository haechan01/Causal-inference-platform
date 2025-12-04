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
        
        # List available models and find one that supports generateContent
        try:
            available_models = []
            for model in genai.list_models():
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
                except Exception:
                    # If we can't check methods, skip this model
                    continue
            
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
                else:
                    # User model not found, use first available
                    model_name_to_use = available_models[0][1]
            else:
                # Use first available model
                model_name_to_use = available_models[0][1]
                
        except Exception:
            model_name_to_use = None  # Will try fallbacks below
        
        # If model listing failed or no model found, try common fallbacks
        if not model_name_to_use:
            fallback_models = [
                'gemini-2.0-flash',
                'gemini-1.5-flash', 
                'gemini-1.5-pro',
                'gemini-pro',
                'models/gemini-2.0-flash',
                'models/gemini-1.5-flash',
                'models/gemini-pro',
            ]
            
            for fallback in fallback_models:
                try:
                    test_model = genai.GenerativeModel(model_name=fallback)
                    # Try a simple call to verify it works
                    test_model.generate_content("test", generation_config={'max_output_tokens': 10})
                    model_name_to_use = fallback
                    break
                except Exception:
                    continue
            
            if not model_name_to_use:
                raise ValueError("No working Gemini model found. Please check your API key permissions.")
        
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
            except Exception:
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
        except json.JSONDecodeError:
            # Try to extract partial JSON fields if response was truncated
            partial_data = {}
            try:
                # Try to find JSON object in the response
                import re
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    partial_json = json_match.group(0)
                    # Try to fix common truncation issues
                    open_braces = partial_json.count('{')
                    close_braces = partial_json.count('}')
                    if open_braces > close_braces:
                        partial_json += '}' * (open_braces - close_braces)
                    partial_data = json.loads(partial_json)
            except Exception:
                pass
            
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
        except json.JSONDecodeError:
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

