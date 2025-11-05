import axios from 'axios';

export interface ResultsInterpretation {
  executive_summary: string;
  parallel_trends_interpretation: string;
  effect_size_interpretation: string;
  statistical_interpretation: string;
  limitations: string[];
  implications: string[];
  confidence_level: string;
  recommendation: string;
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
}

export const aiService = new AIService();

