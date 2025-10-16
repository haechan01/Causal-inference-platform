// src/components/ProjectsPage.tsx
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import DataManagement from './DataManagement';
import Navbar from './Navbar';
import { LoginButton, SignUpButton } from './buttons';

const ProjectsPage: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

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
      <Navbar />
      <div style={styles.contentContainer}>
        <DataManagement />
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
  }
};

export default ProjectsPage;
