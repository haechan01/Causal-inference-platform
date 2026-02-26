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
          &lt;
        </button>

        <div style={styles.stepsContainer}>
          {steps.map((step, index) => {
            const isCompleted = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isClickable = isCompleted;

            return (
              <div key={step.id} style={styles.stepContainer}>
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
                      ...(isCompleted || isCurrent ? styles.stepCircleActive : styles.stepCircleInactive),
                      ...(isClickable ? styles.stepCircleClickable : {})
                    }}
                  >
                    {isCompleted ? (
                      <span style={styles.checkmark}>✓</span>
                    ) : (
                      <span style={styles.stepNumber}>{index + 1}</span>
                    )}
                  </div>
                  <span
                    style={{
                      ...styles.stepLabel,
                      ...(isCompleted || isCurrent ? styles.stepLabelActive : styles.stepLabelInactive)
                    }}
                  >
                    {step.label}
                  </span>
                </div>

                {index < steps.length - 1 && (
                  <div
                    style={{
                      ...styles.connector,
                      ...(isCompleted ? styles.connectorActive : styles.connectorInactive)
                    }}
                  />
                )}
              </div>
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
          &gt;
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  progressBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTop: '1px solid #e0e0e0',
    padding: '20px 0',
    zIndex: 100,
    boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.1)'
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '0 20px',
    gap: '20px'
  },
  stepsContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30
  },
  stepContainer: {
    display: 'flex',
    alignItems: 'center',
    position: 'relative'
  },
  stepWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    zIndex: 2
  },
  stepWrapperClickable: {
    cursor: 'pointer'
  },
  stepCircle: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 'bold',
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
  stepCircleClickable: {
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
  },
  stepNumber: {
    fontSize: '12px',
    fontWeight: 'bold'
  },
  checkmark: {
    fontSize: '14px',
    fontWeight: 'bold'
  },
  stepLabel: {
    fontSize: '12px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    marginTop: '8px',
    textAlign: 'center'
  },
  stepLabelActive: {
    color: '#043873'
  },
  stepLabelInactive: {
    color: '#999'
  },
  connector: {
    position: 'absolute',
    top: '35%',
    left: 'calc(50% + 20px)',
    width: '40px',
    height: '2px',
    transform: 'translateY(-50%)',
    transition: 'all 0.3s ease',
    zIndex: 1
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
    borderRadius: '50%',
    width: '45px',
    height: '45px',
    fontSize: '18px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(108, 117, 125, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  nextButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '45px',
    height: '45px',
    fontSize: '18px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(4, 56, 115, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  nextButtonDisabled: {
    backgroundColor: '#e0e0e0',
    color: '#999',
    cursor: 'not-allowed'
  }
};

export default BottomProgressBar;
