import React from 'react';
import Navbar from './Navbar';
import { NavigationButton } from './buttons';
import { NavigationButtonConfig } from '../types/buttons';


const MethodSelectionPage: React.FC = () => {
    // Navigation button configurations for this page
    const prevButtonConfig: NavigationButtonConfig = {
        to: '/projects',
        text: '<',
        style: styles.prevButton
    };

    const nextButtonConfig: NavigationButtonConfig = {
        to: '/analysis', // This would be your next page
        text: '>',
        style: styles.nextButton
    };

    return (
        <div>
            <Navbar />
            <div style={styles.contentContainer}>
                <div style={styles.mainContent}>
                    <div style={styles.selectionCard}>
                        <h2 style={styles.title}>Select Analysis Method</h2>
                        <select style={styles.select}>
                            <option value="did">Difference-in-Differences</option>
                            <option value="rdd">Regression Discontinuity Design</option>
                            <option value="iv">Instrumental Variables</option>
                        </select>
                    </div>
                </div>
                
                {/* Navigation buttons at the bottom */}
                <div style={styles.navigationContainer}>
                    <div style={styles.prevButtonContainer}>
                        <NavigationButton config={prevButtonConfig} />
                    </div>
                    
                    <div style={styles.nextButtonContainer}>
                        <NavigationButton config={nextButtonConfig} />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default MethodSelectionPage;

const styles = {
    contentContainer: {
        paddingTop: '70px',
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
    navigationContainer: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 20px 20px 20px',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box' as const
    },
    prevButtonContainer: {
        display: 'flex',
        alignItems: 'center'
    },
    nextButtonContainer: {
        display: 'flex',
        alignItems: 'center'
    },
    prevButton: {
        backgroundColor: '#6c757d',
        color: 'white',
        border: 'none',
        borderRadius: '50%',
        width: '50px',
        height: '50px',
        fontSize: '20px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        boxShadow: '0 4px 15px rgba(108, 117, 125, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '&:hover': {
            backgroundColor: '#5a6268',
            transform: 'scale(1.1)',
            boxShadow: '0 6px 20px rgba(108, 117, 125, 0.4)'
        }
    },
    nextButton: {
        backgroundColor: '#043873',
        color: 'white',
        border: 'none',
        borderRadius: '50%',
        width: '50px',
        height: '50px',
        fontSize: '20px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        boxShadow: '0 4px 15px rgba(4, 56, 115, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '&:hover': {
            backgroundColor: '#0a4a8a',
            transform: 'scale(1.1)',
            boxShadow: '0 6px 20px rgba(4, 56, 115, 0.4)'
        }
    }
}