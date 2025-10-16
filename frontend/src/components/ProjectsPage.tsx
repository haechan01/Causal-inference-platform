// src/components/ProjectsPage.tsx
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DataManagement from './DataManagement';
import Navbar from './Navbar';
import { LoginButton, SignUpButton, NavigationButton } from './buttons';
import { NavigationButtonConfig } from '../types/buttons';

const ProjectsPage: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [isReadyForNext, setIsReadyForNext] = useState(false);

  // Navigation button configurations for this page
  const prevButtonConfig: NavigationButtonConfig = {
    to: '/',
    text: '<',
    style: styles.prevButton
  };

  const nextButtonConfig: NavigationButtonConfig = {
    to: '/method-selection',
    text: '>',
    style: styles.nextButton
  };

  // Handle when DataManagement is ready for next step
  const handleReadyForNext = (ready: boolean) => {
    setIsReadyForNext(ready);
  };

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner}></div>
        <p style={styles.loadingText}>Loading...</p>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return (
      <div style={styles.authRequired}>
        <div style={styles.authCard}>
          <h2 style={styles.authTitle}>Authentication Required</h2>
          <p style={styles.authMessage}>
            Please log in or sign up to access your projects and start analysis.
          </p>
          <div style={styles.authButtons}>
            <LoginButton />
            <SignUpButton />
          </div>
        </div>
      </div>
    );
  }

  // Show data management interface for authenticated users
  return (
    <div>
      <style>
        {`
          @keyframes slideInFromRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
      <Navbar />
      <div style={styles.contentContainer}>
        <div style={styles.mainContent}>
          <DataManagement onReadyForNext={handleReadyForNext} />
        </div>
        
        {/* Navigation buttons at the bottom */}
        <div style={styles.navigationContainer}>
          <div style={styles.prevButtonContainer}>
            <NavigationButton config={prevButtonConfig} />
          </div>
          
          {isReadyForNext && (
            <div style={styles.nextButtonContainer}>
              <NavigationButton config={nextButtonConfig} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5'
  },
  contentContainer: {
    paddingTop: '70px', // Account for fixed navbar height
    minHeight: 'calc(100vh - 70px)', // Full height minus navbar
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
    alignItems: 'center',
    animation: 'slideInFromRight 0.3s ease-out'
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e0e0e0',
    padding: '20px 0'
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px',
    textAlign: 'center' as const
  },
  title: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0'
  },
  subtitle: {
    fontSize: '18px',
    color: '#666',
    margin: 0
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5'
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px'
  },
  loadingText: {
    fontSize: '18px',
    color: '#666',
    margin: 0
  },
  authRequired: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: '20px'
  },
  authCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as const,
    maxWidth: '400px',
    width: '100%'
  },
  authTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 15px 0'
  },
  authMessage: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 30px 0',
    lineHeight: '1.5'
  },
  authButtons: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center'
  },
  loginButton: {
    backgroundColor: '#FFE492',
    color: '#043873',
    border: 'none',
    borderRadius: '6px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  signupButton: {
    backgroundColor: '#4F9CF9',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
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
};

export default ProjectsPage;
