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
  },
  'manual group assignment': {
    title: 'Manual Group Assignment',
    simple_explanation: 'This optional step allows you to manually specify which units belong to the treatment group and which belong to the control group. If skipped, the system will automatically assign groups based on your Treatment Variable and Value.',
    example: 'If your data has a "State" column, you can manually select "California" and "New York" as treatment units, and "Texas" and "Florida" as control units.',
    why_it_matters: 'Manual assignment gives you full control if the automatic logic doesn\'t perfectly match your study design, or if you want to exclude specific units from the analysis.'
  },
  // ── IV-specific concepts ──────────────────────────────────────────────────
  'endogenous treatment in iv': {
    title: 'Endogenous Treatment Variable',
    simple_explanation: 'A variable is "endogenous" when it is correlated with unobserved factors (the error term) that also affect the outcome. This causes ordinary regression (OLS) to give biased estimates of the causal effect.',
    example: 'Education level is endogenous in a wages regression — smarter or more motivated people both get more education AND earn higher wages, making it hard to isolate education\'s true effect on wages.',
    why_it_matters: 'If you use OLS with an endogenous treatment, your estimate will be biased (typically upward or downward). IV/2SLS corrects this by using the instrument to isolate only the variation in treatment that is "clean" (unrelated to the confounders).'
  },
  'instrumental variable': {
    title: 'Instrumental Variable (Instrument)',
    simple_explanation: 'An instrument is a variable that (1) strongly predicts the treatment variable, but (2) affects the outcome ONLY through the treatment — it has no direct effect on the outcome itself.',
    example: 'Draft lottery numbers are a classic instrument for military service in studies of veterans\' wages: lottery assignment strongly predicts who served, but the lottery number itself has no direct effect on wages other than through military service.',
    why_it_matters: 'A valid instrument lets you isolate the "clean" variation in treatment — the part driven only by the instrument, not by confounders. This allows you to estimate the causal effect even when randomised assignment was not possible.'
  },
  'exclusion restriction': {
    title: 'Exclusion Restriction',
    simple_explanation: 'The exclusion restriction is the assumption that the instrument affects the outcome ONLY through the treatment — it is "excluded" from the outcome equation. It cannot be statistically verified; it requires domain knowledge and careful justification.',
    example: 'If using quarter of birth as an instrument for education, the exclusion restriction means that being born in a particular quarter affects wages only because it affects how much schooling you get — not through any other channel (e.g., seasonal health effects at birth).',
    why_it_matters: 'Violating the exclusion restriction means your instrument is invalid and your 2SLS estimates will be biased. This is the most common and hardest-to-defend assumption in IV analyses.'
  },
  'two-stage least squares': {
    title: 'Two-Stage Least Squares (2SLS)',
    simple_explanation: '2SLS is the standard IV estimation method. Stage 1: regress the treatment on the instruments (and controls) to get predicted treatment values. Stage 2: regress the outcome on the predicted treatment values (and controls). The Stage 2 coefficient is the causal estimate.',
    example: 'To estimate the effect of education on wages using quarter-of-birth as an instrument: Stage 1 predicts education from quarter of birth. Stage 2 regresses wages on the predicted education. The coefficient is the IV estimate of returns to education.',
    why_it_matters: '2SLS produces a consistent estimate of the causal effect when the instrument is valid (relevant + excludable + independent). The standard errors must be computed correctly using the structural residuals, not the second-stage fitted residuals.'
  },
  'local average treatment effect': {
    title: 'Local Average Treatment Effect (LATE)',
    simple_explanation: 'With a binary instrument, 2SLS estimates the LATE — the causal effect for "compliers": units whose treatment status changes because of the instrument. This may differ from the Average Treatment Effect (ATE) for the full population.',
    example: 'In a study using a job-training lottery as an instrument for training participation, the LATE is the effect of training on wages for people who enrolled because they won the lottery — not for people who would have enrolled regardless or those who never would.',
    why_it_matters: 'Understanding LATE is crucial for interpreting 2SLS results. If compliers are not representative of the full population, the LATE may not generalise. You should assess whether compliers are the policy-relevant group for your research question.'
  },
  'sensitivity analysis in iv': {
    title: 'Sensitivity Analysis in IV',
    simple_explanation: 'Sensitivity analysis tests how robust your IV results are to potential violations of assumptions. For just-identified IV (1 instrument), this produces Anderson-Rubin confidence intervals that remain valid even with weak instruments. For over-identified IV (multiple instruments), it runs leave-one-out analysis to check if results depend on any single instrument.',
    example: 'If you have 3 instruments and the main 2SLS estimate is 0.5, leave-one-out analysis might show estimates of 0.48, 0.52, 0.49 when each instrument is dropped — confirming the result is not driven by one potentially invalid instrument.',
    why_it_matters: 'IV assumptions (especially exclusion restriction) cannot be fully tested. Sensitivity analysis builds credibility by showing results are stable. Weak-instrument-robust Anderson-Rubin CIs are particularly important when the first-stage F-statistic is below the Stock-Yogo threshold.'
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

