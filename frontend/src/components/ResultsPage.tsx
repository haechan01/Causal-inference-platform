import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import { aiService, ResultsInterpretation } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import { projectStateService } from '../services/projectStateService';

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
    parallel_trends_test: {
      passed: boolean;
      p_value: number;
      visual_chart: string;
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
                        // Create a unique key for this analysis based on parameters
                        const currentAnalysisKey = `${loadedResults.dataset_id}_${loadedResults.parameters?.outcome}_${loadedResults.parameters?.treatment_start}`;
                        // Check if the interpretation matches the current analysis
                        if (parsed.analysisKey === currentAnalysisKey) {
                            setAiInterpretation(parsed.interpretation);
                        }
                    }
                } catch (error) {
                    console.error('Error loading stored AI interpretation:', error);
                }
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
            
            // Store the interpretation in localStorage with a key tied to this analysis
            try {
                const analysisKey = `${results.dataset_id}_${results.parameters?.outcome}_${results.parameters?.treatment_start}`;
                localStorage.setItem('aiInterpretation', JSON.stringify({
                    analysisKey: analysisKey,
                    interpretation: interpretation,
                    timestamp: new Date().toISOString()
                }));
            } catch (storageError) {
                console.error('Error saving AI interpretation to localStorage:', storageError);
            }
            } catch (error: any) {
                const errorMessage = error.response?.data?.error || error.message || 'Failed to load AI interpretation';
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

    // Show loading state while data is being loaded
    if (loading) {
        return (
            <div>
                <Navbar />
                <div style={styles.contentContainer}>
                    <div style={styles.mainContent}>
                        <div style={styles.resultsCard}>
                            <h2 style={styles.title}>Loading Results...</h2>
                            <p style={styles.message}>Please wait while we load your analysis results.</p>
                        </div>
                    </div>
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
        
        const effect = Math.abs(results.results.did_estimate || 0);
        const direction = results.results.interpretation?.effect_direction || 'unknown';
        const outcome = results.parameters.outcome || 'outcome';
        const treatment = results.parameters.treatment || 'treatment';
        const significance = results.results.is_significant || false;
        
        if (significance) {
            return `Our analysis found that ${treatment} caused a statistically significant ${direction} effect on ${outcome} of approximately ${formatNumber(effect, 0)} units.`;
        } else {
            return `Our analysis found that ${treatment} had a ${direction} effect on ${outcome} of approximately ${formatNumber(effect, 0)} units, but this effect was not statistically significant.`;
        }
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
                <div style={styles.mainContent}>
                    
                    {/* Summary Header */}
                    <div style={styles.summaryHeader}>
                        <div style={styles.summaryHeaderTop}>
                            <h1 style={styles.pageTitle}>Analysis Results</h1>
                            <button 
                                style={styles.detailsToggleBtn}
                                onClick={() => setShowDetails(!showDetails)}
                            >
                                {showDetails ? '▼' : '▶'} Statistical Details
                            </button>
                        </div>
                        <div style={styles.summaryCard}>
                            <p style={styles.summaryText}>
                                {generateAISummary()}
                                {' '}
                                <span style={{
                                    ...styles.effectBadge,
                                    backgroundColor: (results.results?.is_significant || false) ? '#d4edda' : '#f8d7da',
                                    color: (results.results?.is_significant || false) ? '#155724' : '#721c24'
                                }}>
                                    Effect: {(results.results?.did_estimate || 0) > 0 ? '+' : ''}{formatNumber(results.results?.did_estimate, 2)}
                                    {(results.results?.is_significant || false) ? ' (significant)' : ' (not significant)'}
                                </span>
                            </p>
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
                    </div>

        {/* NEW: Parallel Trends Assessment Section */}
        <div style={styles.parallelTrendsSection}>
          <h2 style={styles.sectionTitle}>Parallel Trends Check</h2>
          <p style={styles.explanation}>
            For reliable results, treated and control groups should follow similar trends 
            before treatment. Here&apos;s what we found:
          </p>
          
          {/* Statistical Test Result */}
          <div style={styles.testResult}>
            {(results.results as any)?.parallel_trends_test?.p_value !== null && (results.results as any)?.parallel_trends_test?.p_value !== undefined ? (
              (results.results as any)?.parallel_trends_test?.passed ? (
                <div style={styles.parallelPassedBadge}>
                  ✓ Trends look parallel (p = {formatNumber((results.results as any).parallel_trends_test.p_value, 3)})
                </div>
              ) : (
                <div style={styles.parallelFailedBadge}>
                  ⚠ Trends may differ (p = {formatNumber((results.results as any).parallel_trends_test.p_value, 3)})
                  <p>Consider refining your control group for more reliable results.</p>
                </div>
              )
            ) : (
              <div style={styles.infoMessage}>
                ℹ️ Insufficient pre-treatment data to perform parallel trends test.
                <p>The analysis has been completed, but we couldn&apos;t statistically verify the parallel trends assumption due to limited pre-treatment observations.</p>
              </div>
            )}
          </div>
          
          {/* Visual Inspection Chart */}
          {(results.results as any)?.parallel_trends_test?.visual_chart && (
            <div style={styles.chartContainer}>
              <div style={styles.chartHeader}>
                <h3 style={styles.chartSubtitle}>Pre-Treatment Trends</h3>
                <button
                  onClick={() => downloadChartAsPNG(
                    (results.results as any).parallel_trends_test.visual_chart,
                    'parallel_trends_chart.png'
                  )}
                  style={styles.downloadButton}
                  title="Download chart as PNG"
                >
                  ⬇️ Download PNG
                </button>
              </div>
              <img 
                src={`data:image/png;base64,${(results.results as any).parallel_trends_test.visual_chart}`} 
                alt="Pre-treatment trends comparison" 
                style={styles.chart} 
              />
              <p style={styles.chartNote}>
                The lines should be roughly parallel before the treatment starts. 
                If they diverge, your results may be less reliable.
              </p>
            </div>
          )}
        </div>

        {/* 2. THE DiD VISUALIZATION */}
        <div style={styles.visualizationSection}>
            <div style={styles.chartHeader}>
            <h2 style={styles.sectionTitle}>What Happened Over Time</h2>
                {(results.results as any)?.chart && (
                    <button
                        onClick={() => downloadChartAsPNG(
                            (results.results as any).chart,
                            'did_analysis_chart.png'
                        )}
                        style={styles.downloadButton}
                        title="Download chart as PNG"
                    >
                        ⬇️ Download PNG
                    </button>
                )}
            </div>
            <div style={styles.chartContainer}>
                {(results.results as any)?.chart ? (
                    <div style={styles.realChartContainer}>
                        <img 
                            src={`data:image/png;base64,${(results.results as any).chart}`} 
                            alt="Difference-in-Differences Analysis Chart"
                            style={styles.realChart}
                        />
                        <div style={styles.chartNote}>
                            📊 This chart shows the actual data from your analysis. The blue line represents the treatment group, 
                            the red line represents the control group, and the dashed line shows what would have happened 
                            to the treatment group without the intervention (counterfactual).
                        </div>
                    </div>
                ) : (
                    <div style={styles.chartPlaceholder}>
                        <div style={styles.chartTitle}>Chart Not Available</div>
                        <p style={styles.message}>Unable to generate chart for this analysis.</p>
                    </div>
                )}
            </div>
        </div>

        {/* EFFECT SIZE BREAKDOWN - Period by Period */}
        <div style={styles.effectBreakdownSection}>
            <h2 style={styles.sectionTitle}>📊 Effect Size by Period</h2>
            
            {/* Period Selector */}
            {results.results?.period_statistics && results.results.period_statistics.length > 0 ? (
                <>
                <div style={styles.periodSelectorContainer}>
                    <label style={styles.periodSelectorLabel}>Select a period to see effect size:</label>
                    <div style={styles.periodTabs}>
                        {results.results.period_statistics.map((period, index) => (
                            <button
                                key={index}
                                onClick={() => setSelectedPeriod(period.period)}
                                style={{
                                    ...styles.periodTab,
                                    ...(selectedPeriod === period.period || (selectedPeriod === null && period.is_post_treatment && !period.is_treatment_start && 
                                        results.results?.period_statistics?.filter(p => p.is_post_treatment && !p.is_treatment_start)[0]?.period === period.period) 
                                        ? styles.periodTabActive : {}),
                                    ...(period.is_post_treatment ? {} : styles.periodTabPre),
                                    ...(period.is_treatment_start ? styles.periodTabTransition : {})
                                }}
                            >
                                <span style={styles.periodTabLabel}>{period.period}</span>
                                {period.is_treatment_start ? (
                                    <span style={{...styles.periodTabBadge, backgroundColor: 'rgba(255, 193, 7, 0.3)', color: '#856404'}}>Start</span>
                                ) : period.is_post_treatment ? (
                                    <span style={styles.periodTabBadge}>Post</span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Period Detail Card */}
                {(() => {
                    const periodStats = results.results?.period_statistics || [];
                    // Default to first post-treatment period that's not the transition year
                    const postTreatmentPeriods = periodStats.filter(p => p.is_post_treatment && !p.is_treatment_start);
                    const currentPeriod = selectedPeriod 
                        ? periodStats.find(p => p.period === selectedPeriod) 
                        : postTreatmentPeriods[0];
                    
                    if (!currentPeriod) return null;
                    
                    return (
                        <div style={styles.periodDetailContainer}>
                            {/* Period Header */}
                            <div style={styles.periodHeader}>
                                <h3 style={styles.periodTitle}>
                                    {currentPeriod.is_treatment_start 
                                        ? `⚡ Treatment Start: ${currentPeriod.period}`
                                        : currentPeriod.is_post_treatment 
                                            ? `📅 Period: ${currentPeriod.period}` 
                                            : `📅 Pre-Treatment: ${currentPeriod.period}`}
                                </h3>
                                <span style={{
                                    ...styles.periodTypeBadge,
                                    backgroundColor: currentPeriod.is_treatment_start 
                                        ? '#ffc107' 
                                        : currentPeriod.is_post_treatment ? '#28a745' : '#6c757d'
                                }}>
                                    {currentPeriod.is_treatment_start 
                                        ? 'Transition Year' 
                                        : currentPeriod.is_post_treatment ? 'After Treatment' : 'Before Treatment'}
                                </span>
                            </div>

                            {/* Transition Year Warning */}
                            {currentPeriod.is_treatment_start && (
                                <div style={styles.transitionWarning}>
                                    <p><strong>⚠️ Transition Year</strong></p>
                                    <p>This is the year when treatment began. Effect sizes are not calculated for the treatment start year because:</p>
                                    <ul>
                                        <li>Treatment may not be fully implemented</li>
                                        <li>Effects may be partial or delayed</li>
                                        <li>Including it could bias the estimates</li>
                                    </ul>
                                </div>
                            )}

                            {/* Values Comparison */}
                            <div style={styles.periodValuesGrid}>
                                <div style={styles.periodValueCard}>
                                    <div style={styles.periodValueHeader}>
                                        <span style={{...styles.groupDot, backgroundColor: '#4F9CF9'}}></span>
                                        Treatment Group
                                    </div>
                                    <div style={{...styles.periodValueNumber, color: '#4F9CF9'}}>
                                        {formatNumber(currentPeriod.treatment_mean, 2)}
                                    </div>
                                </div>
                                
                                <div style={styles.periodValueCard}>
                                    <div style={styles.periodValueHeader}>
                                        <span style={{...styles.groupDot, backgroundColor: '#FF6B6B'}}></span>
                                        Control Group
                                    </div>
                                    <div style={{...styles.periodValueNumber, color: '#FF6B6B'}}>
                                        {formatNumber(currentPeriod.control_mean, 2)}
                                    </div>
                                </div>

                                {currentPeriod.is_post_treatment && !currentPeriod.is_treatment_start && currentPeriod.counterfactual && (
                                    <div style={{...styles.periodValueCard, borderStyle: 'dashed'}}>
                                        <div style={styles.periodValueHeader}>
                                            <span style={{...styles.groupDot, backgroundColor: '#9CA3AF'}}></span>
                                            Counterfactual
                                        </div>
                                        <div style={{...styles.periodValueNumber, color: '#9CA3AF'}}>
                                            {formatNumber(currentPeriod.counterfactual, 2)}
                                        </div>
                                        <div style={styles.counterfactualNote}>
                                            = Pre-treatment mean + Control's change from baseline
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Effect Size for this Period */}
                            {currentPeriod.is_post_treatment && !currentPeriod.is_treatment_start && currentPeriod.period_effect !== null && (
                                <div style={styles.periodEffectCard}>
                                    <div style={styles.periodEffectHeader}>
                                        <span style={styles.periodEffectLabel}>🎯 Causal Effect in {currentPeriod.period}</span>
                                    </div>
                                    <div style={styles.periodEffectValue}>
                                        {currentPeriod.period_effect >= 0 ? '+' : ''}
                                        {formatNumber(currentPeriod.period_effect, 2)}
                                    </div>
                                    <div style={styles.periodEffectFormula}>
                                        = Actual ({formatNumber(currentPeriod.treatment_mean, 2)}) − Counterfactual ({formatNumber(currentPeriod.counterfactual, 2)})
                                    </div>
                                </div>
                            )}

                            {!currentPeriod.is_post_treatment && (
                                <div style={styles.preTreatmentNote}>
                                    <p>📋 This is a <strong>pre-treatment period</strong>. Effect sizes are only calculated for post-treatment periods (excluding the treatment start year).</p>
                                    <p>Treatment: {formatNumber(currentPeriod.treatment_mean, 2)} | Control: {formatNumber(currentPeriod.control_mean, 2)} | Diff: {formatNumber((currentPeriod.treatment_mean || 0) - (currentPeriod.control_mean || 0), 2)}</p>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* All Post-Treatment Effects Summary */}
                {(() => {
                    // Filter to post-treatment periods with effects, excluding the treatment start year
                    const postPeriods = (results.results?.period_statistics || []).filter(
                        p => p.is_post_treatment && !p.is_treatment_start && p.period_effect !== null
                    );
                    if (postPeriods.length === 0) return null;
                    
                    const maxEffect = Math.max(...postPeriods.map(p => Math.abs(p.period_effect || 0)), 0.1);
                    
                    return (
                        <div style={styles.allEffectsContainer}>
                            <h3 style={styles.allEffectsTitle}>📈 Causal Effect by Year (Excluding Treatment Start Year)</h3>
                            <div style={styles.effectBarsContainer}>
                                {postPeriods.map((period, index) => (
                                    <div key={index} style={styles.effectBarGroup}>
                                        <div style={styles.barLabel}>
                                            <span style={{fontWeight: 'bold', color: '#333'}}>{period.period}</span>
                                            <span style={{
                                                ...styles.changeValue, 
                                                color: (period.period_effect || 0) >= 0 ? '#28a745' : '#dc3545'
                                            }}>
                                                {(period.period_effect || 0) >= 0 ? '+' : ''}
                                                {formatNumber(period.period_effect, 2)}
                                            </span>
                                        </div>
                                        <div style={styles.barContainer}>
                                            <div style={{
                                                ...styles.bar,
                                                width: `${Math.min(100, Math.abs((period.period_effect || 0) / maxEffect * 100))}%`,
                                                backgroundColor: (period.period_effect || 0) >= 0 ? '#28a745' : '#dc3545'
                                            }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Overall DiD */}
                            <div style={{...styles.effectBarGroup, marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e9ecef'}}>
                                <div style={styles.barLabel}>
                                    <span style={{fontWeight: 'bold', color: '#043873'}}>📊 Overall Average (DiD Estimate)</span>
                                    <span style={{...styles.changeValue, fontSize: '18px', color: '#043873'}}>
                                        {(results.results?.did_estimate || 0) >= 0 ? '+' : ''}
                                        {formatNumber(results.results?.did_estimate, 2)}
                                    </span>
                                </div>
                            </div>
                            
                            <div style={styles.methodologyNote}>
                                <p><strong>Methodology:</strong> Each period's effect = Actual treatment value − Counterfactual</p>
                                <p>Counterfactual = Pre-treatment treatment mean + (Current control − Pre-treatment control mean)</p>
                                <p>This assumes parallel trends: without intervention, treatment would follow control's trajectory.</p>
                            </div>
                        </div>
                    );
                })()}
                </>
            ) : (
                /* Fallback to aggregate display if no period data */
                <div style={styles.effectCardsContainer}>
                    <div style={styles.effectCard}>
                        <div style={styles.effectCardHeader}>
                            <span style={styles.effectCardLabel}>Pre-Treatment Average</span>
                            <span style={styles.periodBadge}>Baseline</span>
                        </div>
                        <div style={styles.effectComparison}>
                            <div style={styles.groupValue}>
                                <span style={styles.groupLabel}>Treatment</span>
                                <span style={{...styles.groupNumber, color: '#4F9CF9'}}>
                                    {formatNumber(results.results?.statistics?.outcome_mean_treated_pre, 1)}
                                </span>
                            </div>
                            <div style={styles.vsIndicator}>vs</div>
                            <div style={styles.groupValue}>
                                <span style={styles.groupLabel}>Control</span>
                                <span style={{...styles.groupNumber, color: '#FF6B6B'}}>
                                    {formatNumber(results.results?.statistics?.outcome_mean_control_pre, 1)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div style={{...styles.effectCard, borderColor: '#28a745'}}>
                        <div style={styles.effectCardHeader}>
                            <span style={styles.effectCardLabel}>Post-Treatment Average</span>
                            <span style={{...styles.periodBadge, backgroundColor: '#28a745'}}>After</span>
                        </div>
                        <div style={styles.effectComparison}>
                            <div style={styles.groupValue}>
                                <span style={styles.groupLabel}>Treatment</span>
                                <span style={{...styles.groupNumber, color: '#4F9CF9'}}>
                                    {formatNumber(results.results?.statistics?.outcome_mean_treated_post, 1)}
                                </span>
                            </div>
                            <div style={styles.vsIndicator}>vs</div>
                            <div style={styles.groupValue}>
                                <span style={styles.groupLabel}>Control</span>
                                <span style={{...styles.groupNumber, color: '#FF6B6B'}}>
                                    {formatNumber(results.results?.statistics?.outcome_mean_control_post, 1)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* CODE SECTION - Reproducible Analysis */}
        <div style={styles.codeSection}>
            <div style={styles.codeSectionHeader}>
                <h2 style={styles.sectionTitle}>📝 Reproduce This Analysis</h2>
                <button
                    onClick={() => setShowCode(!showCode)}
                    style={styles.codeToggleButton}
                >
                    {showCode ? '▼ Hide Code' : '▶ Show Code'}
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

                    {/* AI INTERPRETATION SECTION */}
                    <div style={styles.aiSection}>
                        <div style={styles.aiSectionHeader}>
                            <h2 style={styles.sectionTitle}>🤖 AI-Powered Interpretation</h2>
                            {!aiInterpretation && !loadingAI && (
                                <button 
                                    onClick={loadAIInterpretation}
                                    style={styles.getAiButton}
                                    disabled={loadingAI}
                                >
                                    ✨ Get AI Recommendations
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
                                <button 
                                    onClick={() => {
                                        setAiError(null);
                                        loadAIInterpretation();
                                    }}
                                    style={{...styles.aiButton, marginTop: '10px', backgroundColor: '#6c757d'}}
                                >
                                    Try Again
                                </button>
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
                                <div style={{...styles.aiCard, backgroundColor: '#fff3cd', borderColor: '#ffc107'}}>
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
                                <div style={{...styles.aiCard, backgroundColor: '#d4edda', borderColor: '#28a745'}}>
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
                                <div style={{...styles.aiCard, backgroundColor: '#e8f5e9', borderColor: '#4caf50'}}>
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
                            {aiInterpretation.recommendation && (
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
            <BottomProgressBar
                currentStep={currentStep}
                steps={steps}
                onPrev={goToPreviousStep}
                onNext={goToNextStep}
                canGoNext={true}
                onStepClick={(path) => navigate(path, { state: { projectId, datasetId } })}
            />
        </div>
    );
};

export default ResultsPage;

const styles = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '80px',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5'
  },
  mainContent: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '20px',
    width: '100%',
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
    margin: 0
  },
  detailsToggleBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    color: '#6c757d',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
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
    padding: '16px 20px',
    borderLeft: '4px solid #4F9CF9'
  },
  summaryText: {
    fontSize: '16px',
    color: '#374151',
    margin: 0,
    lineHeight: '1.6'
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
    width: '100%'
  },
  chart: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    border: '1px solid #e9ecef'
  },
  chartTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#495057',
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
    color: '#6c757d',
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
    color: '#6c757d',
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
    color: '#6c757d',
    fontWeight: 'bold'
  },
  xAxisLabel: {
    fontSize: '12px',
    color: '#6c757d',
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
    color: '#495057'
  },
  legendLine: {
    width: '20px',
    height: '3px',
    borderRadius: '2px'
  },
  chartNote: {
    fontSize: '12px',
    color: '#6c757d',
    fontStyle: 'italic',
    textAlign: 'center' as const,
    lineHeight: '1.4'
  },
  parallelTrendsSection: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    marginBottom: '30px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    border: '1px solid #e0e0e0'
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
    color: '#495057',
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
    color: '#6c757d',
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
    color: '#495057',
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
    color: '#6c757d',
    fontWeight: '500'
  },
  detailValue: {
    fontSize: '14px',
    color: '#495057',
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
  aiSection: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    marginBottom: '30px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    border: '2px solid #4F9CF9'
  },
  aiCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '25px',
    marginBottom: '20px',
    border: '1px solid #e9ecef',
    borderLeft: '4px solid #4F9CF9'
  },
  aiCardTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 15px 0'
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
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#333',
    marginBottom: '8px'
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
    color: '#495057',
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
    color: '#495057',
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
    color: '#495057',
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
    color: '#495057'
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
    color: '#6c757d',
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
    color: '#495057',
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
    color: '#495057',
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
    color: '#495057',
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
    color: '#6c757d',
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
    color: '#495057',
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
    color: '#6c757d',
    lineHeight: '1.6',
    borderLeft: '4px solid #6c757d'
  },
  aiSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap' as const,
    gap: '15px'
  },
  getAiButton: {
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    padding: '14px 28px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
    transition: 'all 0.2s ease'
  },
  aiPromptIcon: {
    fontSize: '48px',
    marginBottom: '15px'
  },
  aiPromptTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0'
  },
  aiPromptText: {
    fontSize: '15px',
    color: '#666',
    lineHeight: '1.6',
    maxWidth: '500px',
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