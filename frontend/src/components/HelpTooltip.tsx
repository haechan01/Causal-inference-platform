import React, { useState } from 'react';
import axios from 'axios';

interface HelpTooltipProps {
  concept: string;
  children: React.ReactNode;
}

const HelpTooltip: React.FC<HelpTooltipProps> = ({ concept, children }) => {
  const [showHelp, setShowHelp] = useState(false);
  const [explanation, setExplanation] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchExplanation = async () => {
    if (explanation) {
      setShowHelp(true);
      return;
    }
    
    setLoading(true);
    setShowHelp(true);
    
    try {
      const response = await axios.post('/ai/explain', {
        concept,
        level: 'beginner'
      });
      setExplanation(response.data);
    } catch (error) {
      setExplanation({ 
        simple_explanation: 'Unable to load explanation.',
        error: true 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <span style={styles.wrapper}>
      {children}
      <button 
        style={styles.helpButton}
        onClick={(e) => {
          e.stopPropagation();
          fetchExplanation();
        }}
        title={`Learn about ${concept}`}
      >
        ?
      </button>
      
      {showHelp && (
        <div style={styles.tooltip} onClick={(e) => e.stopPropagation()}>
          <div style={styles.tooltipHeader}>
            <h4 style={styles.tooltipTitle}>
              {explanation?.title || concept}
            </h4>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowHelp(false);
              }}
              style={styles.closeButton}
            >
              ×
            </button>
          </div>
          
          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : (
            <div style={styles.tooltipContent}>
              <p style={styles.simpleExplanation}>
                {explanation?.simple_explanation}
              </p>
              
              {explanation?.example && (
                <div style={styles.example}>
                  <strong>Example:</strong> {explanation.example}
                </div>
              )}
              
              {explanation?.why_it_matters && (
                <div style={styles.whyMatters}>
                  <strong>Why it matters:</strong> {explanation.why_it_matters}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
};

const styles = {
  wrapper: {
    position: 'relative' as const,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px'
  },
  helpButton: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0
  },
  tooltip: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    width: '320px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    zIndex: 1000,
    marginTop: '8px'
  },
  tooltipHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 15px',
    borderBottom: '1px solid #e9ecef',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px 8px 0 0'
  },
  tooltipTitle: {
    margin: 0,
    fontSize: '14px',
    color: '#043873'
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#666',
    padding: 0
  },
  tooltipContent: {
    padding: '15px',
    textAlign: 'left' as const
  },
  loading: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#666'
  },
  simpleExplanation: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    lineHeight: '1.5',
    color: '#333'
  },
  example: {
    backgroundColor: '#e3f2fd',
    padding: '10px',
    borderRadius: '6px',
    fontSize: '13px',
    marginBottom: '10px'
  },
  whyMatters: {
    backgroundColor: '#d4edda',
    padding: '10px',
    borderRadius: '6px',
    fontSize: '13px'
  }
};

export default HelpTooltip;

