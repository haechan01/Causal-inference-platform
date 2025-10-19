import React from 'react';

interface ProgressStep {
  id: string;
  label: string;
  path: string;
}

interface ProgressBarProps {
  currentStep: string;
  steps: ProgressStep[];
}

const ProgressBar: React.FC<ProgressBarProps> = ({ currentStep, steps }) => {
  const currentStepIndex = steps.findIndex(step => step.id === currentStep);
  
  return (
    <div style={styles.progressBar}>
      <div style={styles.progressContainer}>
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          const isFuture = index > currentStepIndex;
          
          return (
            <div key={step.id} style={styles.stepContainer}>
              <div style={styles.stepWrapper}>
                <div
                  style={{
                    ...styles.stepCircle,
                    ...(isCompleted || isCurrent ? styles.stepCircleActive : styles.stepCircleInactive)
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
              
              {/* Connector line */}
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
    </div>
  );
};

const styles = {
  progressBar: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e0e0e0',
    padding: '15px 0',
    position: 'sticky' as const,
    top: '70px', // Below navbar
    zIndex: 100,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px'
  },
  stepContainer: {
    display: 'flex',
    alignItems: 'center',
    flex: 1
  },
  stepWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    position: 'relative' as const,
    zIndex: 2
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
    marginBottom: '8px',
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
    fontSize: '14px',
    fontWeight: 'bold'
  },
  checkmark: {
    fontSize: '16px',
    fontWeight: 'bold'
  },
  stepLabel: {
    fontSize: '12px',
    fontWeight: '500',
    textAlign: 'center' as const,
    maxWidth: '80px',
    lineHeight: '1.2'
  },
  stepLabelActive: {
    color: '#043873'
  },
  stepLabelInactive: {
    color: '#999'
  },
  connector: {
    height: '2px',
    flex: 1,
    margin: '0 10px',
    marginTop: '-20px', // Align with circle center
    transition: 'all 0.3s ease'
  },
  connectorActive: {
    backgroundColor: '#043873'
  },
  connectorInactive: {
    backgroundColor: '#e0e0e0'
  }
};

export default ProgressBar;
