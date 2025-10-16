// src/components/Dashboard.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Dashboard: React.FC = () => {
  // Get user data and logout function from auth context
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Welcome to Your Dashboard</h1>
        <button onClick={handleLogout} style={styles.logoutButton}>
          Logout
        </button>
      </div>
      
      <div style={styles.content}>
        <div style={styles.userInfo}>
          <h2 style={styles.userTitle}>User Information</h2>
          <div style={styles.userDetails}>
            <p style={styles.userDetail}>
              <strong>ID:</strong> {user?.id}
            </p>
            <p style={styles.userDetail}>
              <strong>Username:</strong> {user?.username}
            </p>
            <p style={styles.userDetail}>
              <strong>Email:</strong> {user?.email}
            </p>
          </div>
        </div>
        
        <div style={styles.features}>
          <h2 style={styles.featuresTitle}>Available Features</h2>
          <div style={styles.featureList}>
            <div 
              style={styles.featureItem}
              onClick={() => navigate('/projects')}
            >
              <h3 style={styles.featureTitle}>📁 Data Management</h3>
              <p style={styles.featureDescription}>
                Upload and manage your CSV files for analysis
              </p>
              <button style={styles.featureButton}>
                Go to Data Management →
              </button>
            </div>
            <div style={styles.featureItem}>
              <h3 style={styles.featureTitle}>🔬 Data Analysis</h3>
              <p style={styles.featureDescription}>
                Run causal inference analysis on your data
              </p>
              <button style={styles.featureButtonDisabled} disabled>
                Coming Soon
              </button>
            </div>
            <div style={styles.featureItem}>
              <h3 style={styles.featureTitle}>📊 Reports</h3>
              <p style={styles.featureDescription}>
                View and download analysis reports
              </p>
              <button style={styles.featureButtonDisabled} disabled>
                Coming Soon
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Styles object
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    marginBottom: '20px'
  },
  headerButtons: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center'
  },
  backButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    margin: 0
  },
  logoutButton: {
    backgroundColor: '#dc3545',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  content: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: '20px'
  },
  userInfo: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
  },
  userTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px',
    marginTop: 0
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px'
  },
  userDetail: {
    fontSize: '16px',
    color: '#555',
    margin: 0,
    padding: '8px 0',
    borderBottom: '1px solid #eee'
  },
  features: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
  },
  featuresTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px',
    marginTop: 0
  },
  featureList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px'
  },
  featureItem: {
    padding: '20px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative' as const
  },
  featureTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '8px',
    marginTop: 0
  },
  featureDescription: {
    fontSize: '14px',
    color: '#666',
    margin: '0 0 15px 0'
  },
  featureButton: {
    backgroundColor: '#4F9CF9',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  featureButtonDisabled: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'not-allowed',
    opacity: 0.6
  }
};

export default Dashboard;
