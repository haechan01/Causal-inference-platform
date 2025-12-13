import React, { useState } from 'react';
import axios from 'axios';

interface Suggestion {
  column: string;
  confidence: number;
  reasoning: string;
}

interface AIVariableSuggestionsProps {
  schemaInfo: any;
  causalQuestion?: string;
  onApplySuggestions: (suggestions: {
    outcome?: string;
    treatment?: string;
    time?: string;
    unit?: string;
  }) => void;
}

const AIVariableSuggestions: React.FC<AIVariableSuggestionsProps> = ({
  schemaInfo,
  causalQuestion,
  onApplySuggestions
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
        causal_question: causalQuestion
      });
      setSuggestions(response.data);
      setExpanded(true);
    } catch (err: any) {
      console.error("AI Suggestion Error:", err);
      setError(err.response?.data?.error || 'Failed to get suggestions');
    } finally {
      setLoading(false);
    }
  };

  const applyAllSuggestions = () => {
    if (!suggestions) return;

    const applied: any = {};

    if (suggestions.outcome_suggestions?.[0]) {
      applied.outcome = suggestions.outcome_suggestions[0].column;
    }
    if (suggestions.treatment_suggestions?.[0]) {
      applied.treatment = suggestions.treatment_suggestions[0].column;
    }
    if (suggestions.time_suggestions?.[0]) {
      applied.time = suggestions.time_suggestions[0].column;
    }
    if (suggestions.unit_suggestions?.[0]) {
      applied.unit = suggestions.unit_suggestions[0].column;
    }

    onApplySuggestions(applied);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.aiIcon}>🤖</span>
          <h3 style={styles.title}>AI Variable Assistant</h3>
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

          <div style={styles.suggestionsGrid}>
            <SuggestionCard
              title="Outcome Variable"
              suggestions={suggestions.outcome_suggestions}
              icon="📊"
            />
            <SuggestionCard
              title="Treatment Indicator"
              suggestions={suggestions.treatment_suggestions}
              icon="💊"
            />
            <SuggestionCard
              title="Time Variable"
              suggestions={suggestions.time_suggestions}
              icon="📅"
            />
            <SuggestionCard
              title="Unit Identifier"
              suggestions={suggestions.unit_suggestions}
              icon="🏷️"
            />
          </div>

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
            <button
              onClick={() => setExpanded(false)}
              style={styles.dismissButton}
            >
              Dismiss
            </button>
          </div>
        </div>
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
              width: `${top.confidence * 100}%`,
              backgroundColor: top.confidence > 0.7 ? '#28a745' :
                top.confidence > 0.4 ? '#ffc107' : '#dc3545'
            }}
          />
        </div>
      </div>
      <p style={styles.reasoning}>{top.reasoning}</p>
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
    minWidth: 0 // Allow container to shrink below content size
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  aiIcon: {
    fontSize: '24px'
  },
  title: {
    margin: 0,
    color: '#043873',
    fontSize: '18px'
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
    boxShadow: '0 2px 4px rgba(99, 102, 241, 0.3)'
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '15px',
    color: '#043873'
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #4F9CF9',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  error: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '10px 15px',
    borderRadius: '8px',
    marginTop: '15px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  retryButton: {
    backgroundColor: '#721c24',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '5px 10px',
    cursor: 'pointer'
  },
  suggestionsContainer: {
    marginTop: '20px'
  },
  explanation: {
    color: '#495057',
    fontSize: '14px',
    marginBottom: '20px',
    lineHeight: '1.5'
  },
  suggestionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '15px'
  },
  suggestionCard: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '15px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    minWidth: 0, // Allow card to shrink
    wordWrap: 'break-word' as const,
    overflowWrap: 'break-word' as const
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px'
  },
  cardTitle: {
    fontWeight: 'bold',
    color: '#333',
    fontSize: '14px'
  },
  topSuggestion: {
    marginBottom: '8px'
  },
  columnName: {
    fontFamily: 'monospace',
    backgroundColor: '#f8f9fa',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 'bold'
  },
  confidenceBar: {
    height: '4px',
    backgroundColor: '#e9ecef',
    borderRadius: '2px',
    marginTop: '8px',
    overflow: 'hidden'
  },
  confidenceFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease'
  },
  reasoning: {
    fontSize: '12px',
    color: '#666',
    margin: 0,
    lineHeight: '1.4',
    wordWrap: 'break-word' as const,
    overflowWrap: 'break-word' as const
  },
  warnings: {
    backgroundColor: '#fff3cd',
    borderRadius: '8px',
    padding: '15px',
    marginTop: '20px'
  },
  actions: {
    display: 'flex',
    gap: '10px',
    marginTop: '20px'
  },
  applyButton: {
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  dismissButton: {
    backgroundColor: 'transparent',
    color: '#666',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    cursor: 'pointer'
  }
};

export default AIVariableSuggestions;

