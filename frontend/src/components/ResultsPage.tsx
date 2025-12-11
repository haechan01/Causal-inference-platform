import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import { aiService, ResultsInterpretation } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import { projectStateService } from '../services/projectStateService';
import InteractiveDiDChart from './InteractiveDiDChart';

// Download chart as PNG helper function
const downloadChartAsPNG = (base64Data: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64Data}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

interface PeriodStatistic {
  period: string | number;
  treatment_mean: number | null;
  control_mean: number | null;
  is_post_treatment: boolean;
  is_treatment_start?: boolean;
  period_effect: number | null;
  counterfactual: number | null;
}

interface DiDResults {
  analysis_type: string;
  dataset_id: number;
  parameters: {
    outcome: string;
    treatment: string;
    treatment_value: string;
    time: string;
    treatment_start: string;
    start_period: string;
    end_period: string;
    unit: string;
    controls: string[];
    treatment_units: string[];
    control_units: string[];
  };
  results: {
    did_estimate: number;
    standard_error: number;
    confidence_interval: {
      lower: number;
      upper: number;
    };
    p_value: number;
    is_significant: boolean;
    statistics: {
      total_observations: number;
      treated_units: number;
      control_units: number;
      pre_treatment_obs: number;
      post_treatment_obs: number;
      outcome_mean_treated_pre: number;
      outcome_mean_treated_post: number;
      outcome_mean_control_pre: number;
      outcome_mean_control_post: number;
    };
    period_statistics?: PeriodStatistic[];
    interpretation: {
      effect_size: number;
      effect_direction: string;
      significance: string;
    };
    chart: string;
    chart_data?: any; // Structured data for interactive chart
    parallel_trends_test?: {
      passed: boolean | null;
      p_value: number | null;
      visual_chart: string | null;
    };
    parallel_trends?: {
      passed: boolean | null;
      p_value: number | null;
      message: string;
      confidence_level: 'high' | 'moderate' | 'low' | 'unknown';
      warnings: string[];
      explanations?: string[];
      mean_chart: string | null;
      visual_chart?: string | null; // Legacy support
      event_study_chart: string | null;
      event_study_coefficients?: Array<{
        relative_time: number;
        coefficient: number;
        ci_lower: number;
        ci_upper: number;
        p_value: number | null;
        is_reference: boolean;
        is_pre_treatment: boolean;
      }>;
      all_pre_periods_include_zero?: boolean;
    };
  };
}

const ResultsPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { accessToken } = useAuth();
    const { currentStep, steps, goToPreviousStep, goToNextStep } = useProgressStep();
    const [results, setResults] = useState<DiDResults | null>(null);
    const [loading, setLoading] = useState(true);
    const [showDetails, setShowDetails] = useState(false);
    const [aiInterpretation, setAiInterpretation] = useState<ResultsInterpretation | null>(null);
    const [loadingAI, setLoadingAI] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState<'python' | 'r'>('python');
  const [selectedPeriod, setSelectedPeriod] = useState<string | number | null>(null);
  const [showCheck1Details, setShowCheck1Details] = useState(false);
  const [showCheck2Details, setShowCheck2Details] = useState(false);
  const [showDidCalculationDetails, setShowDidCalculationDetails] = useState(false);
    
    // Get project ID and dataset ID from navigation state or saved state
    const [projectId, setProjectId] = useState<number | null>((location.state as any)?.projectId || null);
    const [datasetId, setDatasetId] = useState<number | null>((location.state as any)?.datasetId || null);

    // Helper function to safely format numbers, handling null/undefined
    const formatNumber = (value: number | null | undefined, decimals: number = 2): string => {
        if (value === null || value === undefined || isNaN(value)) {
            return 'N/A';
        }
        return value.toFixed(decimals);
    };

    useEffect(() => {
        const loadResults = async () => {
            const storedResults = localStorage.getItem('didAnalysisResults');
            
            // Track values to set at the end
            let loadedDatasetId: number | null = datasetId;
            let loadedProjectId: number | null = projectId;
            let loadedResults: DiDResults | null = null;
            
            if (storedResults) {
                try {
                    const parsedResults = JSON.parse(storedResults);
                    loadedResults = parsedResults;
                    setResults(parsedResults);
                    // Set datasetId from results if not already set
                    if (parsedResults.dataset_id) {
                        loadedDatasetId = parsedResults.dataset_id;
                    }
                    // Clear AI interpretation when new results are loaded to ensure it matches
                    setAiInterpretation(null);
                } catch (error) {
                    console.error('Error parsing stored results:', error);
                }
            }
            
            // Try to get projectId from URL if not in state
            if (!loadedProjectId) {
                const urlParams = new URLSearchParams(location.search);
                loadedProjectId = parseInt(urlParams.get('projectId') || '0') || null;
            }
            
            // If no results from localStorage, try loading from project state
            if (!storedResults && loadedProjectId && accessToken) {
                try {
                    const project = await projectStateService.loadProject(loadedProjectId, accessToken);
                    if (project.lastResults) {
                        loadedResults = project.lastResults;
                        setResults(project.lastResults);
                        // Set datasetId from results
                        if (project.lastResults.dataset_id) {
                            loadedDatasetId = project.lastResults.dataset_id;
                        }
                        // Also cache in localStorage for subsequent page loads
                        localStorage.setItem('didAnalysisResults', JSON.stringify(project.lastResults));
                        // Clear AI interpretation when new results are loaded to ensure it matches
                        setAiInterpretation(null);
                    }
                    // Get datasetId from project datasets if still not set
                    if (!loadedDatasetId && project.datasets && project.datasets.length > 0) {
                        loadedDatasetId = project.datasets[0].id;
                    }
                } catch (error) {
                    console.error('Error loading project state:', error);
                }
            }
            
            // Load stored AI interpretation if it matches the current analysis
            if (loadedResults) {
                try {
                    const storedInterpretation = localStorage.getItem('aiInterpretation');
                    if (storedInterpretation) {
                        const parsed = JSON.parse(storedInterpretation);
                        // Create a comprehensive unique key for this analysis based on all relevant parameters
                        const params = loadedResults.parameters || {};
                        const currentAnalysisKey = JSON.stringify({
                            dataset_id: loadedResults.dataset_id,
                            outcome: params.outcome,
                            treatment: params.treatment,
                            treatment_value: params.treatment_value,
                            time: params.time,
                            treatment_start: params.treatment_start,
                            start_period: params.start_period,
                            end_period: params.end_period,
                            unit: params.unit,
                            controls: params.controls?.sort() || [],
                            treatment_units: params.treatment_units?.sort() || [],
                            control_units: params.control_units?.sort() || [],
                            // Include key results to ensure interpretation matches the actual results
                            did_estimate: loadedResults.results?.did_estimate,
                            p_value: loadedResults.results?.p_value,
                            is_significant: loadedResults.results?.is_significant
                        });
                        // Check if the interpretation matches the current analysis
                        if (parsed.analysisKey === currentAnalysisKey) {
                            setAiInterpretation(parsed.interpretation);
                        } else {
                            // Clear cached interpretation if it doesn't match
                            setAiInterpretation(null);
                            localStorage.removeItem('aiInterpretation');
                        }
                    }
                } catch (error) {
                    console.error('Error loading stored AI interpretation:', error);
                    // Clear on error
                    setAiInterpretation(null);
                    localStorage.removeItem('aiInterpretation');
                }
            } else {
                // Clear AI interpretation if no results
                setAiInterpretation(null);
            }
            
            // Update state values
            if (loadedProjectId && loadedProjectId !== projectId) {
                setProjectId(loadedProjectId);
            }
            if (loadedDatasetId && loadedDatasetId !== datasetId) {
                setDatasetId(loadedDatasetId);
            }
            
            setLoading(false);
        };
        
        loadResults();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, accessToken, location.search]);

    // Function to load AI interpretation - only called when user clicks the button
        const loadAIInterpretation = async () => {
            if (!results?.results || !results?.parameters) {
            setAiError('Results or parameters not available');
                return;
            }
            
            setLoadingAI(true);
            setAiError(null);
            
            try {
                const interpretation = await aiService.interpretResults(
                    results.results,
                    results.parameters,
                undefined,
                    'Difference-in-Differences'
                );
                setAiInterpretation(interpretation);
            
            // Store the interpretation in localStorage with a comprehensive key tied to this analysis
            try {
                const params = results.parameters || {};
                const analysisKey = JSON.stringify({
                    dataset_id: results.dataset_id,
                    outcome: params.outcome,
                    treatment: params.treatment,
                    treatment_value: params.treatment_value,
                    time: params.time,
                    treatment_start: params.treatment_start,
                    start_period: params.start_period,
                    end_period: params.end_period,
                    unit: params.unit,
                    controls: params.controls?.sort() || [],
                    treatment_units: params.treatment_units?.sort() || [],
                    control_units: params.control_units?.sort() || [],
                    // Include key results to ensure interpretation matches the actual results
                    did_estimate: results.results?.did_estimate,
                    p_value: results.results?.p_value,
                    is_significant: results.results?.is_significant
                });
                localStorage.setItem('aiInterpretation', JSON.stringify({
                    analysisKey: analysisKey,
                    interpretation: interpretation,
                    timestamp: new Date().toISOString()
                }));
            } catch (storageError) {
                console.error('Error saving AI interpretation to localStorage:', storageError);
            }
            } catch (error: any) {
                const errorData = error.response?.data;
                let errorMessage = errorData?.error || error.message || 'Failed to load AI interpretation';
                
                // Check if it's a quota error
                if (error.response?.status === 429 || errorData?.error_type === 'quota_exceeded') {
                    const retryAfter = errorData?.retry_after;
                    if (retryAfter) {
                        errorMessage = `API quota exceeded. Please wait ${Math.ceil(retryAfter)} seconds before trying again. You can check your usage at https://ai.dev/usage`;
                    } else {
                        errorMessage = 'API quota exceeded. Please check your Google Cloud billing and quota limits at https://ai.dev/usage';
                    }
                }
                
                setAiError(errorMessage);
            } finally {
                setLoadingAI(false);
            }
        };

    if (loading) {
        return (
            <div>
                <Navbar />
                <div style={styles.loadingContainer}>
                    <div style={styles.loadingSpinner}></div>
                    <p style={styles.loadingText}>Loading results...</p>
                </div>
            </div>
        );
    }

    // Show no results if data is loaded but missing
    if (!results || !results.results || !results.parameters) {
        return (
            <div>
                <Navbar />
                <div style={styles.contentContainer}>
                    <div style={styles.mainContent}>
                        <div style={styles.resultsCard}>
                            <h2 style={styles.title}>No Results Found</h2>
                            <p style={styles.message}>No analysis results were found. Please run an analysis first.</p>
                            <button 
                                onClick={() => navigate('/variable-selection')}
                                style={{
                                    backgroundColor: '#043873',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '12px 24px',
                                    fontSize: '16px',
                                    cursor: 'pointer',
                                    marginTop: '20px'
                                }}
                            >
                                Go to Analysis Setup
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Generate AI-powered summary
    const generateAISummary = () => {
        // Add null checks for safety
        if (!results?.results || !results?.parameters) {
            return "Analysis results are not available.";
        }

        const effect = results.results.did_estimate || 0;
        const outcome = results.parameters.outcome || 'outcome';
        const treatment = results.parameters.treatment || 'treatment';
        const significance = results.results.is_significant || false;
        const pValue = results.results.p_value;
        
        const effectColor = significance ? '#28a745' : '#6c757d';
        const significanceColor = significance ? '#28a745' : '#dc3545';
        const significanceText = significance ? 'Significant' : 'Not Significant';
        const pValueText = pValue !== null && pValue !== undefined ? ` (p = ${formatNumber(pValue, 3)})` : '';
        
        return (
            <span>
                <strong style={{color: '#043873'}}>{treatment}</strong> effect on <strong style={{color: '#043873'}}>{outcome}</strong>: {' '}
                <strong style={{color: effectColor, fontSize: '18px'}}>
                    {(effect > 0 ? '+' : '')}{formatNumber(effect, 0)} units
                </strong>
                {' '}
                <span style={{
                    color: significanceColor,
                    fontWeight: 'bold',
                    fontSize: '16px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: significance ? '#d4edda' : '#f8d7da'
                }}>
                    {significanceText}{pValueText}
                </span>
            </span>
        );
    };

    // Generate Python code for the analysis
    const generatePythonCode = () => {
        if (!results?.parameters) return '';
        const p = results.parameters;
        return `# Difference-in-Differences Analysis
# Generated by Causal Platform

import pandas as pd
import numpy as np
import statsmodels.formula.api as smf
import matplotlib.pyplot as plt

# Load your data
# df = pd.read_csv('your_data.csv')

# Define variables
outcome_var = '${p.outcome}'
treatment_var = '${p.treatment}'
time_var = '${p.time}'
unit_var = '${p.unit}'
treatment_start = '${p.treatment_start}'
control_vars = ${JSON.stringify(p.controls || [])}

# Create post-treatment indicator
df['post'] = (df['${p.time}'] >= '${p.treatment_start}').astype(int)

# Create treatment group indicator
df['treated'] = df['${p.treatment}'].isin(${JSON.stringify(p.treatment_units || [])}).astype(int)

# Create interaction term
df['did'] = df['post'] * df['treated']

# Run DiD regression
formula = f"${p.outcome} ~ treated + post + did"
${p.controls?.length ? `formula += " + " + " + ".join(${JSON.stringify(p.controls)})` : ''}
model = smf.ols(formula, data=df).fit(cov_type='cluster', cov_kwds={'groups': df['${p.unit}']})

# Print results
print(model.summary())
print(f"\\nDiD Estimate: {model.params['did']:.4f}")
print(f"Standard Error: {model.bse['did']:.4f}")
print(f"P-value: {model.pvalues['did']:.4f}")
print(f"95% CI: [{model.conf_int().loc['did', 0]:.4f}, {model.conf_int().loc['did', 1]:.4f}]")

# Visualization
fig, ax = plt.subplots(figsize=(10, 6))
treatment_means = df[df['treated'] == 1].groupby('${p.time}')['${p.outcome}'].mean()
control_means = df[df['treated'] == 0].groupby('${p.time}')['${p.outcome}'].mean()

ax.plot(treatment_means.index, treatment_means.values, 'b-o', label='Treatment Group')
ax.plot(control_means.index, control_means.values, 'r-o', label='Control Group')
ax.axvline(x='${p.treatment_start}', color='orange', linestyle='--', label='Treatment Start')
ax.set_xlabel('${p.time}')
ax.set_ylabel('${p.outcome}')
ax.set_title('Difference-in-Differences Analysis')
ax.legend()
plt.tight_layout()
plt.savefig('did_chart.png', dpi=300)
plt.show()`;
    };

    // Generate R code for the analysis
    const generateRCode = () => {
        if (!results?.parameters) return '';
        const p = results.parameters;
        return `# Difference-in-Differences Analysis
# Generated by Causal Platform

library(tidyverse)
library(fixest)
library(ggplot2)

# Load your data
# df <- read.csv('your_data.csv')

# Define variables
outcome_var <- "${p.outcome}"
treatment_var <- "${p.treatment}"
time_var <- "${p.time}"
unit_var <- "${p.unit}"
treatment_start <- "${p.treatment_start}"
treatment_units <- c(${(p.treatment_units || []).map(u => `"${u}"`).join(', ')})
control_vars <- c(${(p.controls || []).map(c => `"${c}"`).join(', ')})

# Create indicators
df <- df %>%
  mutate(
    post = as.integer(${p.time} >= "${p.treatment_start}"),
    treated = as.integer(${p.treatment} %in% treatment_units),
    did = post * treated
  )

# Run DiD regression with clustered standard errors
${p.controls?.length 
  ? `model <- feols(${p.outcome} ~ treated + post + did + ${p.controls.join(' + ')} | ${p.unit}, data = df)` 
  : `model <- feols(${p.outcome} ~ treated + post + did | ${p.unit}, data = df)`}

# Print results
summary(model)
cat("\\nDiD Estimate:", coef(model)["did"], "\\n")
cat("Standard Error:", se(model)["did"], "\\n")
cat("P-value:", pvalue(model)["did"], "\\n")
confint_did <- confint(model)["did", ]
cat("95% CI: [", confint_did[1], ",", confint_did[2], "]\\n")

# Visualization
df_summary <- df %>%
  group_by(${p.time}, treated) %>%
  summarize(mean_outcome = mean(${p.outcome}, na.rm = TRUE), .groups = 'drop') %>%
  mutate(group = ifelse(treated == 1, "Treatment", "Control"))

ggplot(df_summary, aes(x = ${p.time}, y = mean_outcome, color = group, group = group)) +
  geom_line(linewidth = 1) +
  geom_point(size = 3) +
  geom_vline(xintercept = "${p.treatment_start}", linetype = "dashed", color = "orange") +
  labs(
    title = "Difference-in-Differences Analysis",
    x = "${p.time}",
    y = "${p.outcome}",
    color = "Group"
  ) +
  scale_color_manual(values = c("Treatment" = "#4F9CF9", "Control" = "#FF6B6B")) +
  theme_minimal() +
  theme(legend.position = "bottom")

ggsave("did_chart.png", width = 10, height = 6, dpi = 300)`;
    };

    return (
        <div>
            <Navbar />
            <div style={styles.contentContainer}>
                <div style={styles.mainLayout}>
                    <div style={styles.mainContent}>
                    
                    {/* Summary Header */}
                    <div style={styles.summaryHeader}>
                        <div style={styles.summaryHeaderTop}>
                            <h1 style={styles.pageTitle}>Analysis Results</h1>
                            
                        </div>
                        <div style={styles.summaryCard}>
                            <div style={styles.summaryText}>
                                {generateAISummary()}
                            </div>
                            <button 
                                style={styles.detailsToggleBtn}
                                onClick={() => setShowDetails(!showDetails)}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.backgroundColor = '#f0f7ff';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                <span>Show Statistical Details</span>
                                <span>{showDetails ? '▲' : '▼'}</span>
                            </button>
                        </div>

                        {/* Statistical Details (expandable) */}
                        {showDetails && (
                            <div style={styles.statisticalDetailsInline}>
                                <div style={styles.detailsGrid}>
                                    <div style={styles.detailItem}>
                                        <span style={styles.detailLabel}>Treatment Effect (DiD):</span>
                                        <span style={styles.detailValue}>{formatNumber(results.results?.did_estimate, 2)}</span>
                            </div>
                                    <div style={styles.detailItem}>
                                        <span style={styles.detailLabel}>95% Confidence Interval:</span>
                                        <span style={styles.detailValue}>
                                            [{formatNumber(results.results?.confidence_interval?.lower, 2)}, {formatNumber(results.results?.confidence_interval?.upper, 2)}]
                                    </span>
                                    </div>
                                    <div style={styles.detailItem}>
                                        <span style={styles.detailLabel}>p-value:</span>
                                        <span style={styles.detailValue}>{formatNumber(results.results?.p_value, 4)}</span>
                                    </div>
                                    <div style={styles.detailItem}>
                                        <span style={styles.detailLabel}>Control Variables:</span>
                                        <span style={styles.detailValue}>
                                            {(results.parameters?.controls?.length || 0) > 0 
                                                ? (results.parameters?.controls || []).join(', ') 
                                                : 'None'
                                            }
                                    </span>
                            </div>
                                    <div style={styles.detailItem}>
                                        <span style={styles.detailLabel}>Total Observations:</span>
                                        <span style={styles.detailValue}>{results.results?.statistics?.total_observations || 0}</span>
                        </div>
                                    <div style={styles.detailItem}>
                                        <span style={styles.detailLabel}>Treated / Control Units:</span>
                                        <span style={styles.detailValue}>
                                            {results.results?.statistics?.treated_units || 0} / {results.results?.statistics?.control_units || 0}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* DiD Visualization Chart - Moved here from separate section */}
                        {((results.results as any)?.chart || (results.results as any)?.chart_data) && (
                            <div style={{...styles.visualizationSection, marginTop: '30px'}}>
                                <div style={styles.chartHeader}>
                                    <h2 style={styles.sectionTitle}>What Happened Over Time</h2>
                                </div>
                                <div style={styles.chartContainer}>
                                    <div style={styles.realChartContainer}>
                                        {(results.results as any)?.chart_data ? (
                                            <InteractiveDiDChart
                                                key="did-chart"
                                                chartData={(results.results as any).chart_data}
                                                fallbackPng={(results.results as any).chart}
                                            />
                                        ) : (
                                            <img 
                                                src={`data:image/png;base64,${(results.results as any).chart}`} 
                                                alt="Difference-in-Differences Analysis Chart"
                                                style={styles.realChart}
                                            />
                                        )}
                                        <div style={styles.chartNote}>
                                            The blue line represents the treatment group, 
                                            the red line represents the control group, and the dashed line shows what would have happened 
                                            to the treatment group without the intervention (counterfactual).
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Effect Size by Period - Combined section */}
                        {(() => {
                            const pt = (results.results as any)?.parallel_trends || (results.results as any)?.parallel_trends_test;
                            const postTreatmentCoeffs = pt?.event_study_coefficients?.filter((coef: any) => 
                                !coef.is_pre_treatment && !coef.is_reference && coef.relative_time >= 0
                            ) || [];
                            
                            // Get period statistics for post-treatment periods
                            const postPeriodStats = (results.results?.period_statistics || []).filter((p: any) => 
                                p.is_post_treatment && !p.is_treatment_start
                            );
                            
                            // Get treatment start time to convert relative_time to actual periods
                            const treatmentStart = results.parameters?.treatment_start;
                            const timeVar = results.parameters?.time;
                            
                            // Helper to convert relative_time to actual period
                            const getPeriodFromRelativeTime = (relativeTime: number): string | number => {
                                if (typeof treatmentStart === 'string' || typeof treatmentStart === 'number') {
                                    const startNum = typeof treatmentStart === 'string' ? parseFloat(treatmentStart) : treatmentStart;
                                    if (!isNaN(startNum)) {
                                        return startNum + relativeTime;
                                    }
                                }
                                return `t = ${relativeTime}`;
                            };
                            
                            // Combine data: prefer period_statistics if available, otherwise use event_study_coefficients
                            // For period_statistics, try to get CI from event_study_coefficients if available
                            const combinedData = postPeriodStats.length > 0 
                                ? postPeriodStats.map((period: any) => {
                                    // Try to find matching event study coefficient for CI
                                    const matchingCoeff = postTreatmentCoeffs.find((coef: any) => {
                                        const periodFromRelative = getPeriodFromRelativeTime(coef.relative_time);
                                        return periodFromRelative === period.period || 
                                               (typeof periodFromRelative === 'number' && typeof period.period === 'number' && 
                                                Math.abs(periodFromRelative - period.period) < 0.01);
                                    });
                                    return {
                                        period: period.period,
                                        effectSize: period.period_effect,
                                        ciLower: matchingCoeff?.ci_lower ?? null,
                                        ciUpper: matchingCoeff?.ci_upper ?? null,
                                        isSignificant: matchingCoeff ? (matchingCoeff.p_value !== null && matchingCoeff.p_value < 0.05) : null,
                                        treatmentMean: period.treatment_mean,
                                        controlMean: period.control_mean,
                                        counterfactual: period.counterfactual
                                    };
                                })
                                : postTreatmentCoeffs.map((coef: any) => ({
                                    period: getPeriodFromRelativeTime(coef.relative_time),
                                    effectSize: coef.coefficient,
                                    ciLower: coef.ci_lower,
                                    ciUpper: coef.ci_upper,
                                    isSignificant: coef.p_value !== null && coef.p_value < 0.05,
                                    treatmentMean: null,
                                    controlMean: null,
                                    counterfactual: null
                                }));
                            
                            // Check if any row has CI data
                            const hasCIData = combinedData.some((item: any) => item.ciLower !== null);
                            
                            if (combinedData.length > 0) {
                                // Calculate overall average
                                const overallAverage = results.results?.did_estimate;
                                const stats = results.results?.statistics;
                                
                                return (
                                    <div style={{...styles.visualizationSection, marginTop: '30px'}}>
                                        <div style={styles.chartHeader}>
                                            <h2 style={styles.sectionTitle}>Effect Size</h2>
                                        </div>
                                        <div style={{padding: '20px'}}>
                                            <p style={{marginBottom: '20px', color: '#666', fontSize: '14px'}}>
                                                Treatment effects for each post-treatment period:
                                            </p>
                                            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '14px'}}>
                                                <thead>
                                                    <tr style={{backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6'}}>
                                                        <th style={{padding: '12px', textAlign: 'left', fontWeight: '600', color: '#212529'}}>Period</th>
                                                        <th style={{padding: '12px', textAlign: 'right', fontWeight: '600', color: '#212529'}}>Effect Size</th>
                                                        <th style={{padding: '12px', textAlign: 'right', fontWeight: '600', color: '#212529'}}>95% CI Lower</th>
                                                        <th style={{padding: '12px', textAlign: 'right', fontWeight: '600', color: '#212529'}}>95% CI Upper</th>
                                                        <th style={{padding: '12px', textAlign: 'center', fontWeight: '600', color: '#212529'}}>Significant</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {combinedData.map((item: any, idx: number) => (
                                                        <tr key={idx} style={{borderBottom: '1px solid #e9ecef'}}>
                                                            <td style={{padding: '12px', fontWeight: '500', color: '#212529'}}>
                                                                {item.period}
                                                            </td>
                                                            <td style={{padding: '12px', textAlign: 'right', color: '#212529', fontWeight: '500'}}>
                                                                {formatNumber(item.effectSize, 4)}
                                                            </td>
                                                            <td style={{padding: '12px', textAlign: 'right', color: '#212529'}}>
                                                                {item.ciLower !== null ? formatNumber(item.ciLower, 4) : 'N/A'}
                                                            </td>
                                                            <td style={{padding: '12px', textAlign: 'right', color: '#212529'}}>
                                                                {item.ciUpper !== null ? formatNumber(item.ciUpper, 4) : 'N/A'}
                                                            </td>
                                                            <td style={{padding: '12px', textAlign: 'center'}}>
                                                                {item.isSignificant !== null ? (
                                                                    item.isSignificant ? (
                                                                        <span style={{color: '#28a745', fontWeight: '600'}}>✓ Yes</span>
                                                                    ) : (
                                                                        <span style={{color: '#6c757d'}}>No</span>
                                                                    )
                                                                ) : (
                                                                    <span style={{color: '#6c757d'}}>N/A</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {/* Overall Average Row */}
                                                    {overallAverage !== null && overallAverage !== undefined && (
                                                        <tr style={{borderTop: '2px solid #dee2e6', backgroundColor: '#f8f9fa'}}>
                                                            <td style={{padding: '12px', fontWeight: '700', color: '#043873'}}>
                                                                Overall Average (DiD Estimate)
                                                            </td>
                                                            <td style={{padding: '12px', textAlign: 'right', fontWeight: '700', color: '#043873', fontSize: '16px'}}>
                                                                {(overallAverage >= 0 ? '+' : '')}{formatNumber(overallAverage, 4)}
                                                            </td>
                                                            <td style={{padding: '12px', textAlign: 'right', fontWeight: '600', color: '#043873'}}>
                                                                {formatNumber(results.results?.confidence_interval?.lower, 4)}
                                                            </td>
                                                            <td style={{padding: '12px', textAlign: 'right', fontWeight: '600', color: '#043873'}}>
                                                                {formatNumber(results.results?.confidence_interval?.upper, 4)}
                                                            </td>
                                                            <td style={{padding: '12px', textAlign: 'center', fontWeight: '600', color: '#043873'}}>
                                                                {results.results?.is_significant ? (
                                                                    <span style={{color: '#28a745'}}>✓ Yes</span>
                                                                ) : (
                                                                    <span style={{color: '#6c757d'}}>No</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                            
                                            {/* How DiD was calculated - Collapsible */}
                                            {stats && overallAverage !== null && overallAverage !== undefined && (
                                                <div style={{marginTop: '24px'}}>
                                                    <button
                                                        onClick={() => setShowDidCalculationDetails(!showDidCalculationDetails)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '12px 16px',
                                                            backgroundColor: '#f8f9fa',
                                                            border: '1px solid #dee2e6',
                                                            borderRadius: '8px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            fontSize: '16px',
                                                            fontWeight: '600',
                                                            color: '#043873',
                                                            transition: 'background-color 0.2s'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = '#e9ecef';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = '#f8f9fa';
                                                        }}
                                                        type="button"
                                                    >
                                                        <span>How the DiD Estimate was Calculated</span>
                                                        <span>{showDidCalculationDetails ? '▲' : '▼'}</span>
                                                    </button>
                                                    {showDidCalculationDetails && (
                                                        <div style={{
                                                            marginTop: '0',
                                                            padding: '16px',
                                                            backgroundColor: '#ffffff',
                                                            borderRadius: '0 0 8px 8px',
                                                            border: '1px solid #dee2e6',
                                                            borderTop: 'none'
                                                        }}>
                                                            <div style={{fontSize: '14px', color: '#212529', lineHeight: '1.8'}}>
                                                                <p style={{margin: '0 0 8px 0'}}>
                                                                    <strong>Step 1:</strong> Calculate change in Treatment Group
                                                                </p>
                                                                <div style={{marginLeft: '20px', marginBottom: '12px'}}>
                                                                    Treatment Post - Treatment Pre = {formatNumber(stats.outcome_mean_treated_post, 2)} - {formatNumber(stats.outcome_mean_treated_pre, 2)} = <strong>{formatNumber(stats.outcome_mean_treated_post - stats.outcome_mean_treated_pre, 2)}</strong>
                                                                </div>
                                                                <p style={{margin: '0 0 8px 0'}}>
                                                                    <strong>Step 2:</strong> Calculate change in Control Group
                                                                </p>
                                                                <div style={{marginLeft: '20px', marginBottom: '12px'}}>
                                                                    Control Post - Control Pre = {formatNumber(stats.outcome_mean_control_post, 2)} - {formatNumber(stats.outcome_mean_control_pre, 2)} = <strong>{formatNumber(stats.outcome_mean_control_post - stats.outcome_mean_control_pre, 2)}</strong>
                                                                </div>
                                                                <p style={{margin: '0 0 8px 0'}}>
                                                                    <strong>Step 3:</strong> DiD Estimate = Treatment Change - Control Change
                                                                </p>
                                                                <div style={{marginLeft: '20px', marginBottom: '8px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6'}}>
                                                                    DiD = {formatNumber(stats.outcome_mean_treated_post - stats.outcome_mean_treated_pre, 2)} - {formatNumber(stats.outcome_mean_control_post - stats.outcome_mean_control_pre, 2)} = <strong style={{color: '#043873', fontSize: '16px'}}>{(overallAverage >= 0 ? '+' : '')}{formatNumber(overallAverage, 4)}</strong>
                                                                </div>
                                                                <p style={{margin: '8px 0 0 0', fontSize: '13px', color: '#666', fontStyle: 'italic'}}>
                                                                    This represents the average treatment effect across all post-treatment periods, accounting for the control group's natural trend.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>

        {/* NEW: Parallel Trends Assessment Section */}
        <div style={styles.parallelTrendsSection}>
          <h2 style={styles.sectionTitle}>Did the Groups Start Out Similar?</h2>
          <p style={styles.explanation}>
            Before we can trust our results, we need to check if the treatment and control groups were changing at similar rates before treatment started. 
            If they were already diverging, we can't be sure that differences after treatment are caused by the treatment itself.
          </p>
          
          {/* Use new parallel_trends structure if available, fallback to parallel_trends_test */}
          {(() => {
            const pt = (results.results as any)?.parallel_trends || (results.results as any)?.parallel_trends_test;
            const isNewFormat = !!(results.results as any)?.parallel_trends;
            
            // Determine if statistical test passed (high p-value = passed)
            const statTestPassed = pt?.p_value !== null && pt?.p_value !== undefined && pt.p_value > 0.05;
            const statTestPValue = pt?.p_value;
            
            // Determine if event study passed (all pre-treatment periods include zero)
            const eventStudyPassed = pt?.all_pre_periods_include_zero === true;
            const hasEventStudyData = pt?.event_study_coefficients && Array.isArray(pt.event_study_coefficients) && pt.event_study_coefficients.length > 0;
            
            return (
              <>
                {/* Check 1: Statistical Test */}
                <div style={{...styles.checkBox, marginBottom: '20px'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px'}}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: statTestPassed ? '#d4edda' : '#f8d7da',
                      color: statTestPassed ? '#155724' : '#721c24',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      flexShrink: 0
                    }}>
                      {statTestPassed ? '✓' : '✗'}
                    </div>
                    <h3 style={{margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#043873'}}>
                      Check 1: Statistical Test
                    </h3>
                  </div>
                  
                  {statTestPValue !== null && statTestPValue !== undefined ? (
                    <>
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: statTestPassed ? '#d4edda' : '#f8d7da',
                        borderRadius: '6px',
                        marginBottom: '10px',
                        border: `1px solid ${statTestPassed ? '#c3e6cb' : '#f5c6cb'}`
                      }}>
                        <p style={{margin: 0, fontSize: '15px', fontWeight: '500', color: statTestPassed ? '#155724' : '#721c24'}}>
                          {statTestPassed 
                            ? `✓ The parallel trends test passed with a high p-value (${formatNumber(statTestPValue, 2)}). This suggests the groups were changing at similar rates before treatment.`
                            : `✗ The parallel trends test found evidence that groups were diverging before treatment (p = ${formatNumber(statTestPValue, 3)}). Interpret results with caution.`
                          }
                        </p>
                      </div>
                      <p style={{margin: '0 0 20px 0', fontSize: '14px', color: '#212529', lineHeight: '1.5'}}>
                        <strong>What this means:</strong> We compared how the treatment and control groups changed over time before treatment. 
                        A high p-value (above 0.05) means we don't see strong evidence that the groups were diverging.
                      </p>
                      
                      {/* Show More Details Button for Check 1 */}
                      <button
                        onClick={() => setShowCheck1Details(!showCheck1Details)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: 'transparent',
                          border: '1px solid #4F9CF9',
                          borderRadius: '6px',
                          color: '#4F9CF9',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s',
                          marginBottom: showCheck1Details ? '12px' : '0'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0f7ff';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        {showCheck1Details ? (
                          <>
                            <span>Show less</span>
                            <span>▲</span>
                          </>
                        ) : (
                          <>
                            <span>Show more details</span>
                            <span>▼</span>
                          </>
                        )}
                      </button>
                      
                      {/* Check 1 Detailed Explanation */}
                      {showCheck1Details && (
                        <div style={{
                          marginTop: '12px',
                          padding: '16px',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '6px',
                          border: '1px solid #dee2e6'
                        }}>
                          <h4 style={{fontSize: '15px', fontWeight: 'bold', marginBottom: '12px', color: '#043873'}}>
                            How the p-value was calculated
                          </h4>
                          <p style={{marginBottom: '10px', fontSize: '14px', lineHeight: '1.6', color: '#212529'}}>
                            We ran a regression model on pre-treatment data: <code style={{backgroundColor: '#e9ecef', padding: '2px 6px', borderRadius: '3px', fontSize: '12px', color: '#212529'}}>outcome ~ time × treatment</code>
                          </p>
                          <p style={{marginBottom: '10px', fontSize: '14px', lineHeight: '1.6', color: '#212529'}}>
                            This model tests whether the interaction between time and treatment is statistically significant. 
                            If the groups follow parallel trends, this interaction should be zero (no difference in trends).
                          </p>
                          <p style={{marginBottom: '10px', fontSize: '14px', lineHeight: '1.6', color: '#212529'}}>
                            We then perform a joint F-test on all pre-treatment interaction terms. The F-test checks if, collectively, 
                            the treatment and control groups had different trends before treatment started.
                          </p>
                          <p style={{marginBottom: '0', fontSize: '14px', lineHeight: '1.6', color: '#212529'}}>
                            <strong>Your result:</strong> p-value = {formatNumber(statTestPValue, 3)}. 
                            {statTestPassed 
                              ? ' Since this is above 0.05, we fail to reject the null hypothesis that trends were parallel. This supports the parallel trends assumption.'
                              : ' Since this is below 0.05, we reject the null hypothesis. This suggests the groups were diverging before treatment.'
                            }
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: '#fff3cd',
                      borderRadius: '6px',
                      marginBottom: '10px',
                      border: '1px solid #ffeaa7'
                    }}>
                      <p style={{margin: 0, fontSize: '15px', color: '#856404'}}>
                        Could not perform statistical test. {pt?.message || 'Insufficient pre-treatment data.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Check 2: Event Study */}
                <div style={styles.checkBox}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px'}}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: hasEventStudyData ? (eventStudyPassed ? '#d4edda' : '#fff3cd') : '#e9ecef',
                      color: hasEventStudyData ? (eventStudyPassed ? '#155724' : '#856404') : '#6c757d',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      flexShrink: 0
                    }}>
                      {hasEventStudyData ? (eventStudyPassed ? '✓' : '⚠') : '—'}
                    </div>
                    <h3 style={{margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#043873'}}>
                      Check 2: Event Study
                    </h3>
                  </div>
                  
                  {hasEventStudyData ? (
                    <>
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: eventStudyPassed ? '#d4edda' : '#fff3cd',
                        borderRadius: '6px',
                        marginBottom: '10px',
                        border: `1px solid ${eventStudyPassed ? '#c3e6cb' : '#ffeaa7'}`
                      }}>
                        <p style={{margin: 0, fontSize: '15px', fontWeight: '500', color: eventStudyPassed ? '#155724' : '#856404'}}>
                          {eventStudyPassed
                            ? `✓ Pre-treatment periods show no significant differences. The groups appear to follow parallel trends.`
                            : `⚠ Some pre-treatment periods show differences between groups. This may indicate a violation of parallel trends.`
                          }
                        </p>
                      </div>
                      <p style={{margin: '0 0 0 0', fontSize: '14px', color: '#212529', lineHeight: '1.5'}}>
                        <strong>What this means:</strong> We examined the difference between treatment and control groups at each time point before treatment. 
                        If pre-treatment differences hover around zero, parallel trends likely holds.
                      </p>
                    </>
                  ) : (
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '6px',
                      marginBottom: '10px',
                      border: '1px solid #dee2e6'
                    }}>
                      <p style={{margin: 0, fontSize: '15px', color: '#212529'}}>
                        Event study not available. {pt?.warnings?.find((w: string) => w.toLowerCase().includes('event study')) || 'Insufficient data for event study analysis.'}
                      </p>
                    </div>
                  )}
                </div>
              
              {/* Event Study Chart - Primary Visualization */}
              {isNewFormat && pt && (
                <div style={styles.chartContainer}>
                  <div style={{...styles.chartHeader, marginTop: '24px'}}>
                    <h3 style={styles.chartSubtitle}>Event Study: Treatment Effect Over Time</h3>
                    {pt?.event_study_chart && pt.event_study_chart !== null && pt.event_study_chart !== '' && typeof pt.event_study_chart === 'string' && (
                      <button
                        onClick={() => downloadChartAsPNG(
                          pt.event_study_chart!,
                          'event_study_chart.png'
                        )}
                        style={styles.downloadButton}
                        title="Download chart as PNG"
                      >
                        ⬇️ Download Chart
                      </button>
                    )}
                  </div>
                  <div style={{width: '100%', overflow: 'hidden'}}>
                    {pt?.event_study_chart && pt.event_study_chart !== null && pt.event_study_chart !== '' && typeof pt.event_study_chart === 'string' ? (
                    <img 
                      src={`data:image/png;base64,${pt.event_study_chart}`} 
                      alt="Event study: treatment-control difference over time" 
                      style={{...styles.chart, maxWidth: '100%', boxSizing: 'border-box'}}
                      onError={(e) => {
                        console.error('Failed to load event study chart. Chart data length:', pt.event_study_chart?.length || 0);
                        console.error('First 100 chars:', pt.event_study_chart?.substring(0, 100));
                        (e.target as HTMLImageElement).style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.style.padding = '20px';
                        errorDiv.style.backgroundColor = '#f8d7da';
                        errorDiv.style.borderRadius = '6px';
                        errorDiv.style.border = '1px solid #dc3545';
                        errorDiv.innerHTML = '<p style="margin: 0; color: #721c24;">⚠️ Failed to load event study chart image.</p>';
                        (e.target as HTMLImageElement).parentElement?.appendChild(errorDiv);
                      }}
                    />
                  ) : (
                    <div style={{padding: '20px', backgroundColor: '#fff3cd', borderRadius: '6px', border: '1px solid #ffc107'}}>
                      <p style={{margin: 0, color: '#856404', fontWeight: '500'}}>
                        ⚠️ Event study chart is not available.
                      </p>
                      {pt?.event_study_coefficients && pt.event_study_coefficients.length > 0 ? (
                        <p style={{margin: '10px 0 0 0', color: '#856404'}}>
                          You can see the coefficients in the table below.
                        </p>
                      ) : (
                        <div style={{marginTop: '12px'}}>
                          <p style={{margin: '0 0 8px 0', color: '#856404'}}>
                            <strong>Why isn't the event study available?</strong>
                          </p>
                          {pt?.warnings && pt.warnings.length > 0 ? (
                            <ul style={{margin: '0', paddingLeft: '20px', color: '#856404'}}>
                              {pt.warnings.filter((w: string) => w.toLowerCase().includes('event study')).map((warning: string, idx: number) => (
                                <li key={idx} style={{marginBottom: '4px'}}>{warning}</li>
                              ))}
                            </ul>
                          ) : (
                            <p style={{margin: 0, color: '#856404', fontSize: '14px'}}>
                              Event study requires multiple pre-treatment and post-treatment periods, 
                              and variation in treatment timing across units (or sufficient data variation).
                              Your data may not meet these requirements.
                            </p>
                          )}
                        </div>
                      )}
                      {process.env.NODE_ENV === 'development' && (
                        <p style={{margin: '10px 0 0 0', fontSize: '12px', color: '#666'}}>
                          Debug: event_study_chart type = {typeof pt?.event_study_chart},
                          value = {pt?.event_study_chart ? (pt.event_study_chart.toString().substring(0, 50) + '...') : 'null/undefined'},
                          event_study_coefficients = {pt?.event_study_coefficients ? pt.event_study_coefficients.length : 'missing'}
                        </p>
                      )}
                    </div>
                  )}
                  </div>
                  
                  {/* Check 2 Show More Details Button - Below Event Study Chart */}
                  {hasEventStudyData && (
                    <div style={{marginTop: '20px'}}>
                      <button
                        onClick={() => setShowCheck2Details(!showCheck2Details)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: 'transparent',
                          border: '1px solid #4F9CF9',
                          borderRadius: '6px',
                          color: '#4F9CF9',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s',
                          marginBottom: showCheck2Details ? '12px' : '0'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0f7ff';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        {showCheck2Details ? (
                          <>
                            <span>Show less</span>
                            <span>▲</span>
                          </>
                        ) : (
                          <>
                            <span>Show more details</span>
                            <span>▼</span>
                          </>
                        )}
                      </button>
                      
                      {/* Check 2 Detailed Explanation */}
                      {showCheck2Details && (
                        <div style={{
                          marginTop: '12px',
                          padding: '16px',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '6px',
                          border: '1px solid #dee2e6'
                        }}>
                          <h4 style={{fontSize: '15px', fontWeight: 'bold', marginBottom: '12px', color: '#043873'}}>
                            What is an event study?
                          </h4>
                          <p style={{marginBottom: '12px', fontSize: '14px', lineHeight: '1.6', color: '#212529'}}>
                            An event study estimates the treatment effect at each time point relative to when treatment starts. 
                            Pre-treatment coefficients (blue points) should be near zero if parallel trends holds. 
                            Post-treatment coefficients (red points) show how the treatment effect evolves over time.
                          </p>
                          
                          <h4 style={{fontSize: '15px', fontWeight: 'bold', marginBottom: '12px', color: '#043873'}}>
                            How to read this chart
                          </h4>
                          <p style={{marginBottom: '12px', fontSize: '14px', lineHeight: '1.6', color: '#212529'}}>
                            Pre-treatment periods (blue points) should hover around zero with confidence intervals that include zero. 
                            If they do, parallel trends likely holds. Post-treatment periods (red points) show the treatment effect over time.
                            The reference period (t = -1) is normalized to zero and shown as a gray square.
                          </p>
                          
                          <p style={{marginBottom: '12px', fontSize: '14px', lineHeight: '1.6', color: '#212529'}}>
                            <strong>Your result:</strong> {eventStudyPassed 
                              ? 'All pre-treatment confidence intervals include zero, suggesting parallel trends holds.'
                              : 'Some pre-treatment periods show differences between groups, which may indicate a violation of parallel trends.'
                            }
                          </p>
                          
                          {/* Event Study Coefficients Table */}
                          {pt?.event_study_coefficients && Array.isArray(pt.event_study_coefficients) && pt.event_study_coefficients.length > 0 && (
                            <>
                              <h4 style={{fontSize: '15px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: '#043873'}}>
                                Event Study Coefficients
                              </h4>
                              <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px'}}>
                                <thead>
                                  <tr style={{backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6'}}>
                                    <th style={{padding: '10px', textAlign: 'left', fontWeight: '600', color: '#212529'}}>Period</th>
                                    <th style={{padding: '10px', textAlign: 'right', fontWeight: '600', color: '#212529'}}>Coefficient</th>
                                    <th style={{padding: '10px', textAlign: 'right', fontWeight: '600', color: '#212529'}}>95% CI Lower</th>
                                    <th style={{padding: '10px', textAlign: 'right', fontWeight: '600', color: '#212529'}}>95% CI Upper</th>
                                    <th style={{padding: '10px', textAlign: 'center', fontWeight: '600', color: '#212529'}}>Type</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pt.event_study_coefficients.map((coef: any, idx: number) => (
                                    <tr key={idx} style={{borderBottom: '1px solid #dee2e6'}}>
                                      <td style={{padding: '10px', fontWeight: coef.is_reference ? 'bold' : '500', color: '#212529'}}>
                                        {coef.relative_time === -1 ? 't = -1 (ref)' : `t = ${coef.relative_time}`}
                                      </td>
                                      <td style={{padding: '10px', textAlign: 'right', color: '#212529', fontWeight: '500'}}>
                                        {coef.is_reference ? '0.00' : formatNumber(coef.coefficient, 4)}
                                      </td>
                                      <td style={{padding: '10px', textAlign: 'right', color: '#212529'}}>
                                        {coef.is_reference ? '0.00' : formatNumber(coef.ci_lower, 4)}
                                      </td>
                                      <td style={{padding: '10px', textAlign: 'right', color: '#212529'}}>
                                        {coef.is_reference ? '0.00' : formatNumber(coef.ci_upper, 4)}
                                      </td>
                                      <td style={{padding: '10px', textAlign: 'center'}}>
                                        {coef.is_reference ? (
                                          <span style={{color: '#666', fontStyle: 'italic', fontWeight: '500'}}>Reference</span>
                                        ) : coef.is_pre_treatment ? (
                                          <span style={{color: '#4F9CF9', fontWeight: '600'}}>Pre-treatment</span>
                                        ) : (
                                          <span style={{color: '#FF6B6B', fontWeight: '600'}}>Post-treatment</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          )}
                          
                          {/* Warnings */}
                          {pt?.warnings && pt.warnings.length > 0 && (
                            <div style={{marginTop: '16px', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '6px', border: '1px solid #ffeaa7'}}>
                              <strong style={{display: 'block', marginBottom: '8px', color: '#856404'}}>⚠️ Important Notes:</strong>
                              <ul style={{margin: '8px 0', paddingLeft: '20px'}}>
                                {pt.warnings.map((warning: string, idx: number) => (
                                  <li key={idx} style={{marginBottom: '6px', lineHeight: '1.5', color: '#856404', fontSize: '14px'}}>{warning}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              </>
            );
          })()}
        </div>

        {/* CODE SECTION - Reproducible Analysis */}
        <div style={styles.codeSection}>
            <div style={styles.codeSectionHeader}>
                <h2 style={styles.sectionTitle}>📝 Reproduce This Analysis</h2>
                <button
                    onClick={() => setShowCode(!showCode)}
                    style={styles.codeToggleButton}
                >
                    {showCode ? '▲ Hide Code' : '▼ Show Code'}
                </button>
            </div>
            
            {showCode && (
                <div style={styles.codeContent}>
                    <p style={styles.codeDescription}>
                        Use the code below to reproduce this analysis in your preferred environment.
                    </p>
                    
                    {/* Language Tabs */}
                    <div style={styles.languageTabs}>
                        <button
                            onClick={() => setCodeLanguage('python')}
                            style={{
                                ...styles.languageTab,
                                ...(codeLanguage === 'python' ? styles.languageTabActive : {})
                            }}
                        >
                            🐍 Python
                        </button>
                        <button
                            onClick={() => setCodeLanguage('r')}
                            style={{
                                ...styles.languageTab,
                                ...(codeLanguage === 'r' ? styles.languageTabActive : {})
                            }}
                        >
                            📊 R
                        </button>
                    </div>
                    
                    {/* Code Block */}
                    <div style={styles.codeBlock}>
                        <div style={styles.codeBlockHeader}>
                            <span style={styles.codeBlockTitle}>
                                {codeLanguage === 'python' ? 'Python (statsmodels)' : 'R (fixest)'}
                            </span>
                            <button
                                onClick={() => {
                                    const code = codeLanguage === 'python' ? generatePythonCode() : generateRCode();
                                    navigator.clipboard.writeText(code);
                                    alert('Code copied to clipboard!');
                                }}
                                style={styles.copyButton}
                            >
                                📋 Copy Code
                            </button>
                        </div>
                        <pre style={styles.codeText}>
                            <code>{codeLanguage === 'python' ? generatePythonCode() : generateRCode()}</code>
                        </pre>
                    </div>
                </div>
            )}
        </div>
                    </div>

                    {/* AI INTERPRETATION SECTION - Right Sidebar */}
                    <div style={styles.aiSidebar}>
                        <div style={styles.aiSection}>
                            <div style={styles.aiSectionHeader}>
                                <h2 style={styles.sectionTitle}>🤖 AI-Powered Interpretation</h2>
                                {!aiInterpretation && !loadingAI && (
                                    <button 
                                        onClick={loadAIInterpretation}
                                        style={styles.getAiButton}
                                        disabled={loadingAI}
                                    >
                                        ✨ Get AI Interpretation
                                    </button>
                                )}
                            </div>
                        
                        {/* Loading State */}
                        {loadingAI && (
                            <div style={styles.aiLoading}>
                                <div style={styles.spinner}></div>
                                <p>AI is analyzing your results...</p>
                            </div>
                        )}

                        {/* Error State */}
                        {aiError && !loadingAI && (
                            <div style={styles.aiError}>
                                <p>⚠️ {aiError}</p>
                                <p style={styles.aiErrorNote}>Your results are still valid. AI interpretation is temporarily unavailable.</p>
                                {!aiError.includes('quota exceeded') && (
                                    <button 
                                        onClick={() => {
                                            setAiError(null);
                                            loadAIInterpretation();
                                        }}
                                        style={{...styles.aiButton, marginTop: '10px', backgroundColor: '#6c757d'}}
                                    >
                                        Try Again
                                    </button>
                                )}
                                {aiError.includes('quota exceeded') && (
                                    <div style={{marginTop: '10px', fontSize: '13px', opacity: 0.9}}>
                                        <p>💡 <strong>Tip:</strong> Check your Google Cloud Console to:</p>
                                        <ul style={{marginTop: '8px', paddingLeft: '20px'}}>
                                            <li>Verify your API key has sufficient quota</li>
                                            <li>Upgrade your plan if needed</li>
                                            <li>Check usage limits at <a href="https://ai.dev/usage" target="_blank" rel="noopener noreferrer" style={{color: '#043873'}}>ai.dev/usage</a></li>
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Prompt to get AI interpretation */}
                        {!loadingAI && !aiInterpretation && !aiError && (
                            <div style={styles.aiPrompt}>
                                <div style={styles.aiPromptIcon}>🤖</div>
                                <h3 style={styles.aiPromptTitle}>Get Expert Analysis</h3>
                                <p style={styles.aiPromptText}>
                                    Click the button above to get AI-powered insights including executive summary, 
                                    effect size interpretation, limitations, and actionable recommendations.
                                </p>
                            </div>
                        )}

                        {/* Success State - Show Interpretation */}
                        {aiInterpretation && !loadingAI && (
                            <>
                            
                            {/* Executive Summary */}
                            <div style={styles.aiCard}>
                                <h3 style={styles.aiCardTitle}>Executive Summary</h3>
                                <p style={styles.aiText}>{aiInterpretation.executive_summary}</p>
                            </div>

                            {/* Parallel Trends */}
                            {aiInterpretation.parallel_trends_interpretation && (
                                <div style={styles.aiCard}>
                                    <h3 style={styles.aiCardTitle}>Parallel Trends Assessment</h3>
                                    <p style={styles.aiText}>{aiInterpretation.parallel_trends_interpretation}</p>
                                </div>
                            )}

                            {/* Effect Size */}
                            {aiInterpretation.effect_size_interpretation && (
                                <div style={styles.aiCard}>
                                    <h3 style={styles.aiCardTitle}>Effect Size</h3>
                                    <p style={styles.aiText}>{aiInterpretation.effect_size_interpretation}</p>
                                </div>
                            )}

                            {/* Statistical Interpretation */}
                            {aiInterpretation.statistical_interpretation && (
                                <div style={styles.aiCard}>
                                    <h3 style={styles.aiCardTitle}>Statistical Significance</h3>
                                    <p style={styles.aiText}>{aiInterpretation.statistical_interpretation}</p>
                                </div>
                            )}

                            {/* Limitations */}
                            {aiInterpretation.limitations && aiInterpretation.limitations.length > 0 && (
                                <div style={{...styles.aiCard, backgroundColor: '#fff3cd', border: '1px solid #ffc107'}}>
                                    <h3 style={styles.aiCardTitle}>⚠️ Limitations & Caveats</h3>
                                    <ul style={styles.aiList}>
                                        {aiInterpretation.limitations.map((limit, index) => (
                                            <li key={index} style={styles.aiListItem}>{limit}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Implications */}
                            {aiInterpretation.implications && aiInterpretation.implications.length > 0 && (
                                <div style={{...styles.aiCard, backgroundColor: '#d4edda', border: '1px solid #28a745'}}>
                                    <h3 style={styles.aiCardTitle}>💡 Practical Implications</h3>
                                    <ul style={styles.aiList}>
                                        {aiInterpretation.implications.map((implication, index) => (
                                            <li key={index} style={styles.aiListItem}>{implication}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Next Steps */}
                            {aiInterpretation.next_steps && aiInterpretation.next_steps.length > 0 && (
                                <div style={{...styles.aiCard, backgroundColor: '#e8f5e9', border: '1px solid #4caf50'}}>
                                    <h3 style={styles.aiCardTitle}>🚀 Recommended Next Steps</h3>
                                    <ul style={styles.aiList}>
                                        {aiInterpretation.next_steps.map((step, index) => (
                                            <li key={index} style={styles.aiListItem}>
                                                <span style={styles.stepNumber}>{index + 1}</span>
                                                {step}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Overall Recommendation & Confidence */}
                            {aiInterpretation && aiInterpretation.recommendation && (
                                <div style={{...styles.aiCard, backgroundColor: '#e3f2fd', borderColor: '#2196f3', borderLeft: '4px solid #2196f3'}}>
                                    <h3 style={styles.aiCardTitle}>📋 Bottom Line</h3>
                                    <p style={styles.aiText}>{aiInterpretation.recommendation}</p>
                                    {aiInterpretation.confidence_level && (
                                        <p style={styles.confidenceLevel}>
                                            Analysis Confidence: <strong style={{
                                                color: aiInterpretation.confidence_level === 'high' ? '#28a745' : 
                                                       aiInterpretation.confidence_level === 'medium' ? '#ffc107' : '#dc3545'
                                            }}>{aiInterpretation.confidence_level.toUpperCase()}</strong>
                                        </p>
                                    )}
                                </div>
                            )}
                            </>
                        )}
                        </div>
                    </div>
                </div>
            </div>
            <BottomProgressBar
                currentStep={currentStep}
                steps={steps}
                onPrev={goToPreviousStep}
                onNext={goToNextStep}
                canGoNext={false}
                onStepClick={(stepPath) => navigate(stepPath)}
            />
        </div>
    );
};

export default ResultsPage;

const styles = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '120px', // Extra padding for bottom progress bar
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5'
  },
  mainLayout: {
    display: 'flex',
    gap: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px 10px',
    width: '100%',
    boxSizing: 'border-box' as const,
    alignItems: 'flex-start'
  },
  mainContent: {
    flex: '1 1 0',
    minWidth: 0,
    boxSizing: 'border-box' as const
  },
  
  // Summary Header Section
  summaryHeader: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px 30px',
    marginBottom: '24px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
  },
  summaryHeaderTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#043873',
    textAlign: 'center' as const,
    margin: 0
  },
  detailsToggleBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #4F9CF9',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#4F9CF9',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  statisticalDetailsInline: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '16px 20px',
    marginTop: '16px',
    borderTop: '1px solid #e9ecef'
  },
  summaryCard: {
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '20px 24px',
    borderLeft: '4px solid #4F9CF9',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
  },
  summaryText: {
    fontSize: '18px',
    color: '#212529',
    margin: 0,
    lineHeight: '1.8',
    fontWeight: '500'
  },
  effectBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '14px',
    fontWeight: '600',
    marginLeft: '8px'
  },

  // 2. THE DiD VISUALIZATION SECTION
  visualizationSection: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    marginBottom: '30px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 30px 0',
    textAlign: 'center' as const
  },
  chartContainer: {
    width: '100%',
    overflow: 'hidden'
  },
  chart: {
    width: '100%',
    maxWidth: '100%',
    height: 'auto',
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    border: '1px solid #e9ecef'
  },
  chartTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: '20px',
    textAlign: 'center' as const
  },
  chartArea: {
    display: 'flex',
    height: '250px',
    marginBottom: '20px'
  },
  yAxis: {
    width: '80px',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-between',
    paddingRight: '10px'
  },
  yAxisLabel: {
    fontSize: '12px',
    color: '#212529',
    writingMode: 'vertical-rl' as const,
    transform: 'rotate(180deg)',
    marginBottom: '10px',
    height: '100px',
    display: 'flex',
    alignItems: 'center'
  },
  yAxisTicks: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-between',
    height: '200px'
  },
  yTick: {
    fontSize: '10px',
    color: '#212529',
    textAlign: 'right' as const
  },
  chartContent: {
    flex: 1,
    position: 'relative' as const,
    backgroundColor: '#fafafa',
    borderRadius: '4px',
    border: '1px solid #e9ecef'
  },
  gridLines: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-evenly'
  },
  gridLine: {
    height: '1px',
    backgroundColor: '#e9ecef',
    width: '100%'
  },
  treatmentLine: {
    position: 'absolute' as const,
    top: '20%',
    left: '10%',
    right: '10%',
    height: '2px',
    backgroundColor: '#4F9CF9',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  controlLine: {
    position: 'absolute' as const,
    top: '60%',
    left: '10%',
    right: '10%',
    height: '2px',
    backgroundColor: '#FF6B6B',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  counterfactualLine: {
    position: 'absolute' as const,
    top: '20%',
    left: '50%',
    right: '10%',
    height: '2px',
    backgroundColor: '#4F9CF9',
    borderStyle: 'dashed',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  linePoint: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'inherit',
    border: '2px solid white',
    boxShadow: '0 0 0 1px currentColor'
  },
  treatmentStartLine: {
    position: 'absolute' as const,
    top: '10%',
    bottom: '10%',
    left: '50%',
    width: '2px',
    backgroundColor: '#ffc107',
    zIndex: 10
  },
  treatmentStartLabel: {
    position: 'absolute' as const,
    top: '5%',
    left: '52%',
    fontSize: '10px',
    color: '#ffc107',
    fontWeight: 'bold',
    backgroundColor: 'white',
    padding: '2px 4px',
    borderRadius: '2px'
  },
  effectArrow: {
    position: 'absolute' as const,
    top: '35%',
    right: '15%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center'
  },
  arrowLine: {
    width: '2px',
    height: '20px',
    backgroundColor: '#28a745',
    position: 'relative' as const
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeft: '4px solid transparent',
    borderRight: '4px solid transparent',
    borderTop: '6px solid #28a745',
    marginTop: '-2px'
  },
  effectLabel: {
    fontSize: '10px',
    color: '#28a745',
    fontWeight: 'bold',
    marginTop: '5px',
    backgroundColor: 'white',
    padding: '2px 4px',
    borderRadius: '2px'
  },
  xAxis: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'flex-end',
    paddingTop: '10px'
  },
  xAxisTicks: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '5px'
  },
  xTick: {
    fontSize: '12px',
    color: '#212529',
    fontWeight: 'bold'
  },
  xAxisLabel: {
    fontSize: '12px',
    color: '#212529',
    textAlign: 'center' as const
  },
  chartLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    marginBottom: '15px',
    flexWrap: 'wrap' as const
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: '#212529'
  },
  legendLine: {
    width: '20px',
    height: '3px',
    borderRadius: '2px'
  },
  chartNote: {
    fontSize: '13px',
    color: '#212529',
    fontStyle: 'normal',
    textAlign: 'center' as const,
    lineHeight: '1.5',
    fontWeight: '400'
  },
  parallelTrendsSection: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    marginBottom: '30px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    border: '1px solid #e0e0e0'
  },
  checkBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #e9ecef'
  },
  explanation: {
    fontSize: '16px',
    color: '#555',
    marginBottom: '20px',
    lineHeight: '1.6'
  },
  testResult: {
    marginBottom: '20px'
  },
  parallelPassedBadge: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #c3e6cb',
    fontSize: '16px',
    fontWeight: 'bold'
  },
  parallelFailedBadge: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #f5c6cb',
    fontSize: '16px',
    fontWeight: 'bold'
  },
  parallelModerateBadge: {
    backgroundColor: '#fff3cd',
    color: '#856404',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #ffeaa7',
    fontSize: '16px',
    fontWeight: 'bold'
  },
  warningsBox: {
    backgroundColor: '#fff3cd',
    color: '#856404',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #ffeaa7',
    fontSize: '14px',
    marginTop: '12px'
  },
  explanationsBox: {
    backgroundColor: 'white',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
    marginTop: '16px',
    marginBottom: '12px'
  },
  coefficientsTable: {
    marginTop: '20px',
    backgroundColor: 'white',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e0e0e0'
  },
  infoMessage: {
    backgroundColor: '#d1ecf1',
    color: '#0c5460',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #bee5eb',
    fontSize: '16px',
    fontWeight: 'bold'
  },
  realChartContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    width: '100%'
  },
  realChart: {
    maxWidth: '100%',
    height: 'auto',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  chartPlaceholder: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '2px dashed #dee2e6'
  },

  // 3. THE TRUST & DETAILS SECTION
  trustSection: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    marginBottom: '30px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
  },
  assumptionCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '25px',
    marginBottom: '25px',
    border: '1px solid #e9ecef'
  },
  assumptionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  },
  assumptionTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#212529',
    margin: 0
  },
  passedBadge: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '6px 12px',
    borderRadius: '15px',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  failedBadge: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '6px 12px',
    borderRadius: '15px',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  assumptionText: {
    fontSize: '14px',
    color: '#212529',
    margin: 0,
    lineHeight: '1.5'
  },
  detailsToggle: {
    marginBottom: '20px'
  },
  toggleButton: {
    backgroundColor: 'transparent',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    color: '#212529',
    cursor: 'pointer',
    transition: 'all 0.2s',
    '&:hover': {
      backgroundColor: '#f8f9fa',
      borderColor: '#043873'
    }
  },
  statisticalDetails: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '20px',
    border: '1px solid #e9ecef'
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '15px'
  },
  detailItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e9ecef'
  },
  detailLabel: {
    fontSize: '14px',
    color: '#212529',
    fontWeight: '500'
  },
  detailValue: {
    fontSize: '14px',
    color: '#212529',
    fontWeight: 'bold',
    textAlign: 'right' as const
  },

  // Loading and Error States
  loadingContainer: {
    minHeight: 'calc(100vh - 70px)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5'
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px'
  },
  loadingText: {
    fontSize: '18px',
    color: '#666',
    margin: 0
  },
  message: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 30px 0',
    lineHeight: '1.5',
    textAlign: 'center' as const
  },
  resultsCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    width: '100%',
    textAlign: 'center' as const
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 15px 0'
  },

  // AI INTERPRETATION SECTION
  aiSidebar: {
    flex: '0 0 420px',
    position: 'sticky' as const,
    top: '90px',
    maxHeight: 'calc(100vh - 110px)',
    overflowY: 'auto' as const,
    boxSizing: 'border-box' as const,
    alignSelf: 'flex-start'
  },
  aiSection: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    border: '1px solid #e0e0e0'
  },
  aiCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    border: '1px solid #e9ecef',
    borderLeft: '4px solid #4F9CF9'
  },
  aiCardTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 12px 0'
  },
  aiText: {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#333',
    margin: 0
  },
  aiList: {
    margin: '10px 0',
    paddingLeft: '20px'
  },
  aiListItem: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#333',
    marginBottom: '6px'
  },
  aiLoading: {
    textAlign: 'center' as const,
    padding: '40px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #4F9CF9',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px'
  },
  aiError: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #f5c6cb'
  },
  aiErrorNote: {
    fontSize: '14px',
    marginTop: '10px',
    opacity: 0.8
  },
  confidenceLevel: {
    marginTop: '15px',
    fontSize: '14px',
    color: '#666',
    fontStyle: 'italic'
  },
  aiPrompt: {
    textAlign: 'center' as const,
    padding: '40px'
  },
  aiButton: {
    backgroundColor: '#4F9CF9',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '20px',
    transition: 'background-color 0.2s'
  },

  // Download Button Styles
  downloadButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap' as const,
    gap: '15px'
  },
  chartSubtitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#212529',
    margin: 0
  },

  // Code Section Styles
  codeSection: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '30px 40px',
    marginBottom: '30px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e9ecef'
  },
  codeSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  codeToggleButton: {
    backgroundColor: '#f8f9fa',
    color: '#212529',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  codeContent: {
    marginTop: '20px'
  },
  codeDescription: {
    fontSize: '15px',
    color: '#666',
    marginBottom: '20px',
    lineHeight: '1.6'
  },
  languageTabs: {
    display: 'flex',
    gap: '10px',
    marginBottom: '15px'
  },
  languageTab: {
    backgroundColor: '#f8f9fa',
    color: '#212529',
    border: '2px solid #e9ecef',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  languageTabActive: {
    backgroundColor: '#043873',
    color: 'white',
    borderColor: '#043873'
  },
  codeBlock: {
    backgroundColor: '#1e1e1e',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
  },
  codeBlockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    backgroundColor: '#2d2d2d',
    borderBottom: '1px solid #3d3d3d'
  },
  codeBlockTitle: {
    color: '#9cdcfe',
    fontSize: '13px',
    fontWeight: '600'
  },
  copyButton: {
    backgroundColor: '#4F9CF9',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  codeText: {
    margin: 0,
    padding: '20px',
    fontSize: '13px',
    lineHeight: '1.6',
    color: '#d4d4d4',
    overflow: 'auto',
    maxHeight: '500px',
    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace"
  },

  // Effect Breakdown Section Styles
  effectBreakdownSection: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    marginBottom: '30px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
  },
  effectCardsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginBottom: '30px'
  },
  effectCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '25px',
    border: '2px solid #e9ecef',
    transition: 'all 0.2s ease'
  },
  effectCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  effectCardLabel: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#212529'
  },
  periodBadge: {
    backgroundColor: '#6c757d',
    color: 'white',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase' as const
  },
  effectComparison: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  },
  groupValue: {
    textAlign: 'center' as const,
    flex: 1
  },
  groupLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#212529',
    marginBottom: '5px'
  },
  groupNumber: {
    fontSize: '28px',
    fontWeight: 'bold'
  },
  vsIndicator: {
    fontSize: '14px',
    color: '#adb5bd',
    fontWeight: 'bold',
    padding: '0 15px'
  },
  effectDiff: {
    textAlign: 'center' as const,
    fontSize: '14px',
    color: '#212529',
    padding: '10px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e9ecef'
  },
  effectBarSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '25px',
    border: '1px solid #e9ecef'
  },
  effectBarTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#212529',
    margin: '0 0 20px 0'
  },
  effectBarsContainer: {
    marginBottom: '20px'
  },
  effectBarGroup: {
    marginBottom: '15px'
  },
  barLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    fontSize: '14px'
  },
  changeValue: {
    fontWeight: 'bold',
    fontSize: '15px'
  },
  barContainer: {
    backgroundColor: '#e9ecef',
    borderRadius: '8px',
    height: '20px',
    overflow: 'hidden'
  },
  bar: {
    height: '100%',
    borderRadius: '8px',
    transition: 'width 0.5s ease'
  },
  effectExplanation: {
    backgroundColor: '#e3f2fd',
    borderRadius: '8px',
    padding: '15px 20px',
    borderLeft: '4px solid #2196f3'
  },

  // Period Selector Styles
  periodSelectorContainer: {
    marginBottom: '25px'
  },
  periodSelectorLabel: {
    display: 'block',
    fontSize: '15px',
    color: '#212529',
    marginBottom: '12px',
    fontWeight: '500'
  },
  periodTabs: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px'
  },
  periodTab: {
    padding: '10px 16px',
    border: '2px solid #e9ecef',
    borderRadius: '8px',
    backgroundColor: '#f8f9fa',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    minWidth: '70px'
  },
  periodTabActive: {
    backgroundColor: '#043873',
    color: 'white',
    borderColor: '#043873'
  },
  periodTabPre: {
    backgroundColor: '#f1f3f4',
    borderColor: '#d1d5db',
    color: '#6b7280'
  },
  periodTabLabel: {
    fontSize: '14px',
    fontWeight: '600'
  },
  periodTabBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '10px',
    backgroundColor: 'rgba(40, 167, 69, 0.2)',
    color: '#28a745'
  },
  periodDetailContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '25px',
    marginBottom: '25px',
    border: '1px solid #e9ecef'
  },
  periodHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap' as const,
    gap: '10px'
  },
  periodTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    margin: 0
  },
  periodTypeBadge: {
    padding: '6px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'white'
  },
  periodValuesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '15px',
    marginBottom: '20px'
  },
  periodValueCard: {
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '18px',
    border: '2px solid #e9ecef',
    textAlign: 'center' as const
  },
  periodValueHeader: {
    fontSize: '13px',
    color: '#212529',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px'
  },
  groupDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block'
  },
  periodValueNumber: {
    fontSize: '32px',
    fontWeight: 'bold'
  },
  counterfactualNote: {
    fontSize: '11px',
    color: '#9CA3AF',
    marginTop: '4px'
  },
  periodEffectCard: {
    backgroundColor: '#d4edda',
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center' as const,
    border: '2px solid #28a745'
  },
  periodEffectHeader: {
    marginBottom: '10px'
  },
  periodEffectLabel: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#155724'
  },
  periodEffectValue: {
    fontSize: '42px',
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: '8px'
  },
  periodEffectFormula: {
    fontSize: '13px',
    color: '#155724',
    fontFamily: 'monospace'
  },
  preTreatmentNote: {
    backgroundColor: '#f1f3f4',
    borderRadius: '8px',
    padding: '15px 20px',
    color: '#212529',
    fontSize: '14px',
    lineHeight: '1.6'
  },
  allEffectsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '25px',
    border: '1px solid #e9ecef'
  },
  allEffectsTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px',
    margin: '0 0 20px 0'
  },
  periodTabTransition: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffc107',
    color: '#856404'
  },
  transitionWarning: {
    backgroundColor: '#fff3cd',
    borderRadius: '8px',
    padding: '15px 20px',
    marginBottom: '20px',
    border: '1px solid #ffc107',
    color: '#856404'
  },
  methodologyNote: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '15px 20px',
    marginTop: '20px',
    fontSize: '13px',
    color: '#212529',
    lineHeight: '1.6',
    borderLeft: '4px solid #6c757d'
  },
  aiSectionHeader: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginBottom: '20px'
  },
  getAiButton: {
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
    transition: 'all 0.2s ease',
    width: '100%'
  },
  aiPromptIcon: {
    fontSize: '36px',
    marginBottom: '12px'
  },
  aiPromptTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 8px 0'
  },
  aiPromptText: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.6',
    margin: '0 auto'
  },
  stepNumber: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    backgroundColor: '#4caf50',
    color: 'white',
    borderRadius: '50%',
    fontSize: '12px',
    fontWeight: 'bold',
    marginRight: '10px',
    flexShrink: 0
  }
};