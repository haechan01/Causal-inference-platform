// src/components/LandingPage.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleStartAnalysis = () => {
    navigate('/projects');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  const handleSignUp = () => {
    navigate('/signup');
  };

  return (
    <div style={styles.container}>
      {/* Navigation Bar */}
      <nav style={styles.navbar}>
        <div style={styles.navContent}>
          <div style={styles.logo}>
            <h1 style={styles.logoText}>CausalFlow</h1>
          </div>
          <div style={styles.navButtons}>
            <button 
              onClick={handleLogin} 
              style={styles.navButton}
            >
              Login
            </button>
            <button 
              onClick={handleSignUp} 
              style={styles.signUpButton}
            >
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main style={styles.hero}>
        <div style={styles.heroContent}>
          <h1 style={styles.heroTitle}>
            Find answers to your causal questions
          </h1>
          <p style={styles.heroSubtitle}>
            Upload your data, run causal inference analysis, and discover 
            the true relationships in your data with our powerful AI platform.
          </p>
          <button 
            onClick={handleStartAnalysis}
            style={styles.ctaButton}
          >
            Start Analysis
          </button>
        </div>
      </main>

      {/* Features Section */}
      <section style={styles.features}>
        <div style={styles.featuresContent}>
          <h2 style={styles.featuresTitle}>Why Choose CausalFlow?</h2>
          <div style={styles.featuresGrid}>
            <div style={styles.featureCard}>
              <div style={styles.featureIcon}>📊</div>
              <h3 style={styles.featureTitle}>Advanced Analytics</h3>
              <p style={styles.featureDescription}>
                State-of-the-art causal inference methods to uncover true causal relationships
              </p>
            </div>
            <div style={styles.featureCard}>
              <div style={styles.featureIcon}>🚀</div>
              <h3 style={styles.featureTitle}>Easy to Use</h3>
              <p style={styles.featureDescription}>
                Intuitive interface that makes complex analysis accessible to everyone
              </p>
            </div>
            <div style={styles.featureCard}>
              <div style={styles.featureIcon}>🔒</div>
              <h3 style={styles.featureTitle}>Secure & Private</h3>
              <p style={styles.featureDescription}>
                Your data is encrypted and secure. We never share your information
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <p style={styles.footerText}>
            © 2024 CausalFlow. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

// Styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#043873',
    color: 'white',
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
  hero: {
    paddingTop: '70px',
    minHeight: '100vh',
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
    backgroundColor: '#0a4a8a'
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
    color: 'white'
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '40px',
    marginTop: '60px'
  },
  featureCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    padding: '40px 30px',
    textAlign: 'center' as const,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    transition: 'all 0.3s ease'
  },
  featureIcon: {
    fontSize: '48px',
    marginBottom: '20px'
  },
  featureTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: 'white',
    margin: '0 0 15px 0'
  },
  featureDescription: {
    fontSize: '16px',
    color: '#b0b0b0',
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

export default LandingPage;
