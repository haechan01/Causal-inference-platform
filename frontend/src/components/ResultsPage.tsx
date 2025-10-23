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
    unit: string;
    controls: string[];
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
  };
}

const ResultsPage: React.FC = () => {
    const { currentStep, steps, goToPreviousStep, goToNextStep } = useProgressStep();
    const [results, setResults] = useState<DiDResults | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Load results from localStorage
        const storedResults = localStorage.getItem('didAnalysisResults');
        if (storedResults) {
            try {
                setResults(JSON.parse(storedResults));
            } catch (error) {
                console.error('Error parsing stored results:', error);
            }
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

    if (!results) {
        return (
            <div>
                <Navbar />
                <div style={styles.contentContainer}>
                    <div style={styles.mainContent}>
                        <div style={styles.resultsCard}>
                            <h2 style={styles.title}>No Results Found</h2>
                            <p style={styles.message}>No analysis results were found. Please run an analysis first.</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <Navbar />
            <div style={styles.contentContainer}>
                <div style={styles.mainContent}>
                    <div style={styles.resultsCard}>
                        <h2 style={styles.title}>Difference-in-Differences Analysis Results</h2>
                        
                        {/* Main Result */}
                        <div style={styles.mainResult}>
                            <div style={styles.estimateBox}>
                                <h3 style={styles.estimateTitle}>Treatment Effect</h3>
                                <div style={styles.estimateValue}>
                                    {results.results.did_estimate.toFixed(4)}
                                </div>
                                <div style={styles.estimateDetails}>
                                    <span style={styles.standardError}>
                                        SE: {results.results.standard_error.toFixed(4)}
                                    </span>
                                    <span style={styles.pValue}>
                                        p-value: {results.results.p_value.toFixed(4)}
                                    </span>
                                </div>
                                <div style={styles.confidenceInterval}>
                                    95% CI: [{results.results.confidence_interval.lower.toFixed(4)}, {results.results.confidence_interval.upper.toFixed(4)}]
                                </div>
                                <div style={styles.significance}>
                                    {results.results.is_significant ? '✅ Statistically Significant' : '❌ Not Statistically Significant'}
                                </div>
                            </div>
                        </div>

                        {/* Interpretation */}
                        <div style={styles.interpretation}>
                            <h3 style={styles.sectionTitle}>Interpretation</h3>
                            <p style={styles.interpretationText}>
                                The treatment had a <strong>{results.results.interpretation.effect_direction}</strong> effect 
                                of <strong>{results.results.interpretation.effect_size.toFixed(4)}</strong> units on the outcome variable 
                                ({results.parameters.outcome}). This effect is <strong>{results.results.interpretation.significance}</strong> 
                                at the 95% confidence level.
                            </p>
                        </div>

                        {/* Data Summary */}
                        <div style={styles.dataSummary}>
                            <h3 style={styles.sectionTitle}>Data Summary</h3>
                            <div style={styles.summaryGrid}>
                                <div style={styles.summaryItem}>
                                    <span style={styles.summaryLabel}>Total Observations:</span>
                                    <span style={styles.summaryValue}>{results.results.statistics.total_observations}</span>
                                </div>
                                <div style={styles.summaryItem}>
                                    <span style={styles.summaryLabel}>Treated Units:</span>
                                    <span style={styles.summaryValue}>{results.results.statistics.treated_units}</span>
                                </div>
                                <div style={styles.summaryItem}>
                                    <span style={styles.summaryLabel}>Control Units:</span>
                                    <span style={styles.summaryValue}>{results.results.statistics.control_units}</span>
                                </div>
                                <div style={styles.summaryItem}>
                                    <span style={styles.summaryLabel}>Pre-treatment Period:</span>
                                    <span style={styles.summaryValue}>{results.results.statistics.pre_treatment_obs} obs</span>
                                </div>
                                <div style={styles.summaryItem}>
                                    <span style={styles.summaryLabel}>Post-treatment Period:</span>
                                    <span style={styles.summaryValue}>{results.results.statistics.post_treatment_obs} obs</span>
                                </div>
                            </div>
                        </div>

                        {/* Mean Outcomes Table */}
                        <div style={styles.outcomesTable}>
                            <h3 style={styles.sectionTitle}>Mean Outcomes by Group and Period</h3>
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={styles.tableHeader}>Group</th>
                                        <th style={styles.tableHeader}>Pre-treatment</th>
                                        <th style={styles.tableHeader}>Post-treatment</th>
                                        <th style={styles.tableHeader}>Difference</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={styles.tableCell}>Treated</td>
                                        <td style={styles.tableCell}>{results.results.statistics.outcome_mean_treated_pre.toFixed(4)}</td>
                                        <td style={styles.tableCell}>{results.results.statistics.outcome_mean_treated_post.toFixed(4)}</td>
                                        <td style={styles.tableCell}>
                                            {(results.results.statistics.outcome_mean_treated_post - results.results.statistics.outcome_mean_treated_pre).toFixed(4)}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style={styles.tableCell}>Control</td>
                                        <td style={styles.tableCell}>{results.results.statistics.outcome_mean_control_pre.toFixed(4)}</td>
                                        <td style={styles.tableCell}>{results.results.statistics.outcome_mean_control_post.toFixed(4)}</td>
                                        <td style={styles.tableCell}>
                                            {(results.results.statistics.outcome_mean_control_post - results.results.statistics.outcome_mean_control_pre).toFixed(4)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Analysis Parameters */}
                        <div style={styles.parameters}>
                            <h3 style={styles.sectionTitle}>Analysis Parameters</h3>
                            <div style={styles.parameterList}>
                                <div style={styles.parameterItem}>
                                    <span style={styles.parameterLabel}>Outcome Variable:</span>
                                    <span style={styles.parameterValue}>{results.parameters.outcome}</span>
                                </div>
                                <div style={styles.parameterItem}>
                                    <span style={styles.parameterLabel}>Treatment Variable:</span>
                                    <span style={styles.parameterValue}>{results.parameters.treatment} = {results.parameters.treatment_value}</span>
                                </div>
                                <div style={styles.parameterItem}>
                                    <span style={styles.parameterLabel}>Time Variable:</span>
                                    <span style={styles.parameterValue}>{results.parameters.time}</span>
                                </div>
                                <div style={styles.parameterItem}>
                                    <span style={styles.parameterLabel}>Treatment Start:</span>
                                    <span style={styles.parameterValue}>{results.parameters.treatment_start}</span>
                                </div>
                                <div style={styles.parameterItem}>
                                    <span style={styles.parameterLabel}>Unit Identifier:</span>
                                    <span style={styles.parameterValue}>{results.parameters.unit}</span>
                                </div>
                                {results.parameters.controls.length > 0 && (
                                    <div style={styles.parameterItem}>
                                        <span style={styles.parameterLabel}>Control Variables:</span>
                                        <span style={styles.parameterValue}>{results.parameters.controls.join(', ')}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <BottomProgressBar
                currentStep={currentStep}
                steps={steps}
                onPrev={goToPreviousStep}
                onNext={goToNextStep}
                canGoNext={true} // Always allow next from results page
            />
        </div>
    );
};

export default ResultsPage;

const styles = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '80px', // Account for fixed bottom progress bar
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5'
  },
  mainContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    width: '100%',
    boxSizing: 'border-box' as const
  },
  resultsCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    width: '100%'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 30px 0',
    textAlign: 'center' as const
  },
  mainResult: {
    marginBottom: '40px',
    textAlign: 'center' as const
  },
  estimateBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '30px',
    border: '2px solid #e9ecef',
    display: 'inline-block',
    minWidth: '300px'
  },
  estimateTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#495057',
    margin: '0 0 15px 0'
  },
  estimateValue: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 15px 0'
  },
  estimateDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '10px',
    fontSize: '14px',
    color: '#6c757d'
  },
  standardError: {
    fontWeight: '500'
  },
  pValue: {
    fontWeight: '500'
  },
  confidenceInterval: {
    fontSize: '14px',
    color: '#6c757d',
    marginBottom: '15px'
  },
  significance: {
    fontSize: '16px',
    fontWeight: 'bold',
    padding: '8px 16px',
    borderRadius: '20px',
    backgroundColor: '#d4edda',
    color: '#155724',
    display: 'inline-block'
  },
  interpretation: {
    marginBottom: '40px',
    padding: '20px',
    backgroundColor: '#e3f2fd',
    borderRadius: '8px',
    borderLeft: '4px solid #2196f3'
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 15px 0'
  },
  interpretationText: {
    fontSize: '16px',
    color: '#333',
    margin: 0,
    lineHeight: '1.6'
  },
  dataSummary: {
    marginBottom: '40px'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '15px',
    marginTop: '15px'
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    border: '1px solid #e9ecef'
  },
  summaryLabel: {
    fontSize: '14px',
    color: '#6c757d',
    fontWeight: '500'
  },
  summaryValue: {
    fontSize: '14px',
    color: '#495057',
    fontWeight: 'bold'
  },
  outcomesTable: {
    marginBottom: '40px',
    overflowX: 'auto' as const
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginTop: '15px',
    backgroundColor: 'white',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
  },
  tableHeader: {
    backgroundColor: '#043873',
    color: 'white',
    padding: '12px',
    textAlign: 'left' as const,
    fontWeight: 'bold',
    fontSize: '14px'
  },
  tableCell: {
    padding: '12px',
    borderBottom: '1px solid #e9ecef',
    fontSize: '14px',
    color: '#495057'
  },
  parameters: {
    marginBottom: '20px'
  },
  parameterList: {
    marginTop: '15px'
  },
  parameterItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid #f0f0f0'
  },
  parameterLabel: {
    fontSize: '14px',
    color: '#6c757d',
    fontWeight: '500',
    minWidth: '150px'
  },
  parameterValue: {
    fontSize: '14px',
    color: '#495057',
    fontWeight: 'bold',
    textAlign: 'right' as const
  },
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
  }
};