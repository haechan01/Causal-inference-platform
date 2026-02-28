import React from 'react';

interface ProgressStep {
  id: string;
  label: string;
  path: string;
}

interface BottomProgressBarProps {
  currentStep: string;
  steps: ProgressStep[];
  onPrev: () => void;
  onNext: () => void;
  canGoNext: boolean;
  onStepClick?: (stepPath: string) => void;
}

const BottomProgressBar: React.FC<BottomProgressBarProps> = ({
  currentStep,
  steps,
  onPrev,
  onNext,
  canGoNext,
  onStepClick
}) => {
  const currentStepIndex = steps.findIndex(step => step.id === currentStep);

  const handleStepClick = (step: ProgressStep, index: number) => {
    if (index < currentStepIndex && onStepClick) {
      onStepClick(step.path);
    }
  };

  return (
    <div style={styles.progressBar}>
      <div style={styles.progressContainer}>
        <button onClick={onPrev} style={styles.prevButton}>
          Previous
        </button>

        <div style={styles.stepsContainer}>
          {steps.map((step, index) => {
            const isCompleted = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isClickable = isCompleted;

            return (
              <React.Fragment key={step.id}>
                {/* Circle + label — wrapper is exactly circle-width so connectors touch the circles */}
                <div
                  style={{
                    ...styles.stepWrapper,
                    ...(isClickable ? styles.stepWrapperClickable : {})
                  }}
                  onClick={() => handleStepClick(step, index)}
                >
                  <div
                    style={{
                      ...styles.stepCircle,
                      ...(isCompleted || isCurrent
                        ? styles.stepCircleActive
                        : styles.stepCircleInactive)
                    }}
                  >
                    {isCompleted ? (
                      <span style={styles.checkmark}>✓</span>
                    ) : (
                      <span style={styles.stepNumber}>{index + 1}</span>
                    )}
                  </div>
                  {/* Label floats below without widening the wrapper */}
                  <span
                    style={{
                      ...styles.stepLabel,
                      ...(isCompleted || isCurrent
                        ? styles.stepLabelActive
                        : styles.stepLabelInactive)
                    }}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Connector — flex sibling, stretches to fill space between circles */}
                {index < steps.length - 1 && (
                  <div
                    style={{
                      ...styles.connector,
                      ...(isCompleted
                        ? styles.connectorActive
                        : styles.connectorInactive)
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <button
          onClick={onNext}
          style={{
            ...styles.nextButton,
            ...(canGoNext ? {} : styles.nextButtonDisabled)
          }}
          disabled={!canGoNext}
        >
          Next
        </button>
      </div>
    </div>
  );
};

const CIRCLE = 40; // circle width/height in px

const styles: Record<string, React.CSSProperties> = {
  progressBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTop: '1px solid #e0e0e0',
    /* extra top padding so labels (absolutely positioned above) are visible */
    padding: '28px 0 16px',
    zIndex: 100,
    boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.08)'
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    maxWidth: '960px',
    margin: '0 auto',
    padding: '0 24px',
    gap: '40px'
  },
  stepsContainer: {
    flex: 1,
    display: 'flex',
    /* top-align so connector margin-top aligns with circle center */
    alignItems: 'flex-start'
  },
  /*
   * Width is locked to the circle size.
   * The label is positioned absolutely so it doesn't stretch the flex item.
   * This guarantees connectors are placed flush against the circle edges.
   */
  stepWrapper: {
    width: `${CIRCLE}px`,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative'
  },
  stepWrapperClickable: {
    cursor: 'pointer'
  },
  stepCircle: {
    width: `${CIRCLE}px`,
    height: `${CIRCLE}px`,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 'bold',
    flexShrink: 0,
    transition: 'all 0.3s ease'
  },
  stepCircleActive: {
    backgroundColor: '#043873',
    color: 'white',
    boxShadow: '0 2px 8px rgba(4, 56, 115, 0.3)'
  },
  stepCircleInactive: {
    backgroundColor: '#e0e0e0',
    color: '#999'
  },
  stepNumber: {
    fontSize: '13px',
    fontWeight: 'bold'
  },
  checkmark: {
    fontSize: '15px',
    fontWeight: 'bold'
  },
  /* Label is absolutely positioned above the circle — doesn't affect flex width */
  stepLabel: {
    position: 'absolute',
    bottom: `${CIRCLE + 6}px`,
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '13px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    textAlign: 'center'
  },
  stepLabelActive: {
    color: '#043873'
  },
  stepLabelInactive: {
    color: '#999'
  },
  /* Connector: flex sibling between circles; margin-top centers it on the circle */
  connector: {
    flex: 1,
    height: '2px',
    marginTop: `${CIRCLE / 2 - 1}px`,
    transition: 'background-color 0.3s ease'
  },
  connectorActive: {
    backgroundColor: '#043873'
  },
  connectorInactive: {
    backgroundColor: '#e0e0e0'
  },
  prevButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '0 22px',
    height: '44px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(108, 117, 125, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    flexShrink: 0
  },
  nextButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '0 22px',
    height: '44px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(4, 56, 115, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    flexShrink: 0
  },
  nextButtonDisabled: {
    backgroundColor: '#e0e0e0',
    color: '#999',
    cursor: 'not-allowed',
    boxShadow: 'none'
  }
};

export default BottomProgressBar;
