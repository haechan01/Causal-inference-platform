import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface ValidationResult {
  is_valid: boolean;
  validation_checks: Array<{
    check: string;
    passed: boolean;
    details: string;
  }>;
  critical_issues: string[];
  warnings: string[];
  suggestions: string[];
  proceed_recommendation: 'proceed' | 'review' | 'stop';
}

interface Props {
  isOpen: boolean;
  parameters: any;
  dataSummary: any;
  onProceed: () => Promise<void>;
  onCancel: () => void;
}

const AnalysisValidationModal: React.FC<Props> = ({
  isOpen,
  parameters,
  dataSummary,
  onProceed,
  onCancel
}) => {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAnalysis, setRunningAnalysis] = useState(false);

  const handleRunClick = async () => {
    setRunningAnalysis(true);
    try {
      await onProceed();
    } catch (error) {
      console.error('Analysis failed:', error);
      setRunningAnalysis(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      validateSetup();
    }
  }, [isOpen, parameters]);

  const validateSetup = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/ai/validate-setup', {
        parameters,
        data_summary: dataSummary
      });
      setValidation(response.data);
    } catch (error) {
      setValidation({
        is_valid: true,
        validation_checks: [],
        critical_issues: [],
        warnings: ['Could not perform AI validation'],
        suggestions: [],
        proceed_recommendation: 'proceed'
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>🔍 Pre-Analysis Validation</h2>
        </div>

        <div style={styles.content}>
          {loading || runningAnalysis ? (
            <div style={styles.loading}>
              <div style={styles.spinner}></div>
              <p>{runningAnalysis ? 'Running analysis...' : 'AI is validating your analysis setup...'}</p>
            </div>
          ) : validation && (
            <>
              {/* Overall Status */}
              <div style={{
                ...styles.statusBanner,
                backgroundColor: validation.proceed_recommendation === 'proceed' ? '#d4edda' :
                                validation.proceed_recommendation === 'review' ? '#fff3cd' : '#f8d7da'
              }}>
                <span style={styles.statusIcon}>
                  {validation.proceed_recommendation === 'proceed' ? '✅' :
                   validation.proceed_recommendation === 'review' ? '⚠️' : '🛑'}
                </span>
                <span style={styles.statusText}>
                  {validation.proceed_recommendation === 'proceed' 
                    ? 'Your analysis setup looks good!' 
                    : validation.proceed_recommendation === 'review'
                    ? 'Please review the warnings below'
                    : 'Critical issues need to be fixed'}
                </span>
              </div>

              {/* Validation Checks */}
              <div style={styles.checksSection}>
                <h3>Validation Checks</h3>
                {validation.validation_checks.map((check, i) => (
                  <div key={i} style={styles.checkItem}>
                    <span style={check.passed ? styles.checkPassed : styles.checkFailed}>
                      {check.passed ? '✓' : '✗'}
                    </span>
                    <div style={styles.checkContent}>
                      <strong>{check.check}</strong>
                      <p>{check.details}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Critical Issues */}
              {validation.critical_issues && validation.critical_issues.length > 0 && (
                <div style={styles.issuesSection}>
                  <h3>🚨 Critical Issues</h3>
                  <ul>
                    {validation.critical_issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {validation.warnings && validation.warnings.length > 0 && (
                <div style={styles.warningsSection}>
                  <h3>⚠️ Warnings</h3>
                  <ul>
                    {validation.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {validation.suggestions && validation.suggestions.length > 0 && (
                <div style={styles.suggestionsSection}>
                  <h3>💡 Suggestions</h3>
                  <ul>
                    {validation.suggestions.map((suggestion, i) => (
                      <li key={i}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div style={styles.footer}>
          <button 
            onClick={onCancel} 
            style={styles.cancelButton}
            disabled={runningAnalysis}
          >
            Go Back & Edit
          </button>
          <button 
            onClick={handleRunClick}
            disabled={loading || runningAnalysis || validation?.proceed_recommendation === 'stop'}
            style={{
              ...styles.proceedButton,
              opacity: (loading || runningAnalysis || validation?.proceed_recommendation === 'stop') ? 0.5 : 1
            }}
          >
            {runningAnalysis ? 'Running...' : 'Run Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '600px',
    maxHeight: '80vh',
    overflow: 'auto' as const
  },
  header: {
    padding: '20px',
    borderBottom: '1px solid #e9ecef'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    color: '#043873'
  },
  content: {
    padding: '20px'
  },
  loading: {
    textAlign: 'center' as const,
    padding: '40px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px'
  },
  statusBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '20px'
  },
  statusIcon: {
    fontSize: '24px'
  },
  statusText: {
    fontSize: '16px',
    fontWeight: 'bold'
  },
  checksSection: {
    marginBottom: '20px'
  },
  checkItem: {
    display: 'flex',
    gap: '12px',
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    marginBottom: '8px'
  },
  checkPassed: {
    color: '#28a745',
    fontSize: '18px',
    fontWeight: 'bold'
  },
  checkFailed: {
    color: '#dc3545',
    fontSize: '18px',
    fontWeight: 'bold'
  },
  checkContent: {
    flex: 1
  },
  issuesSection: {
    backgroundColor: '#f8d7da',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '15px'
  },
  warningsSection: {
    backgroundColor: '#fff3cd',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '15px'
  },
  suggestionsSection: {
    backgroundColor: '#d1ecf1',
    padding: '15px',

    borderRadius: '8px'
  },
  footer: {
    padding: '20px',
    borderTop: '1px solid #e9ecef',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px'
  },
  cancelButton: {
    backgroundColor: 'transparent',
    color: '#666',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '12px 24px',
    cursor: 'pointer'
  },
  proceedButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontWeight: 'bold',
    cursor: 'pointer'
  }
};

export default AnalysisValidationModal;

