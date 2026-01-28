import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import RDSensitivityPlot from './RDSensitivityPlot';
import RDScatterPlot from './RDScatterPlot';

const RDResults: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadResults = async () => {
      const storedResults = localStorage.getItem('rdAnalysisResults');

      if (storedResults) {
        try {
          const parsedResults = JSON.parse(storedResults);
          setResults(parsedResults);
        } catch (error) {
          console.error('Error parsing stored results:', error);
        }
      }
      setLoading(false);
    };

    loadResults();
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

  if (!results || !results.results) {
    return (
      <div>
        <Navbar />
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠️</div>
          <h2 style={styles.errorTitle}>No Results Found</h2>
          <p style={styles.errorMessage}>
            No analysis results available. Please run an analysis first.
          </p>
          <button
            onClick={() => navigate('/method-selection')}
            style={styles.backButton}
          >
            Go to Method Selection
          </button>
        </div>
      </div>
    );
  }

  const { results: res, parameters, bandwidth_info } = results;
  const isSignificant = res.p_value < 0.05;

  return (
    <div>
      <Navbar />
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Regression Discontinuity Results</h1>
          <p style={styles.subtitle}>
            Analysis complete for {parameters.running_var} at cutoff {parameters.cutoff}
          </p>
        </div>

        <div style={styles.content}>
          {/* Main Result Card */}
          <div style={styles.mainResultCard}>
            <h2 style={styles.resultLabel}>Treatment Effect</h2>
            <div style={styles.effectValue}>
              {res.treatment_effect.toFixed(3)}
            </div>
            <div style={styles.ciContainer}>
              <span style={styles.ciLabel}>95% CI:</span>
              <span style={styles.ciValue}>
                [{res.ci_lower.toFixed(3)}, {res.ci_upper.toFixed(3)}]
              </span>
            </div>
            <div
              style={{
                ...styles.significanceBadge,
                ...(isSignificant
                  ? styles.significantBadge
                  : styles.notSignificantBadge),
              }}
            >
              {isSignificant ? '✓ Statistically Significant' : 'Not Statistically Significant'}
            </div>
          </div>

          {/* Statistics Grid */}
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>P-Value</div>
              <div style={styles.statValue}>{res.p_value.toFixed(4)}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Standard Error</div>
              <div style={styles.statValue}>{res.se.toFixed(3)}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Above Cutoff</div>
              <div style={styles.statValue}>{res.n_treated}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Below Cutoff</div>
              <div style={styles.statValue}>{res.n_control}</div>
            </div>
          </div>

          {/* Bandwidth Info */}
          <div style={styles.infoCard}>
            <h3 style={styles.infoTitle}>Bandwidth Information</h3>
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Bandwidth Used:</span>
                <span style={styles.infoValue}>{res.bandwidth_used.toFixed(3)}</span>
              </div>
              {bandwidth_info.optimal_bandwidth && (
                <div style={styles.infoItem}>
                  <span style={styles.infoLabel}>Optimal Bandwidth:</span>
                  <span style={styles.infoValue}>
                    {bandwidth_info.optimal_bandwidth.toFixed(3)}
                  </span>
                </div>
              )}
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Method:</span>
                <span style={styles.infoValue}>
                  {bandwidth_info.bandwidth_method === 'user_specified'
                    ? 'User Specified'
                    : 'Imbens-Kalyanaraman (2012)'}
                </span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Polynomial Order:</span>
                <span style={styles.infoValue}>{res.polynomial_order === 1 ? 'Linear' : 'Quadratic'}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Kernel:</span>
                <span style={styles.infoValue}>Triangular</span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {(res.warnings && res.warnings.length > 0) ||
          (bandwidth_info.bandwidth_warnings && bandwidth_info.bandwidth_warnings.length > 0) ? (
            <div style={styles.warningCard}>
              <h3 style={styles.warningTitle}>⚠️ Warnings</h3>
              <ul style={styles.warningList}>
                {res.warnings &&
                  res.warnings.map((warning: string, idx: number) => (
                    <li key={`warn-${idx}`}>{warning}</li>
                  ))}
                {bandwidth_info.bandwidth_warnings &&
                  bandwidth_info.bandwidth_warnings.map(
                    (warning: string, idx: number) => (
                      <li key={`bw-warn-${idx}`}>{warning}</li>
                    )
                  )}
              </ul>
            </div>
          ) : null}

          {/* RD Scatter Plot Visualization */}
          <RDScatterPlot
            datasetId={results.dataset_id}
            runningVar={parameters.running_var}
            outcomeVar={parameters.outcome_var}
            cutoff={parameters.cutoff}
            bandwidth={res.bandwidth_used}
            polynomialOrder={res.polynomial_order}
          />

          {/* Sensitivity Analysis Visualization */}
          <RDSensitivityPlot
            datasetId={results.dataset_id}
            runningVar={parameters.running_var}
            outcomeVar={parameters.outcome_var}
            cutoff={parameters.cutoff}
            optimalBandwidth={bandwidth_info.optimal_bandwidth}
          />

          {/* Action Buttons */}
          <div style={styles.actionButtons}>
            <button
              style={styles.secondaryButton}
              onClick={() => navigate('/rd-setup', { state: location.state })}
            >
              Run New Analysis
            </button>
            <button
              style={styles.primaryButton}
              onClick={() => navigate('/projects')}
            >
              Back to Projects
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RDResults;

const styles = {
  container: {
    paddingTop: '70px',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px',
  },
  loadingText: {
    fontSize: '18px',
    color: '#666',
    margin: 0,
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5',
    padding: '40px 20px',
    textAlign: 'center' as const,
  },
  errorIcon: {
    fontSize: '64px',
    marginBottom: '20px',
  },
  errorTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#dc3545',
    margin: '0 0 15px 0',
  },
  errorMessage: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 30px 0',
    maxWidth: '500px',
    lineHeight: '1.5',
  },
  backButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  header: {
    textAlign: 'center' as const,
    padding: '40px 20px 30px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0',
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    margin: 0,
  },
  content: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '0 20px 40px',
  },
  mainResultCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as const,
    marginBottom: '30px',
  },
  resultLabel: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#666',
    margin: '0 0 15px 0',
  },
  effectValue: {
    fontSize: '48px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 15px 0',
  },
  ciContainer: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '20px',
  },
  ciLabel: {
    fontWeight: '600',
    marginRight: '8px',
  },
  ciValue: {
    fontFamily: 'monospace',
  },
  significanceBadge: {
    display: 'inline-block',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
  },
  significantBadge: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  notSignificantBadge: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },
  statCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '25px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as const,
  },
  statLabel: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '10px',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#043873',
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    marginBottom: '30px',
  },
  infoTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 20px 0',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '15px',
  },
  infoItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
  },
  infoLabel: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: '14px',
    color: '#333',
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '12px',
    padding: '25px',
    marginBottom: '30px',
  },
  warningTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#856404',
    margin: '0 0 15px 0',
  },
  warningList: {
    margin: 0,
    paddingLeft: '20px',
    color: '#856404',
    lineHeight: '1.6',
  },
  actionButtons: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center',
    marginTop: '30px',
  },
  primaryButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '14px 30px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  secondaryButton: {
    backgroundColor: 'white',
    color: '#043873',
    border: '2px solid #043873',
    borderRadius: '8px',
    padding: '14px 30px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

