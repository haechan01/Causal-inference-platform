import axios from 'axios';

export interface ResultsInterpretation {
  executive_summary: string;
  parallel_trends_interpretation: string;
  effect_size_interpretation: string;
  statistical_interpretation: string;
  limitations: string[];
  implications: string[];
  confidence_level: string;
  next_steps: string[];
  recommendation: string;
}

export interface MethodRecommendation {
  recommended_method: string;
  method_code: string;
  explanation: string;
  alternatives: Array<{
    method: string;
    code: string;
    when_appropriate: string;
  }>;
  key_assumptions: string[];
}

export interface DataQualityAssessment {
  overall_score: number;
  quality_level: 'good' | 'fair' | 'poor' | 'unknown';
  summary: string;
  issues: Array<{
    severity: 'high' | 'medium' | 'low';
    issue: string;
    column: string | null;
    recommendation: string;
  }>;
  strengths: string[];
  recommendations: string[];
  causal_analysis_readiness: 'ready' | 'needs_work' | 'not_suitable' | 'unknown';
  potential_variables: {
    outcome_candidates?: string[];
    treatment_candidates?: string[];
    time_candidates?: string[];
    group_candidates?: string[];
  };
}

interface RecommendMethodRequest {
  treatment_variable: string;
  outcome_variable: string;
  is_time_series: boolean;
  has_control_treatment_groups: boolean;
  causal_question?: string;
}

interface InterpretResultsRequest {
  analysis_results: {
    results: {
      did_estimate: number;
      standard_error: number;
      p_value: number;
      is_significant: boolean;
      confidence_interval: {
        lower: number;
        upper: number;
      };
      statistics: any;
      parallel_trends_test?: any;
    };
  };
  causal_question?: string;
  method?: string;
  parameters: {
    outcome: string;
    treatment: string;
    [key: string]: any;
  };
}

class AIService {
  async interpretResults(
    analysisResults: any,
    parameters: any,
    causalQuestion?: string,
    method: string = 'Difference-in-Differences'
  ): Promise<ResultsInterpretation> {
    const requestData: InterpretResultsRequest = {
      analysis_results: {
        results: {
          did_estimate: analysisResults.did_estimate,
          standard_error: analysisResults.standard_error,
          p_value: analysisResults.p_value,
          is_significant: analysisResults.is_significant,
          confidence_interval: analysisResults.confidence_interval,
          statistics: analysisResults.statistics,
          parallel_trends_test: analysisResults.parallel_trends_test,
        },
      },
      causal_question: causalQuestion,
      method: method,
      parameters: parameters,
    };

    const response = await axios.post<ResultsInterpretation>(
      '/ai/interpret-results',
      requestData
    );
    return response.data;
  }

  async recommendMethod(
    treatmentVariable: string,
    outcomeVariable: string,
    isTimeSeries: boolean,
    hasControlTreatmentGroups: boolean,
    causalQuestion?: string
  ): Promise<MethodRecommendation> {
    const requestData: RecommendMethodRequest = {
      treatment_variable: treatmentVariable,
      outcome_variable: outcomeVariable,
      is_time_series: isTimeSeries,
      has_control_treatment_groups: hasControlTreatmentGroups,
      causal_question: causalQuestion,
    };

    const response = await axios.post<MethodRecommendation>(
      '/ai/recommend-method',
      requestData
    );
    return response.data;
  }

  async assessDataQuality(
    columns: Array<{
      name: string;
      type: string;
      null_count: number;
      unique_count: number;
      min?: number;
      max?: number;
      mean?: number;
    }>,
    summary: {
      total_rows: number;
      total_columns: number;
      numeric_columns: number;
      categorical_columns: number;
      missing_cells: number;
      missing_percentage: number;
    }
  ): Promise<DataQualityAssessment> {
    const response = await axios.post<DataQualityAssessment>(
      '/ai/data-quality-check',
      { columns, summary }
    );
    return response.data;
  }

  async chat(
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    analysisContext?: {
      parameters?: any;
      results?: any;
    },
    datasetInfo?: {
      name?: string;
      columns?: any[];
      summary?: any;
    }
  ): Promise<{ response: string; followup_questions: string[]; timestamp: string }> {
    const response = await axios.post<{ response: string; followup_questions: string[]; timestamp: string }>(
      '/ai/chat',
      {
        message,
        conversation_history: conversationHistory,
        analysis_context: analysisContext,
        dataset_info: datasetInfo
      }
    );
    return response.data;
  }
}

export const aiService = new AIService();

