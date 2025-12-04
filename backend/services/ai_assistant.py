"""
AI Assistant Service - Comprehensive AI support throughout the analysis workflow
"""

import os
import json
import google.generativeai as genai
from typing import Dict, Any, Optional, List


class CausalAIAssistant:
    """
    AI assistant that helps users throughout the causal analysis workflow:
    1. Data quality assessment
    2. Variable role suggestions
    3. Method recommendation
    4. Assumption validation
    5. Results interpretation
    6. Next steps guidance
    """
    
    def __init__(self):
        self.api_key = os.getenv('GOOGLE_API_KEY')
        if not self.api_key:
            # Don't raise error on init, just warn, so app can start even if not configured
            print("WARNING: GOOGLE_API_KEY not found in environment variables. AI features will be disabled.")
            self.model = None
            return
        
        try:
            genai.configure(api_key=self.api_key)
            
            # Find a suitable model
            model_name = os.getenv('AI_MODEL_NAME', 'gemini-1.5-flash')
            
            # List models to confirm availability or find alternative
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
                            model_name_short = model.name.split('/')[-1] if '/' in model.name else model.name
                            available_models.append((model_name_short, model.name))
                    except Exception:
                        # If we can't check methods, skip this model
                        continue
                
                # Check if preferred model is available
                model_found = False
                for short, full in available_models:
                    if short == model_name or full == model_name:
                        model_name = full
                        model_found = True
                        break
                
                if not model_found and available_models:
                    model_name = available_models[0][1]
            except Exception:
                model_name = None  # Will try fallbacks below

            # If model listing failed or no model found, try common fallbacks
            if not model_name or model_name == os.getenv('AI_MODEL_NAME', ''):
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
                        model_name = fallback
                        break
                    except Exception:
                        continue
                
                if not model_name:
                    raise Exception("No working Gemini model found. Please check your API key permissions.")

            self.model = genai.GenerativeModel(
                model_name=model_name,
                generation_config={
                    'temperature': 0.3,  # Lower for more consistent responses
                    'max_output_tokens': 8192, # Increase token limit
                }
            )
            self._model_name = model_name
        except Exception:
            self.model = None
    
    def assess_data_quality(self, schema_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze dataset schema and provide quality assessment.
        """
        prompt = f"""You are a causal inference expert. Analyze this dataset schema and provide guidance.

Dataset Schema:
{json.dumps(schema_info, indent=2)}

Respond with JSON only:
{{
    "overall_quality": "good|moderate|poor",
    "quality_score": 0-100,
    "issues": [
        {{"column": "name", "issue": "description", "severity": "high|medium|low", "suggestion": "how to fix"}}
    ],
    "strengths": ["list of data strengths"],
    "suitable_methods": ["DiD", "RDD", "etc"],
    "recommendations": ["specific recommendations for this data"]
}}"""

        response = self._call_gemini(prompt)
        return self._parse_json_response(response)
    
    def suggest_variable_roles(
        self, 
        schema_info: Dict[str, Any],
        causal_question: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Suggest which variables should be used for outcome, treatment, time, etc.
        """
        question_context = f"\nUser's causal question: {causal_question}" if causal_question else ""
        
        prompt = f"""You are a causal inference expert helping a user set up their analysis.
{question_context}

Dataset columns:
{json.dumps(schema_info['columns'], indent=2)}

Based on the column names and types, suggest the best variables for each role.

Respond with JSON only:
{{
    "outcome_suggestions": [
        {{"column": "name", "confidence": 0-1, "reasoning": "why this is a good outcome"}}
    ],
    "treatment_suggestions": [
        {{"column": "name", "confidence": 0-1, "reasoning": "why this indicates treatment"}}
    ],
    "time_suggestions": [
        {{"column": "name", "confidence": 0-1, "reasoning": "why this represents time"}}
    ],
    "unit_suggestions": [
        {{"column": "name", "confidence": 0-1, "reasoning": "why this identifies units"}}
    ],
    "control_suggestions": [
        {{"column": "name", "reasoning": "why this should be controlled for"}}
    ],
    "warnings": ["any concerns about variable selection"],
    "explanation": "Brief explanation of your reasoning"
}}"""

        response = self._call_gemini(prompt)
        return self._parse_json_response(response)
    
    def recommend_method(
        self,
        data_description: Dict[str, Any],
        causal_question: str
    ) -> Dict[str, Any]:
        """
        Recommend the best causal inference method based on the research question and data.
        """
        prompt = f"""You are a causal inference methodologist. Help the user choose the right method.

User's causal question: {causal_question}

Data characteristics:
- Rows: {data_description.get('total_rows', 'unknown')}
- Has time variable: {data_description.get('has_time', False)}
- Has treatment indicator: {data_description.get('has_treatment', False)}
- Panel data: {data_description.get('is_panel', False)}
- Natural experiment context: {data_description.get('natural_experiment', 'unknown')}

Available methods:
1. Difference-in-Differences (DiD) - requires panel data with treatment/control groups observed before/after
2. Regression Discontinuity (RDD) - requires assignment based on a threshold
3. Instrumental Variables (IV) - requires a valid instrument
4. Propensity Score Matching - for observational data with selection bias concerns

Respond with JSON only:
{{
    "recommended_method": "method name",
    "confidence": 0-1,
    "reasoning": "detailed explanation of why this method fits",
    "assumptions_to_check": ["list of key assumptions"],
    "alternative_methods": [
        {{"method": "name", "when_to_use": "conditions where this might be better"}}
    ],
    "data_requirements": ["what user needs to verify in their data"],
    "limitations": ["limitations of recommended approach"]
}}"""

        response = self._call_gemini(prompt)
        return self._parse_json_response(response)
    
    def validate_did_setup(
        self,
        parameters: Dict[str, Any],
        data_summary: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Validate DiD analysis setup before running.
        """
        # Extract structure info if available
        structure_info = data_summary.get('structure_info', {})
        structure_context = ""
        if structure_info:
            structure_context = f"""
Data Structure Analysis:
- Total Rows: {data_summary.get('total_rows')}
- Unique Units ({structure_info.get('unit_column')}): {structure_info.get('unit_count')}
- Unique Time Periods ({structure_info.get('time_column')}): {structure_info.get('time_count')}
- Expected Rows (Balanced Panel): {structure_info.get('expected_rows')}
"""

        prompt = f"""You are a DiD expert. Validate this analysis setup before it runs.

Analysis Parameters:
- Outcome variable: {parameters.get('outcome')}
- Treatment variable: {parameters.get('treatment')}
- Treatment value: {parameters.get('treatment_value')}
- Time variable: {parameters.get('time')}
- Treatment start: {parameters.get('treatment_start')}
- Unit variable: {parameters.get('unit')}
- Treatment units: {parameters.get('treatment_units', [])}
- Control units: {parameters.get('control_units', [])}
- Analysis period: {parameters.get('start_period')} to {parameters.get('end_period')}

Data Summary:
{json.dumps(data_summary, indent=2)}
{structure_context}

Check for potential issues and provide guidance.
Specifically check if the dataset structure (rows vs expected rows) suggests a balanced panel or missing data. 
If total rows != expected rows, this indicates an unbalanced panel or missing data. Flag this as a critical issue if the discrepancy is large or implies data quality problems.

Respond with JSON only:
{{
    "is_valid": true/false,
    "validation_checks": [
        {{"check": "description", "passed": true/false, "details": "explanation"}}
    ],
    "critical_issues": ["issues that must be fixed"],
    "warnings": ["potential concerns to be aware of"],
    "suggestions": ["ways to improve the analysis"],
    "expected_reliability": "high|medium|low",
    "proceed_recommendation": "proceed|review|stop"
}}"""

        response = self._call_gemini(prompt)
        return self._parse_json_response(response)
    
    def explain_concept(self, concept: str, user_level: str = "beginner") -> Dict[str, Any]:
        """
        Explain a causal inference concept at the user's level.
        """
        prompt = f"""Explain the concept of "{concept}" for a {user_level} audience.

The user is working with a causal analysis platform and needs to understand this concept.

Respond with JSON only:
{{
    "title": "concept name",
    "simple_explanation": "1-2 sentence explanation anyone can understand",
    "detailed_explanation": "more thorough explanation",
    "example": "concrete real-world example",
    "why_it_matters": "why this is important for causal analysis",
    "common_mistakes": ["mistakes to avoid"],
    "related_concepts": ["other concepts to learn about"]
}}"""

        response = self._call_gemini(prompt)
        return self._parse_json_response(response)
    
    def generate_next_steps(
        self,
        analysis_results: Dict[str, Any],
        interpretation: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate actionable next steps based on analysis results.
        """
        # Sanitize data for prompt to avoid serialization issues
        results_summary = {
            'did_estimate': analysis_results.get('did_estimate'),
            'p_value': analysis_results.get('p_value'),
            'is_significant': analysis_results.get('is_significant'),
            'parallel_trends_passed': analysis_results.get('parallel_trends_test', {}).get('passed') if analysis_results.get('parallel_trends_test') else None
        }
        
        prompt = f"""Based on this causal analysis, what should the user do next?

Analysis Results:
{json.dumps(results_summary, indent=2)}

AI Interpretation Summary:
{interpretation.get('executive_summary', 'Not available')}

Provide actionable guidance.

Respond with JSON only:
{{
    "immediate_actions": [
        {{"action": "what to do", "priority": "high|medium|low", "reason": "why"}}
    ],
    "robustness_checks": [
        {{"check": "description", "how": "how to perform it", "why": "why it helps"}}
    ],
    "reporting_guidance": {{
        "key_findings": ["what to report"],
        "caveats_to_mention": ["limitations to acknowledge"],
        "visualizations_needed": ["charts to include"]
    }},
    "if_significant": {{
        "actions": ["what to do if results hold"],
        "cautions": ["things to be careful about"]
    }},
    "if_not_significant": {{
        "possible_reasons": ["why results might not be significant"],
        "next_steps": ["what to explore next"]
    }}
}}"""

        response = self._call_gemini(prompt)
        return self._parse_json_response(response)
    
    def _call_gemini(self, prompt: str) -> str:
        """
        Simple wrapper for Gemini API calls.
        Matches robust error handling from CausalAIService.
        """
        if not self.model:
            raise Exception("AI service is not initialized (missing API key?)")
            
        try:
            # Use a reasonable token limit
            max_tokens = 8192
            
            try:
                # Override generation config to use higher token limit
                response = self.model.generate_content(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        max_output_tokens=max_tokens,
                        temperature=0.3,
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
            raise Exception(f"AI service error: {str(e)}")
    
    def _parse_json_response(self, response: str) -> Dict[str, Any]:
        """Parse JSON from response, handling markdown code blocks."""
        # Clean up response
        response = response.strip()
        if response.startswith('```json'):
            response = response[7:]
        elif response.startswith('```'):
            response = response[3:]
        if response.endswith('```'):
            response = response[:-3]
        response = response.strip()
        
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            # Try to find JSON object if it's embedded
            try:
                import re
                match = re.search(r'\{.*\}', response, re.DOTALL)
                if match:
                    return json.loads(match.group(0))
            except:
                pass
            return {"error": "Failed to parse AI response", "raw_response": response[:500]}


# Singleton
_assistant_instance = None

def get_ai_assistant() -> CausalAIAssistant:
    global _assistant_instance
    if _assistant_instance is None:
        _assistant_instance = CausalAIAssistant()
    return _assistant_instance
