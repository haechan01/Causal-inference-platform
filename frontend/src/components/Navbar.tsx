import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoginButton, SignUpButton, LogoutButton, Logo } from './buttons';

const Navbar: React.FC = () => {
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();
    
    const handleHomeClick = () => {
      navigate('/');
    };
    
    const handleDataClick = () => {
      navigate('/upload-data');
    };
    
    const handleProjectsClick = () => {
      navigate('/projects');
    };
    
    return (
    <nav style={styles.navbar}>
        <div style={styles.navContent}>
          <div style={styles.logo}>
            <Logo style={styles.logoText} />
          </div>
          <div style={styles.navButtons}>
            {isAuthenticated ? (
              <>
                <button onClick={handleHomeClick} style={styles.homeButton}>
                  🏠 Home
                </button>
                <button onClick={handleDataClick} style={styles.navButton}>
                  📊 Data
                </button>
                <button onClick={handleProjectsClick} style={styles.navButton}>
                  📁 Projects
                </button>
                <LogoutButton style={styles.logoutButton} />
              </>
            ) : (
              <>
                <LoginButton style={styles.navButton} />
                <SignUpButton style={styles.signUpButton} />
              </>
            )}
          </div>
        </div>
      </nav>
    );
};

export default Navbar;

// Styles
const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#043873',
      color: 'black',
      fontFamily: 'Arial, sans-serif'
    },
    navbar: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(4, 56, 115, 0.95)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      zIndex: 1000
    },
    navContent: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '0 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      height: '70px'
    },
    logo: {
      display: 'flex',
      alignItems: 'center'
    },
    logoText: {
      fontSize: '28px',
      fontWeight: 'bold',
      color: 'white',
      margin: 0,
      letterSpacing: '-0.5px'
    },
    navButtons: {
      display: 'flex',
      gap: '15px',
      alignItems: 'center'
    },
    homeButton: {
      backgroundColor: '#FFE492',
      color: '#043873',
      border: 'none',
      borderRadius: '6px',
      padding: '10px 20px',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      textDecoration: 'none'
    },
    navButton: {
      backgroundColor: 'transparent',
      color: 'white',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: '6px',
      padding: '10px 20px',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      textDecoration: 'none'
    },
    signUpButton: {
      backgroundColor: '#4F9CF9',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      padding: '10px 20px',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    },
    welcomeText: {
      color: 'white',
      fontSize: '16px',
      fontWeight: '500',
      marginRight: '10px'
    },
    logoutButton: {
      backgroundColor: '#dc3545',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      padding: '10px 20px',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    },
    hero: {
      paddingTop: '70px',
      minHeight: '70vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #043873 0%, #0a4a8a 50%, #1565c0 100%)',
      position: 'relative' as const
    },
    heroContent: {
      textAlign: 'center' as const,
      maxWidth: '800px',
      padding: '0 20px',
      zIndex: 2
    },
    heroTitle: {
      fontSize: '64px',
      fontWeight: 'bold',
      margin: '0 0 20px 0',
      background: 'linear-gradient(135deg, #ffffff 0%, #a8a8a8 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      lineHeight: '1.1'
    },
    heroSubtitle: {
      fontSize: '20px',
      color: '#b0b0b0',
      margin: '0 0 40px 0',
      lineHeight: '1.6',
      maxWidth: '600px',
      marginLeft: 'auto',
      marginRight: 'auto'
    },
    ctaButton: {
      backgroundColor: '#FFE492',
      color: '#043873',
      border: 'none',
      borderRadius: '8px',
      padding: '16px 32px',
      fontSize: '18px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 15px rgba(255, 228, 146, 0.3)',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px'
    },
    features: {
      padding: '100px 0',
      backgroundColor: 'white'
    },
    featuresContent: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '0 20px'
    },
    featuresTitle: {
      fontSize: '48px',
      fontWeight: 'bold',
      textAlign: 'center' as const,
      margin: '0 0 60px 0',
      color: '#043873'
    },
    featuresGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '40px',
      marginTop: '60px'
    },
    featureCard: {
      backgroundColor: '#f8f9fa',
      borderRadius: '12px',
      padding: '40px 30px',
      textAlign: 'center' as const,
      border: '1px solid #e9ecef',
      transition: 'all 0.3s ease',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
    },
    featureIcon: {
      fontSize: '48px',
      marginBottom: '20px'
    },
    featureTitle: {
      fontSize: '24px',
      fontWeight: 'bold',
      color: '#043873',
      margin: '0 0 15px 0'
    },
    featureDescription: {
      fontSize: '16px',
      color: '#666666',
      lineHeight: '1.6',
      margin: 0
    },
    footer: {
      backgroundColor: '#043873',
      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
      padding: '40px 0'
    },
    footerContent: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '0 20px',
      textAlign: 'center' as const
    },
    footerText: {
      color: '#666',
      fontSize: '14px',
      margin: 0
    }
  };

  

