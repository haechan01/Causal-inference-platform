import React, { useState, useEffect } from 'react';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';

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
    console.log("=== RESULTS PAGE COMPONENT LOADED ===");
    const { currentStep, steps, goToPreviousStep, goToNextStep } = useProgressStep();
    const [results, setResults] = useState<DiDResults | null>(null);
    const [loading, setLoading] = useState(true);
    const [showDetails, setShowDetails] = useState(false);

    // Helper function to safely format numbers, handling null/undefined
    const formatNumber = (value: number | null | undefined, decimals: number = 2): string => {
        if (value === null || value === undefined || isNaN(value)) {
            return 'N/A';
        }
        return value.toFixed(decimals);
    };

    useEffect(() => {
        // Load results from localStorage
        console.log("=== LOADING RESULTS FROM LOCALSTORAGE ===");
        console.log("Current time:", new Date().toLocaleTimeString());
        const storedResults = localStorage.getItem('didAnalysisResults');
        console.log("Raw stored results (first 500 chars):", storedResults ? storedResults.substring(0, 500) : 'null');
        console.log("Stored results type:", typeof storedResults);
        console.log("Stored results length:", storedResults ? storedResults.length : 'null');
        
        if (storedResults) {
            try {
                const parsedResults = JSON.parse(storedResults);
                console.log("Parsed results:", parsedResults);
                console.log("Parsed results type:", typeof parsedResults);
                console.log("Parsed results keys:", Object.keys(parsedResults));
                setResults(parsedResults);
            } catch (error) {
                console.error('Error parsing stored results:', error);
                console.error('Raw stored results that failed to parse:', storedResults.substring(0, 200) + '...');
            }
        } else {
            console.log("No stored results found in localStorage");
        }
        setLoading(false);
    }, []);

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

    // Debug the results structure
    console.log("ResultsPage - Full results object:", results);
    console.log("ResultsPage - results.results:", results?.results);
    console.log("ResultsPage - results.parameters:", results?.parameters);
    console.log("ResultsPage - results keys:", results ? Object.keys(results) : 'null');
    console.log("ResultsPage - Condition check:", {
        hasResults: !!results,
        hasResultsResults: !!results?.results,
        hasParameters: !!results?.parameters,
        loading: loading
    });

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
                            <p style={styles.message}>No analysisss results were found. Please run an analysis first.</p>
                            <p style={styles.message}>Debug: hasResults={!!results}, hasResultsResults={!!results?.results}, hasParameters={!!results?.parameters}</p>
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

    // Check parallel trends assumption (simplified)
    const checkParallelTrends = () => {
        // Add null checks for safety
        if (!results?.results?.statistics) {
            return false; // Default to failed if no statistics available
        }
        
        const stats = results.results.statistics;
        const treated_pre = stats.outcome_mean_treated_pre || 0;
        const treated_post = stats.outcome_mean_treated_post || 0;
        const control_pre = stats.outcome_mean_control_pre || 0;
        const control_post = stats.outcome_mean_control_post || 0;
        
        // Calculate pre-treatment difference
        const pre_diff = Math.abs(treated_pre - control_pre);
        const post_diff = Math.abs(treated_post - control_post);
        
        // Simple heuristic: if pre-treatment difference is small relative to post-treatment difference
        const ratio = pre_diff / (post_diff + 0.001); // Avoid division by zero
        
        return ratio < 0.5; // Passed if pre-treatment difference is less than half of post-treatment difference
    };

    const parallelTrendsPassed = checkParallelTrends();

    return (
        <div>
            <Navbar />
            <div style={styles.contentContainer}>
                <div style={styles.mainContent}>
                    
                    {/* 1. THE KEY FINDING */}
                    <div style={styles.heroSection}>
                        <h1 style={styles.heroTitle}>Analysis Results</h1>
                        
                        {/* AI-Powered Summary */}
                        <div style={styles.aiSummary}>
                            <div style={styles.aiIcon}>🤖</div>
                            <p style={styles.aiText}>{generateAISummary()}</p>
                        </div>

                        {/* Big Number Card */}
                        <div style={styles.bigNumberCard}>
                            <div style={styles.metricLabel}>Causal Effect</div>
                            <div style={styles.bigNumber}>
                                {(results.results?.did_estimate || 0) > 0 ? '+' : ''}{formatNumber(results.results?.did_estimate, 0)}
                            </div>
                            <div style={styles.significanceBadge}>
                                {(results.results?.is_significant || false) ? (
                                    <span style={styles.significantBadge}>
                                        ✓ Statistically Significant (p &lt; 0.05)
                                    </span>
                                ) : (
                                    <span style={styles.notSignificantBadge}>
                                        ✗ Not Statistically Significant
                                    </span>
                                )}
                            </div>
                        </div>
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
              <h3>Pre-Treatment Trends</h3>
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
            <h2 style={styles.sectionTitle}>What Happened Over Time</h2>
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

                    {/* 3. THE TRUST & DETAILS SECTION */}
                    <div style={styles.trustSection}>
                        <h2 style={styles.sectionTitle}>Analysis Validity</h2>
                        

                        {/* Statistical Summary Toggle */}
                        <div style={styles.detailsToggle}>
                            <button 
                                style={styles.toggleButton}
                                onClick={() => setShowDetails(!showDetails)}
                            >
                                {showDetails ? '▼' : '▶'} View Statistical Details
                            </button>
                        </div>

                        {showDetails && (
                            <div style={styles.statisticalDetails}>
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
                                        <span style={styles.detailLabel}>Control Variables Used:</span>
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
                                        <span style={styles.detailLabel}>Treated Units:</span>
                                        <span style={styles.detailValue}>{results.results?.statistics?.treated_units || 0}</span>
                                    </div>
                                    <div style={styles.detailItem}>
                                        <span style={styles.detailLabel}>Control Units:</span>
                                        <span style={styles.detailValue}>{results.results?.statistics?.control_units || 0}</span>
                                    </div>
                                </div>
                            </div>
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
  
  // 1. THE KEY FINDING SECTION
  heroSection: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    marginBottom: '30px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as const
  },
  heroTitle: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 30px 0'
  },
  aiSummary: {
    backgroundColor: '#e3f2fd',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '30px',
    borderLeft: '4px solid #2196f3',
    display: 'flex',
    alignItems: 'center',
    textAlign: 'left' as const
  },
  aiIcon: {
    fontSize: '24px',
    marginRight: '15px'
  },
  aiText: {
    fontSize: '18px',
    color: '#333',
    margin: 0,
    lineHeight: '1.6',
    flex: 1
  },
  bigNumberCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '30px',
    border: '2px solid #e9ecef',
    display: 'inline-block',
    minWidth: '300px'
  },
  metricLabel: {
    fontSize: '16px',
    color: '#6c757d',
    marginBottom: '10px',
    fontWeight: '500'
  },
  bigNumber: {
    fontSize: '48px',
    fontWeight: 'bold',
    color: '#043873',
    marginBottom: '15px'
  },
  significanceBadge: {
    marginTop: '10px'
  },
  significantBadge: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: 'bold'
  },
  notSignificantBadge: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: 'bold'
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
  }
};