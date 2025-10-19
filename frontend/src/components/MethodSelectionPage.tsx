import React, { useState } from 'react';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';


const MethodSelectionPage: React.FC = () => {
    const { currentStep, steps, goToPreviousStep, goToNextStep } = useProgressStep();
    const [selectedMethod, setSelectedMethod] = useState<string>('');

    return (
        <div>
            <Navbar />
            <div style={styles.contentContainer}>
                <div style={styles.mainContent}>
                    <div style={styles.selectionCard}>
                        <h2 style={styles.title}>Select Analysis Method</h2>
                        <select 
                            style={styles.select}
                            value={selectedMethod}
                            onChange={(e) => setSelectedMethod(e.target.value)}
                        >
                            <option value="">Choose a method...</option>
                            <option value="did">Difference-in-Differences</option>
                            <option value="rdd">Regression Discontinuity Design</option>
                            <option value="iv">Instrumental Variables</option>
                        </select>
                    </div>
                </div>
                
            </div>
            
            {/* Bottom Progress Bar */}
            <BottomProgressBar
                currentStep={currentStep}
                steps={steps}
                onPrev={goToPreviousStep}
                onNext={goToNextStep}
                canGoNext={selectedMethod !== ''}
            />
        </div>
    )
}

export default MethodSelectionPage;

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
    selectionCard: {
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '30px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '600px'
    },
    title: {
        fontSize: '24px',
        fontWeight: 'bold',
        color: '#043873',
        margin: '0 0 20px 0'
    },
    select: {
        width: '100%',
        padding: '12px',
        fontSize: '16px',
        border: '2px solid #e0e0e0',
        borderRadius: '8px',
        backgroundColor: 'white',
        cursor: 'pointer'
    },
}