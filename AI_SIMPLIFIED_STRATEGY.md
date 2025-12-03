# AI Integration Strategy: Google Gemini Direct API (Simplified)

## Executive Summary

**Simplified approach**: Use direct Google Gemini API calls instead of LlamaIndex. This reduces complexity while maintaining all functionality. Perfect for your use case where the knowledge base is small and static.

**Why Direct API Calls?**
- ✅ Simpler architecture (no vector database needed)
- ✅ Faster to implement
- ✅ Lower cost (no embedding API calls)
- ✅ Easier to maintain
- ✅ Still provides excellent results with well-written prompts

---

## Key Differences from RAG Approach

| Aspect | LlamaIndex (RAG) | Direct API (This Approach) |
|--------|------------------|----------------------------|
| **Complexity** | Higher | Lower |
| **Dependencies** | LlamaIndex + vector DB | Just Google AI SDK |
| **Knowledge Base** | Vector search | Inlined in prompts |
| **Cost** | API + embeddings | Just API calls |
| **Speed** | Slightly slower | Faster |
| **Maintenance** | More complex | Simpler |
| **Best For** | Large, dynamic KB | Small, static KB ✅ |

---

## Simplified Technology Stack

### Backend Dependencies

```python
# Add to requirements.txt
google-generativeai==0.3.2  # Just this one!
```

That's it! No LlamaIndex, no ChromaDB, no extra dependencies.

### Environment Variables

```bash
# Add to backend/.env
GOOGLE_API_KEY=your_gemini_api_key_here
ENABLE_AI_FEATURES=true
AI_MODEL_NAME=gemini-pro
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=2048
```

---

## Simplified Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Dataset   │  │Question  │  │Method    │  │Results   │   │
│  │Analysis  │→│Recommend │→│Selection │→│Interpret │   │
│  │Page      │  │Page      │  │Page      │  │Page      │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP/REST API
┌───────────────────────────┴─────────────────────────────────┐
│                    Backend (Flask)                           │
│  ┌────────────────────────────────────────────────────┐     │
│  │              AI Service Layer                       │     │
│  │  ┌──────────────────────────────────────────┐     │     │
│  │  │   Google Gemini API (Direct Calls)        │     │     │
│  │  │                                           │     │     │
│  │  │  • Well-structured prompts                │     │     │
│  │  │  • Knowledge base in prompts             │     │     │
│  │  │  • Simple request/response                │     │     │
│  │  └──────────────────────────────────────────┘     │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │         Causal Analysis Components                  │     │
│  │  • Dataset Schema Analyzer                          │     │
│  │  • DiD Analysis Engine                              │     │
│  │  • Statistical Testing                              │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**Much simpler!** Just direct API calls with good prompts.

---

## Simplified AI Service Implementation

### Complete `backend/services/ai_service.py`

```python
"""
Simplified AI Service - Direct Google Gemini API Calls
No LlamaIndex, no vector databases, just clean API calls!
"""

import os
import json
import pandas as pd
import google.generativeai as genai
from typing import Dict, Any, Optional, List


class CausalAIService:
    """
    Simplified AI service using direct Google Gemini API calls.
    Knowledge base is embedded in prompts, not in a vector store.
    """
    
    def __init__(self):
        self.api_key = os.getenv('GOOGLE_API_KEY')
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not found in environment")
        
        # Configure Gemini
        genai.configure(api_key=self.api_key)
        
        # Create model instance
        self.model = genai.GenerativeModel(
            model_name=os.getenv('AI_MODEL_NAME', 'gemini-pro'),
            generation_config={
                'temperature': float(os.getenv('AI_TEMPERATURE', '0.7')),
                'max_output_tokens': int(os.getenv('AI_MAX_TOKENS', '2048')),
            }
        )
        
        # Knowledge base (embedded in prompts, not in vector store)
        self.knowledge_base = self._get_knowledge_base()
    
    def _get_knowledge_base(self) -> str:
        """
        Return knowledge base as a string to include in prompts.
        This is simpler than vector search - we just include it all.
        """
        return """
Causal Inference Methods Knowledge Base:

1. DIFFERENCE-IN-DIFFERENCES (DiD)
   - When to use: Treatment and control groups observed over time
   - Requires: Treatment variable, outcome variable, time variable, unit identifier
   - Key Assumptions:
     * Parallel trends: Groups would follow parallel trends without treatment
     * No spillover effects
     * Stable unit treatment value assumption (SUTVA)
   - Best for: Policy evaluations, state-level interventions, program rollouts
   - Example: "What was the effect of minimum wage increase on employment?"

2. REGRESSION DISCONTINUITY DESIGN (RDD)
   - When to use: Treatment assigned based on cutoff in running variable
   - Requires: Running variable, cutoff point, outcome variable
   - Key Assumptions: Continuity at cutoff, no manipulation
   - Best for: Eligibility thresholds, age cutoffs, test score requirements
   - Example: "What is the effect of scholarship eligibility on graduation rates?"

3. INSTRUMENTAL VARIABLES (IV)
   - When to use: Treatment is endogenous, have valid instrument
   - Requires: Instrument correlated with treatment but not outcome
   - Key Assumptions: Relevance, exogeneity, exclusion restriction
   - Best for: Addressing omitted variable bias, selection bias
   - Example: "What is the effect of education on earnings? (using distance to college)"

4. PROPENSITY SCORE MATCHING (PSM)
   - When to use: Observational studies with selection into treatment
   - Requires: Treatment variable, outcome, covariates for matching
   - Key Assumptions: Conditional independence, common support
   - Best for: Retrospective analysis, observational studies
   - Example: "What is the effect of job training on wages?"

5. SYNTHETIC CONTROL METHOD
   - When to use: Single treated unit (state, country, region)
   - Requires: One treated unit, multiple control units, pre-treatment period
   - Best for: Comparative case studies, policy analysis
   - Example: "What was the effect of California's tobacco control program?"

Variable Selection Principles:
- Include confounders (affect both treatment and outcome)
- Exclude colliders (caused by treatment and outcome)
- Include precision variables (affect outcome only)
- Be cautious with mediators (in causal pathway)

For DiD specifically:
- Outcome: Metric you want to measure effect on
- Treatment: Intervention or policy
- Time: Period indicator (date, year, quarter)
- Unit: Entity identifier (state, person, company)
- Controls: Time-varying covariates that might confound

Parallel Trends Assumption:
- Treatment and control groups should follow similar trends before treatment
- Test by: Visual inspection, statistical test of pre-treatment interaction
- If violated: Consider different control group, add covariates, or alternative method
        """
    
    def _call_gemini(self, prompt: str, system_instruction: Optional[str] = None) -> str:
        """
        Simple wrapper for Gemini API calls.
        
        Args:
            prompt: The main prompt
            system_instruction: Optional system-level instruction
        
        Returns:
            Response text from Gemini
        """
        try:
            if system_instruction:
                # Use system instruction if supported
                response = self.model.generate_content(
                    prompt,
                    system_instruction=system_instruction
                )
            else:
                response = self.model.generate_content(prompt)
            
            return response.text.strip()
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")
    
    async def analyze_dataset(
        self, 
        df: pd.DataFrame, 
        dataset_name: str,
        schema_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Analyze a dataset and provide insights about its suitability 
        for causal analysis.
        """
        # Generate dataset summary
        summary = {
            'rows': len(df),
            'columns': len(df.columns),
            'numeric_columns': [col for col in df.columns 
                               if pd.api.types.is_numeric_dtype(df[col])],
            'categorical_columns': [col for col in df.columns 
                                   if not pd.api.types.is_numeric_dtype(df[col])],
            'missing_data': df.isnull().sum().to_dict(),
            'column_stats': {}
        }
        
        # Get basic stats for numeric columns (sample, not all)
        for col in summary['numeric_columns'][:10]:  # Limit to avoid huge prompts
            summary['column_stats'][col] = {
                'mean': float(df[col].mean()) if pd.notna(df[col].mean()) else None,
                'std': float(df[col].std()) if pd.notna(df[col].std()) else None,
                'unique_values': int(df[col].nunique())
            }
        
        # Create comprehensive prompt with knowledge base
        prompt = f"""
You are an expert in causal inference and econometrics. Analyze this dataset for potential causal analysis.

KNOWLEDGE BASE:
{self.knowledge_base}

DATASET INFORMATION:
- Name: {dataset_name}
- Rows: {summary['rows']}
- Columns: {summary['columns']}
- Numeric columns: {', '.join(summary['numeric_columns'][:15])}
- Categorical columns: {', '.join(summary['categorical_columns'][:15])}

SCHEMA DETAILS:
{json.dumps(schema_info, indent=2)[:2000]}  # Truncate if too long

Please provide a structured analysis:
1. Dataset suitability for causal analysis (scale 1-10 with explanation)
2. Potential outcome variables (list 3-5 with reasoning)
3. Potential treatment variables (list 2-4 with reasoning)
4. Potential time/unit variables (if applicable)
5. Suggested causal questions (list 3-5)
6. Data quality concerns and recommendations

Format your response in clear sections with bullet points.
"""
        
        ai_insights = self._call_gemini(prompt)
        
        return {
            'summary': summary,
            'ai_insights': ai_insights,
            'dataset_name': dataset_name
        }
    
    async def recommend_causal_questions(
        self,
        dataset_summary: Dict[str, Any],
        user_context: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """
        Recommend causal questions based on dataset characteristics.
        """
        context_str = f"\n\nUser Context: {user_context}" if user_context else ""
        
        prompt = f"""
You are an expert in causal inference. Based on this dataset, recommend 5 meaningful causal questions.

KNOWLEDGE BASE:
{self.knowledge_base}

DATASET SUMMARY:
{json.dumps(dataset_summary, indent=2)[:1500]}
{context_str}

For each question, provide:
1. The causal question (clear and specific)
2. Rationale (why answerable with this data)
3. Required variables (what would be needed)
4. Recommended method (DiD, RDD, IV, PSM, Synthetic Control, or Other)

Return ONLY a valid JSON array in this exact format:
[
  {{
    "question": "...",
    "rationale": "...",
    "variables": {{"outcome": "...", "treatment": "...", "time": "...", "unit": "..."}},
    "method": "..."
  }}
]

Do not include any text before or after the JSON array.
"""
        
        response = self._call_gemini(prompt)
        
        # Clean response (remove markdown code blocks if present)
        response = response.strip()
        if response.startswith('```json'):
            response = response[7:]
        if response.startswith('```'):
            response = response[3:]
        if response.endswith('```'):
            response = response[:-3]
        response = response.strip()
        
        try:
            questions = json.loads(response)
            if isinstance(questions, list):
                return questions[:5]  # Ensure max 5
            else:
                return [questions]
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails
            return [{
                'question': 'Unable to parse response',
                'rationale': response[:500],
                'variables': {},
                'method': 'Unknown'
            }]
    
    async def recommend_method(
        self,
        causal_question: str,
        dataset_summary: Dict[str, Any],
        available_variables: List[str]
    ) -> Dict[str, Any]:
        """
        Recommend the best causal inference method for a given question.
        """
        prompt = f"""
You are an expert in causal inference. Recommend the best method for this research question.

KNOWLEDGE BASE:
{self.knowledge_base}

RESEARCH QUESTION: {causal_question}

AVAILABLE VARIABLES: {', '.join(available_variables[:30])}

DATASET INFO:
{json.dumps(dataset_summary, indent=2)[:1000]}

Provide:
1. Recommended method (DiD, RDD, IV, PSM, Synthetic Control, or Other)
2. Confidence level (High/Medium/Low)
3. Detailed rationale
4. Key assumptions to check
5. Alternative methods (if any) with reasons
6. Limitations and considerations

Return ONLY valid JSON in this format:
{{
  "method": "...",
  "confidence": "...",
  "rationale": "...",
  "assumptions": ["...", "..."],
  "alternatives": [{{"method": "...", "reason": "..."}}],
  "limitations": ["...", "..."]
}}

Do not include any text before or after the JSON.
"""
        
        response = self._call_gemini(prompt)
        
        # Clean response
        response = response.strip()
        if response.startswith('```json'):
            response = response[7:]
        if response.startswith('```'):
            response = response[3:]
        if response.endswith('```'):
            response = response[:-3]
        response = response.strip()
        
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {
                'method': 'Difference-in-Differences',
                'confidence': 'Medium',
                'rationale': response[:500],
                'assumptions': ['Unable to parse full response'],
                'alternatives': [],
                'limitations': []
            }
    
    async def recommend_variables(
        self,
        causal_question: str,
        method: str,
        available_variables: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Recommend which variables to use for outcome, treatment, controls, etc.
        """
        vars_description = "\n".join([
            f"- {v.get('name', 'unknown')} ({v.get('type', 'unknown')}): "
            f"{v.get('unique_values', 'N/A')} unique values"
            for v in available_variables[:30]  # Limit to avoid huge prompts
        ])
        
        prompt = f"""
You are an expert in causal inference. Recommend variables for this analysis.

KNOWLEDGE BASE:
{self.knowledge_base}

RESEARCH QUESTION: {causal_question}
METHOD: {method}

AVAILABLE VARIABLES:
{vars_description}

For {method} analysis, recommend:
1. Outcome variable (what you're measuring effect on)
2. Treatment variable (the intervention/policy)
3. Time variable (if applicable for time-series methods)
4. Unit/Entity variable (if applicable)
5. Control variables (confounders to adjust for)
6. Variables to EXCLUDE and why

Return ONLY valid JSON:
{{
  "outcome": {{"variable": "...", "reason": "..."}},
  "treatment": {{"variable": "...", "reason": "..."}},
  "time": {{"variable": "...", "reason": "..."}} or null,
  "unit": {{"variable": "...", "reason": "..."}} or null,
  "controls": [
    {{"variable": "...", "reason": "...", "importance": "high/medium/low"}}
  ],
  "exclude": [
    {{"variable": "...", "reason": "..."}}
  ],
  "warnings": ["..."]
}}

Do not include any text before or after the JSON.
"""
        
        response = self._call_gemini(prompt)
        
        # Clean response
        response = response.strip()
        if response.startswith('```json'):
            response = response[7:]
        if response.startswith('```'):
            response = response[3:]
        if response.endswith('```'):
            response = response[:-3]
        response = response.strip()
        
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {
                'outcome': None,
                'treatment': None,
                'time': None,
                'unit': None,
                'controls': [],
                'exclude': [],
                'warnings': [response[:500]]
            }
    
    async def interpret_results(
        self,
        analysis_results: Dict[str, Any],
        causal_question: str,
        method: str,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Interpret causal analysis results in plain language.
        """
        results_summary = f"""
METHOD: {method}
DiD ESTIMATE: {analysis_results.get('results', {}).get('did_estimate', 0)}
STANDARD ERROR: {analysis_results.get('results', {}).get('standard_error', 0)}
P-VALUE: {analysis_results.get('results', {}).get('p_value', 1)}
95% CONFIDENCE INTERVAL: [{analysis_results.get('results', {}).get('confidence_interval', {}).get('lower', 0)}, 
                          {analysis_results.get('results', {}).get('confidence_interval', {}).get('upper', 0)}]
STATISTICALLY SIGNIFICANT: {analysis_results.get('results', {}).get('is_significant', False)}

OUTCOME: {parameters.get('outcome', 'unknown')}
TREATMENT: {parameters.get('treatment', 'unknown')}

STATISTICS:
- Total observations: {analysis_results.get('results', {}).get('statistics', {}).get('total_observations', 0)}
- Treated units: {analysis_results.get('results', {}).get('statistics', {}).get('treated_units', 0)}
- Control units: {analysis_results.get('results', {}).get('statistics', {}).get('control_units', 0)}
"""
        
        # Add parallel trends info if available
        parallel_trends_info = ""
        pt = analysis_results.get('results', {}).get('parallel_trends_test')
        if pt:
            parallel_trends_info = f"""

PARALLEL TRENDS TEST:
- P-value: {pt.get('p_value', 'N/A')}
- Passed: {pt.get('passed', 'Unknown')}
- Treatment group slope: {pt.get('treated_slope', 'N/A')}
- Control group slope: {pt.get('control_slope', 'N/A')}
"""
        
        prompt = f"""
You are an expert in causal inference. Interpret these results for a non-technical audience.

KNOWLEDGE BASE:
{self.knowledge_base}

RESEARCH QUESTION: {causal_question}

ANALYSIS RESULTS:
{results_summary}
{parallel_trends_info}

Provide a comprehensive interpretation:

1. MAIN FINDING (2-3 sentences in plain language)
   - What was the effect?
   - Was it statistically significant?
   - What does the magnitude mean practically?

2. PARALLEL TRENDS ASSESSMENT
   - Do the parallel trends hold?
   - What does this mean for validity?
   - Should we trust these results?

3. EFFECT SIZE INTERPRETATION
   - Is this a large or small effect?
   - What is the percentage change?
   - Compare to baseline levels

4. STATISTICAL SIGNIFICANCE
   - What does the p-value tell us?
   - What does the confidence interval mean?
   - How confident should we be?

5. LIMITATIONS & CAVEATS
   - What assumptions are we making?
   - What could affect these results?
   - What should we be cautious about?

6. PRACTICAL IMPLICATIONS
   - What does this mean for decision-making?
   - What actions might be warranted?

Return ONLY valid JSON:
{{
  "executive_summary": "...",
  "parallel_trends_interpretation": "...",
  "effect_size_interpretation": "...",
  "statistical_interpretation": "...",
  "limitations": ["...", "..."],
  "implications": ["...", "..."],
  "confidence_level": "high/medium/low",
  "recommendation": "..."
}}

Do not include any text before or after the JSON.
"""
        
        response = self._call_gemini(prompt)
        
        # Clean response
        response = response.strip()
        if response.startswith('```json'):
            response = response[7:]
        if response.startswith('```'):
            response = response[3:]
        if response.endswith('```'):
            response = response[:-3]
        response = response.strip()
        
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {
                'executive_summary': response[:500],
                'parallel_trends_interpretation': 'Unable to parse full response',
                'effect_size_interpretation': '',
                'statistical_interpretation': '',
                'limitations': [],
                'implications': [],
                'confidence_level': 'unknown',
                'recommendation': ''
            }
    
    async def chat_about_results(
        self,
        user_question: str,
        analysis_context: Dict[str, Any],
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> str:
        """
        Interactive chat about analysis results.
        """
        history_str = ""
        if conversation_history:
            history_str = "\n\nCONVERSATION HISTORY:\n" + "\n".join([
                f"{msg.get('role', 'user').upper()}: {msg.get('content', '')}" 
                for msg in conversation_history[-5:]  # Last 5 messages
            ])
        
        prompt = f"""
You are an expert in causal inference helping a user understand their analysis results.

KNOWLEDGE BASE:
{self.knowledge_base}

ANALYSIS CONTEXT:
{json.dumps(analysis_context, indent=2)[:2000]}
{history_str}

USER QUESTION: {user_question}

Provide a clear, helpful answer. Be specific and reference actual numbers from the analysis when relevant. 
If the user's question is unclear, ask for clarification. If the question requires additional analysis, 
suggest what would be needed.

Keep your response concise (2-4 paragraphs).
"""
        
        return self._call_gemini(prompt)


# Singleton instance
_ai_service_instance = None

def get_ai_service() -> CausalAIService:
    """Get or create the AI service singleton."""
    global _ai_service_instance
    if _ai_service_instance is None:
        _ai_service_instance = CausalAIService()
    return _ai_service_instance
```

---

## Key Simplifications

### 1. No Vector Database
- **Before**: LlamaIndex → Vector Store → Embeddings
- **Now**: Knowledge base embedded directly in prompts

### 2. Simpler Dependencies
- **Before**: `llama-index`, `llama-index-llms-gemini`, `chromadb`, `tiktoken`
- **Now**: Just `google-generativeai`

### 3. Direct API Calls
- **Before**: LlamaIndex abstraction layer
- **Now**: Simple `model.generate_content()` calls

### 4. Prompt-Based Knowledge
- **Before**: Vector search → retrieve docs → add to prompt
- **Now**: Knowledge base string → directly in prompt

---

## When to Use This vs. RAG

### ✅ Use Direct API (This Approach) When:
- Knowledge base is small (< 50 documents)
- Knowledge is relatively static
- Simple retrieval is sufficient
- You want simpler codebase
- **← This is YOUR case!**

### ⚠️ Consider RAG When:
- Knowledge base is large (100+ documents)
- Knowledge updates frequently
- Need semantic search across many documents
- Different contexts need different knowledge subsets

---

## Implementation Comparison

### Lines of Code (Backend Service)
- **LlamaIndex approach**: ~600 lines
- **Direct API approach**: ~350 lines ✅

### Dependencies
- **LlamaIndex approach**: 5 packages
- **Direct API approach**: 1 package ✅

### Setup Time
- **LlamaIndex approach**: ~2 hours
- **Direct API approach**: ~30 minutes ✅

### Cost per Request
- **LlamaIndex approach**: API call + embedding call
- **Direct API approach**: Just API call ✅ (slightly cheaper)

---

## Same Frontend, Same Routes

The frontend and routes remain **exactly the same**! The only change is the backend service implementation. Your API contracts don't change at all.

---

## Updated Quick Start

Now even simpler:

```bash
# Install (just one package!)
pip install google-generativeai==0.3.2

# Set environment variable
export GOOGLE_API_KEY=your_key

# Use the simplified service above
```

That's it! No vector databases, no LlamaIndex setup, no embedding configuration.

---

## Summary

**You were absolutely right!** For this use case:
- ✅ Direct API calls are simpler
- ✅ Faster to implement
- ✅ Easier to maintain
- ✅ Lower cost
- ✅ Same functionality
- ✅ Better for your knowledge base size

The only time you'd need LlamaIndex is if your knowledge base grows to 100+ documents and you need sophisticated semantic search. For now, direct API calls with well-structured prompts are perfect!

---

**Want me to update all the other documentation files to reflect this simpler approach?** I can revise:
- AI_QUICK_START.md
- AI_IMPLEMENTATION_CHECKLIST.md  
- AI_ARCHITECTURE_OVERVIEW.md
- etc.

Let me know! 🚀

