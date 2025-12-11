import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface NextStepsProps {
  analysisResults: any;
  interpretation: any;
}

const NextStepsCard: React.FC<NextStepsProps> = ({ analysisResults, interpretation }) => {
  const [nextSteps, setNextSteps] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchNextSteps = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/ai/next-steps', {
        analysis_results: analysisResults,
        interpretation
      });
      setNextSteps(response.data);
      setExpanded(true);
    } catch (error) {
      console.error('Failed to get next steps:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📋 What's Next?</h2>
        {!nextSteps && !loading && (
          <button onClick={fetchNextSteps} style={styles.getButton}>
            Get AI Interpretation
          </button>
        )}
      </div>

      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <span>Generating recommendations...</span>
        </div>
      )}

      {nextSteps && expanded && (
        <div style={styles.content}>
          {/* Immediate Actions */}
          <div style={styles.section}>
            <h3>🎯 Immediate Actions</h3>
            <div style={styles.actionsList}>
              {nextSteps.immediate_actions?.map((action: any, i: number) => (
                <div key={i} style={styles.actionItem}>
                  <span style={{
                    ...styles.priorityBadge,
                    backgroundColor: action.priority === 'high' ? '#dc3545' :
                                    action.priority === 'medium' ? '#ffc107' : '#6c757d'
                  }}>
                    {action.priority}
                  </span>
                  <div style={styles.actionContent}>
                    <strong>{action.action}</strong>
                    <p>{action.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Robustness Checks */}
          <div style={styles.section}>
            <h3>🔬 Robustness Checks to Consider</h3>
            <div style={styles.checksList}>
              {nextSteps.robustness_checks?.map((check: any, i: number) => (
                <div key={i} style={styles.checkCard}>
                  <h4>{check.check}</h4>
                  <p><strong>How:</strong> {check.how}</p>
                  <p><strong>Why:</strong> {check.why}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Reporting Guidance */}
          <div style={styles.section}>
            <h3>📝 Reporting Guidance</h3>
            <div style={styles.reportingBox}>
              <div style={styles.reportingColumn}>
                <h4>Key Findings to Report</h4>
                <ul>
                  {nextSteps.reporting_guidance?.key_findings?.map((f: string, i: number) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.reportingColumn}>
                <h4>Caveats to Mention</h4>
                <ul>
                  {nextSteps.reporting_guidance?.caveats_to_mention?.map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Conditional Next Steps */}
          <div style={styles.conditionalSection}>
            {analysisResults.is_significant ? (
              <div style={styles.significantBox}>
                <h4>✅ Since your results are significant:</h4>
                <ul>
                  {nextSteps.if_significant?.actions?.map((a: string, i: number) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
                {nextSteps.if_significant?.cautions && (
                  <div style={styles.cautionNote}>
                    <strong>Cautions:</strong>
                    <ul>
                      {nextSteps.if_significant.cautions.map((c: string, i: number) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div style={styles.notSignificantBox}>
                <h4>📊 Since your results are not significant:</h4>
                <div>
                  <strong>Possible reasons:</strong>
                  <ul>
                    {nextSteps.if_not_significant?.possible_reasons?.map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>What to explore next:</strong>
                  <ul>
                    {nextSteps.if_not_significant?.next_steps?.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '30px',
    marginBottom: '30px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    border: '2px solid #28a745'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  title: {
    margin: 0,
    color: '#043873'
  },
  getButton: {
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    justifyContent: 'center',
    padding: '20px'
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #28a745',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  content: {},
  section: {
    marginBottom: '25px'
  },
  actionsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px'
  },
  actionItem: {
    display: 'flex',
    gap: '12px',
    backgroundColor: '#f8f9fa',
    padding: '15px',
    borderRadius: '8px'
  },
  priorityBadge: {
    color: 'white',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase' as const,
    height: 'fit-content'
  },
  actionContent: {
    flex: 1
  },
  checksList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '15px'
  },
  checkCard: {
    backgroundColor: '#e3f2fd',
    padding: '15px',
    borderRadius: '8px'
  },
  reportingBox: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px'
  },
  reportingColumn: {
    backgroundColor: '#f8f9fa',
    padding: '15px',
    borderRadius: '8px'
  },
  conditionalSection: {
    marginTop: '20px'
  },
  significantBox: {
    backgroundColor: '#d4edda',
    padding: '20px',
    borderRadius: '8px'
  },
  notSignificantBox: {
    backgroundColor: '#fff3cd',
    padding: '20px',
    borderRadius: '8px'
  },
  cautionNote: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    padding: '10px',
    borderRadius: '6px',
    marginTop: '10px'
  }
};

export default NextStepsCard;

