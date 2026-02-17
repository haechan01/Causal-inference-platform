import React, { useState } from 'react';
import axios from 'axios';

interface Suggestion {
  column: string;
  confidence: number;
  reasoning: string;
  assumptions?: string;
}

interface RDVariableSuggestionsProps {
  schemaInfo: any;
  causalQuestion?: string;
  onApplySuggestions: (suggestions: {
    runningVar?: string;
    outcomeVar?: string;
    cutoff?: string;
    treatmentSide?: 'above' | 'below';
  }) => void;
}

const RDVariableSuggestions: React.FC<RDVariableSuggestionsProps> = ({
  schemaInfo,
  causalQuestion,
  onApplySuggestions,
}) => {
  const [suggestions, setSuggestions] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/ai/suggest-variables', {
        schema_info: schemaInfo,
        causal_question: causalQuestion,
        method: 'rd',
      });
      setSuggestions(response.data);
      setExpanded(true);
    } catch (err: any) {
      console.error('RD AI Suggestion Error:', err);
      setError(err.response?.data?.error || 'Failed to get suggestions');
    } finally {
      setLoading(false);
    }
  };

  const applyAllSuggestions = () => {
    if (!suggestions) return;

    const applied: any = {};

    if (suggestions.running_var_suggestions?.[0]) {
      applied.runningVar = suggestions.running_var_suggestions[0].column;
    }
    if (suggestions.outcome_var_suggestions?.[0]) {
      applied.outcomeVar = suggestions.outcome_var_suggestions[0].column;
    }
    const cutoffVal = suggestions.cutoff_suggestion?.value;
    if (cutoffVal != null && cutoffVal !== 'user to specify' && String(cutoffVal).trim() !== '') {
      applied.cutoff = String(cutoffVal);
    }
    if (suggestions.treatment_side_suggestion?.value) {
      applied.treatmentSide = suggestions.treatment_side_suggestion.value as 'above' | 'below';
    }

    onApplySuggestions(applied);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.aiIcon}>🤖</span>
          <h3 style={styles.title}>RD AI Variable Assistant</h3>
        </div>

        {!suggestions && !loading && (
          <button
            onClick={fetchSuggestions}
            style={styles.getHelpButton}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#4f46e5';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(99, 102, 241, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#6366f1';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(99, 102, 241, 0.3)';
            }}
          >
            ✨ Get AI Suggestions
          </button>
        )}
      </div>

      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <span>Analyzing your data...</span>
        </div>
      )}

      {error && (
        <div style={styles.error}>
          <span>⚠️ {error}</span>
          <button onClick={fetchSuggestions} style={styles.retryButton}>
            Retry
          </button>
        </div>
      )}

      {suggestions && expanded && (
        <div style={styles.suggestionsContainer}>
          {suggestions.explanation && (
            <p style={styles.explanation}>{suggestions.explanation}</p>
          )}

          {/* RD-specific: Running Variable, Cutoff Threshold, Outcome Variable */}
          <div style={styles.suggestionsGrid}>
            <SuggestionCard
              title="Running Variable"
              suggestions={suggestions.running_var_suggestions}
              icon="📐"
            />
            <CutoffCard cutoff={suggestions.cutoff_suggestion} />
            <SuggestionCard
              title="Outcome Variable"
              suggestions={suggestions.outcome_var_suggestions}
              icon="📊"
            />
          </div>

          {/* Treatment Side - secondary (above/below cutoff) */}
          {suggestions.treatment_side_suggestion && (
            <div style={styles.controlsSection}>
              <div style={styles.sectionHeader}>
                <span style={{ fontSize: '18px' }}>↔️</span>
                <h4 style={styles.sectionTitle}>Treatment Side</h4>
              </div>
              <p style={styles.sectionDescription}>
                Which side of the cutoff receives treatment.
              </p>
              <div style={styles.controlsGrid}>
                <div style={styles.controlCard}>
                  <span style={styles.columnName}>
                    {suggestions.treatment_side_suggestion.value === 'above'
                      ? 'Above cutoff (treated)'
                      : 'Below cutoff (treated)'}
                  </span>
                  <p style={styles.reasoning}>{suggestions.treatment_side_suggestion.reasoning}</p>
                </div>
              </div>
            </div>
          )}

          {/* Alternative Options */}
          {suggestions.alternative_options && Object.values(suggestions.alternative_options).some((v: any) => v && v.length > 0) && (
            <div style={styles.alternativesSection}>
              <div style={styles.sectionHeader}>
                <span style={{ fontSize: '18px' }}>🔄</span>
                <h4 style={styles.sectionTitle}>Alternative Options</h4>
              </div>
              <div style={styles.alternativesGrid}>
                {Object.entries(suggestions.alternative_options).map(([role, opts]: [string, any]) =>
                  opts && opts.length > 0 ? (
                    <div key={role} style={styles.alternativeItem}>
                      <strong>{role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {opts.join(', ')}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          {suggestions.warnings && suggestions.warnings.length > 0 && (
            <div style={styles.warnings}>
              <h4>⚠️ Things to Consider</h4>
              <ul>
                {suggestions.warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={styles.actions}>
            <button onClick={applyAllSuggestions} style={styles.applyButton}>
              Apply All Suggestions
            </button>
            <button onClick={() => setExpanded(false)} style={styles.dismissButton}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const CutoffCard: React.FC<{
  cutoff: { value: any; reasoning?: string; assumptions?: string } | null | undefined;
}> = ({ cutoff }) => {
  if (!cutoff) return null;

  const displayValue = cutoff.value === 'user to specify'
    ? 'User to specify'
    : String(cutoff.value);

  return (
    <div style={styles.suggestionCard}>
      <div style={styles.cardHeader}>
        <span>✂️</span>
        <span style={styles.cardTitle}>Cutoff Threshold</span>
      </div>
      <div style={styles.topSuggestion}>
        <span style={styles.columnName}>{displayValue}</span>
      </div>
      {cutoff.reasoning && <p style={styles.reasoning}>{cutoff.reasoning}</p>}
      {cutoff.assumptions && (
        <p style={styles.assumptionText}><em>Note: {cutoff.assumptions}</em></p>
      )}
    </div>
  );
};

const SuggestionCard: React.FC<{
  title: string;
  suggestions: Suggestion[];
  icon: string;
}> = ({ title, suggestions, icon }) => {
  if (!suggestions || suggestions.length === 0) return null;

  const top = suggestions[0];

  return (
    <div style={styles.suggestionCard}>
      <div style={styles.cardHeader}>
        <span>{icon}</span>
        <span style={styles.cardTitle}>{title}</span>
      </div>
      <div style={styles.topSuggestion}>
        <span style={styles.columnName}>{top.column}</span>
        <div style={styles.confidenceBar}>
          <div
            style={{
              ...styles.confidenceFill,
              width: `${(top.confidence ?? 0.5) * 100}%`,
              backgroundColor: (top.confidence ?? 0.5) > 0.7 ? '#28a745' :
                (top.confidence ?? 0.5) > 0.4 ? '#ffc107' : '#dc3545',
            }}
          />
        </div>
      </div>
      <p style={styles.reasoning}>{top.reasoning}</p>
      {top.assumptions && (
        <p style={styles.assumptionText}>
          <em>Assumption: {top.assumptions}</em>
        </p>
      )}
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: '#e3f2fd',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '0',
    border: '2px solid #4F9CF9',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    width: '100%',
    boxSizing: 'border-box' as const,
    minWidth: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  aiIcon: {
    fontSize: '24px',
  },
  title: {
    margin: 0,
    color: '#043873',
    fontSize: '18px',
  },
  getHelpButton: {
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba(99, 102, 241, 0.3)',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '15px',
    color: '#043873',
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #4F9CF9',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  error: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '10px 15px',
    borderRadius: '8px',
    marginTop: '15px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: '#721c24',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '5px 10px',
    cursor: 'pointer',
  },
  suggestionsContainer: {
    marginTop: '20px',
  },
  explanation: {
    color: '#495057',
    fontSize: '14px',
    marginBottom: '20px',
    lineHeight: '1.5',
  },
  suggestionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '15px',
  },
  suggestionCard: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '15px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    minWidth: 0,
    wordWrap: 'break-word' as const,
    overflowWrap: 'break-word' as const,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
  },
  cardTitle: {
    fontWeight: 'bold',
    color: '#333',
    fontSize: '14px',
  },
  topSuggestion: {
    marginBottom: '8px',
  },
  columnName: {
    fontFamily: 'monospace',
    backgroundColor: '#f8f9fa',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  confidenceBar: {
    height: '4px',
    backgroundColor: '#e9ecef',
    borderRadius: '2px',
    marginTop: '8px',
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  reasoning: {
    fontSize: '12px',
    color: '#666',
    margin: 0,
    lineHeight: '1.4',
    wordWrap: 'break-word' as const,
    overflowWrap: 'break-word' as const,
  },
  controlsSection: {
    marginTop: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '15px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '16px',
    color: '#333',
  },
  sectionDescription: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '10px',
  },
  controlsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '10px',
  },
  controlCard: {
    border: '1px solid #e9ecef',
    borderRadius: '6px',
    padding: '10px',
    backgroundColor: '#f8f9fa',
  },
  alternativesSection: {
    marginTop: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '15px',
  },
  alternativesGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  alternativeItem: {
    fontSize: '13px',
    color: '#495057',
  },
  warnings: {
    backgroundColor: '#fff3cd',
    borderRadius: '8px',
    padding: '15px',
    marginTop: '20px',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    marginTop: '20px',
  },
  applyButton: {
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  dismissButton: {
    backgroundColor: 'transparent',
    color: '#666',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  assumptionText: {
    fontSize: '11px',
    color: '#6c757d',
    fontStyle: 'italic',
    marginTop: '4px',
  },
};

export default RDVariableSuggestions;
