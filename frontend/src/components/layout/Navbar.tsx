import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoginButton, SignUpButton, LogoutButton, Logo } from '../buttons';

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
                  Home
                </button>
                <button onClick={handleDataClick} style={styles.navButton}>
                  Data
                </button>
                <button onClick={handleProjectsClick} style={styles.navButton}>
                  Projects
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

const styles: Record<string, React.CSSProperties> = {
    navbar: {
      position: 'fixed',
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
    }
  };
