import React from 'react';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';

const ResultsPage: React.FC = () => {
  const { currentStep, steps, goToPreviousStep, goToNextStep } = useProgressStep();

  return (
    <div>
      <Navbar />
      <div style={styles.contentContainer}>
        <div style={styles.mainContent}>
          <div style={styles.resultsCard}>
            <h2 style={styles.title}>Analysis Complete!</h2>
            <p style={styles.description}>
              Your causal analysis has been completed successfully. 
              The results are ready for review.
            </p>
            <div style={styles.resultsPlaceholder}>
              <div style={styles.placeholderIcon}>📊</div>
              <p style={styles.placeholderText}>Results will be displayed here</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Progress Bar */}
      <BottomProgressBar
        currentStep={currentStep}
        steps={steps}
        onPrev={goToPreviousStep}
        onNext={goToNextStep}
        canGoNext={true} // Always allow next on results page
      />
    </div>
  );
};

export default ResultsPage;

const styles = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '80px', // Account for fixed bottom progress bar
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5'
  },
  mainContent: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    flex: 1,
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const
  },
  resultsCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    width: '100%',
    maxWidth: '600px',
    textAlign: 'center' as const
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 15px 0'
  },
  description: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 30px 0',
    lineHeight: '1.5'
  },
  resultsPlaceholder: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '40px',
    border: '2px dashed #e0e0e0'
  },
  placeholderIcon: {
    fontSize: '48px',
    marginBottom: '15px'
  },
  placeholderText: {
    fontSize: '16px',
    color: '#999',
    margin: 0
  }
};