import React, { useState } from 'react';

interface HelpTooltipProps {
  concept: string;
  children: React.ReactNode;
}

// Static explanations for common concepts - no AI calls needed
const STATIC_EXPLANATIONS: Record<string, {
  title: string;
  simple_explanation: string;
  example?: string;
  why_it_matters?: string;
}> = {
  'outcome variable in causal inference': {
    title: 'Outcome Variable',
    simple_explanation: 'The outcome variable is what you want to measure the effect on. It\'s the result or dependent variable that changes in response to the treatment.',
    example: 'If studying the effect of a training program on employee productivity, "productivity" (measured as sales per hour) would be the outcome variable.',
    why_it_matters: 'Correctly identifying the outcome variable is crucial because it determines what effect you\'re measuring. It should be measurable and directly related to your research question.'
  },
  'treatment variable and control group': {
    title: 'Treatment Variable & Control Group',
    simple_explanation: 'The treatment variable indicates which units received the intervention (treatment group) versus those that didn\'t (control group). The control group serves as a comparison baseline.',
    example: 'In studying a new drug, patients who received the drug are the treatment group, and patients who received a placebo are the control group.',
    why_it_matters: 'Having a proper control group allows you to isolate the effect of the treatment by comparing outcomes between treated and untreated units, controlling for other factors.'
  },
  'time variable in panel data': {
    title: 'Time Variable',
    simple_explanation: 'The time variable tracks when observations occurred. In panel data, you need both time periods and units, allowing you to observe changes over time.',
    example: 'If studying quarterly sales data from 2020-2023, the time variable would be the quarter/year (e.g., "2020-Q1", "2020-Q2", etc.).',
    why_it_matters: 'Time variables are essential for difference-in-differences analysis, which compares changes over time between treatment and control groups to identify causal effects.'
  },
  'unit of analysis': {
    title: 'Unit of Analysis',
    simple_explanation: 'The unit of analysis is the entity being observed and measured (e.g., individuals, companies, states, schools). Each unit should be uniquely identifiable.',
    example: 'If analyzing the effect of a policy on states, each state would be a unit. If analyzing students, each student would be a unit.',
    why_it_matters: 'Correctly identifying the unit of analysis ensures your data is structured properly and that you\'re measuring effects at the right level of aggregation.'
  },
  'control variables': {
    title: 'Control Variables',
    simple_explanation: 'Control variables are additional factors that might influence the outcome. Including them helps isolate the true effect of the treatment by accounting for other potential causes.',
    example: 'When studying the effect of education on income, you might control for age, work experience, and location, as these also affect income.',
    why_it_matters: 'Control variables improve the accuracy of your causal estimate by reducing omitted variable bias. They help ensure you\'re measuring the treatment effect, not the effect of other factors.'
  }
};

const HelpTooltip: React.FC<HelpTooltipProps> = ({ concept, children }) => {
  const [showHelp, setShowHelp] = useState(false);
  
  // Get static explanation - no API call needed
  const explanation = STATIC_EXPLANATIONS[concept.toLowerCase()] || {
    title: concept,
    simple_explanation: 'Explanation not available for this concept.',
  };

  return (
    <span style={styles.wrapper}>
      {children}
      <button 
        style={styles.helpButton}
        onClick={(e) => {
          e.stopPropagation();
          setShowHelp(!showHelp);
        }}
        title={`Learn about ${concept}`}
      >
        ?
      </button>
      
      {showHelp && (
        <div style={styles.tooltip} onClick={(e) => e.stopPropagation()}>
          <div style={styles.tooltipHeader}>
            <h4 style={styles.tooltipTitle}>
              {explanation.title}
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
          
          <div style={styles.tooltipContent}>
            <p style={styles.simpleExplanation}>
              {explanation.simple_explanation}
            </p>
            
            {explanation.example && (
              <div style={styles.example}>
                <strong>Example:</strong> {explanation.example}
              </div>
            )}
            
            {explanation.why_it_matters && (
              <div style={styles.whyMatters}>
                <strong>Why it matters:</strong> {explanation.why_it_matters}
              </div>
            )}
          </div>
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

