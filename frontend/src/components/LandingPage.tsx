// src/components/LandingPage.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from './Navbar';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleStartAnalysis = () => {
    navigate('/upload-data');
  };

  return (
    <div style={styles.container}>
      <Navbar />

      {/* Hero Section */}
      <main style={styles.hero}>
        <div style={styles.heroContent}>
          <div style={styles.heroBadge}>🚀 Beyond Correlation</div>
          <h1 style={styles.heroTitle}>
            Discover the <span style={styles.highlight}>True Impact</span> of Your Decisions
          </h1>
          <p style={styles.heroSubtitle}>
            Stop guessing with simple correlations. Our AI-powered platform helps you uncover
            true causal relationships in your data, empowering you to make decisions with confidence.
          </p>
          <button
            onClick={handleStartAnalysis}
            style={styles.ctaButton}
          >
            Start Free Analysis
          </button>
          <p style={styles.noCreditCard}>Easy setup • No credit card required</p>
        </div>
      </main>

      {/* Why Causal Inference Section */}
      <section style={styles.section}>
        <div style={styles.contentWrapper}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Why Causal Inference?</h2>
            <p style={styles.sectionSubtitle}>
              To make effective changes, you need to know what actually <em>causes</em> an outcome,
              not just what happens to occur with it.
            </p>
          </div>

          <div style={styles.comparisonGrid}>
            <div style={styles.comparisonCard}>
              <div style={styles.cardHeaderRed}>Standard Analytics</div>
              <div style={styles.cardBody}>
                <div style={styles.iconLarge}>📉</div>
                <h3 style={styles.cardTitle}>Correlation</h3>
                <p style={styles.cardText}>"Ice cream sales and shark attacks both go up in summer."</p>
                <div style={styles.flawBox}>
                  <strong>The Flaw:</strong> Leads to wrong conclusions (e.g., banning ice cream to stop shark attacks).
                </div>
              </div>
            </div>

            <div style={styles.arrowContainer}>
              <div style={styles.arrowRight}>➔</div>
            </div>

            <div style={styles.comparisonCard}>
              <div style={styles.cardHeaderGreen}>CausAl Studio</div>
              <div style={styles.cardBody}>
                <div style={styles.iconLarge}>🎯</div>
                <h3 style={styles.cardTitle}>Causation</h3>
                <p style={styles.cardText}>"Heat waves cause both ice cream sales and shark attacks."</p>
                <div style={styles.benefitBox}>
                  <strong>The Solution:</strong> Identifies the root cause (Temperature) so you can act effectively.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Assistant Section */}
      <section style={styles.sectionAlt}>
        <div style={styles.contentWrapper}>
          <div style={styles.splitLayout}>
            <div style={styles.splitContent}>
              <div style={styles.badge}>New Feature</div>
              <h2 style={styles.sectionTitleLeft}>Your Personal AI Data Scientist</h2>
              <p style={styles.textLeft}>
                Causal inference is complex, but using it shouldn't be. Our intelligent AI assistant guides you through every step of the process.
              </p>
              <ul style={styles.featureList}>
                <li style={styles.featureItem}>
                  <span style={styles.checkIcon}>✓</span>
                  <span><strong>Automatic Validation:</strong> Checks your assumptions before you run models.</span>
                </li>
                <li style={styles.featureItem}>
                  <span style={styles.checkIcon}>✓</span>
                  <span><strong>Plain English Results:</strong> No cryptic statistical jargon. Just clear answers.</span>
                </li>
                <li style={styles.featureItem}>
                  <span style={styles.checkIcon}>✓</span>
                  <span><strong>Smart Recommendations:</strong> Suggests the best methods for your specific data.</span>
                </li>
              </ul>
            </div>
            <div style={styles.splitImage}>
              <div style={styles.aiCard}>
                <div style={styles.aiHeader}>
                  <div style={styles.botIcon}>🤖</div>
                  <div style={styles.botName}>CausAl Studio AI</div>
                </div>
                <div style={styles.chatMessage}>
                  "I noticed your data has a time component. I recommend using the <strong>Difference-in-Differences</strong> method to account for temporal trends."
                </div>
                <div style={styles.chatMessageUser}>
                  "That connects perfectly with my goal. Let's proceed!"
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section style={styles.section}>
        <div style={styles.contentWrapper}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>From Data to Insights in 4 Steps</h2>
            <p style={styles.sectionSubtitle}>
              Our streamlined workflow handles the complexity so you can focus on the results.
            </p>
          </div>

          <div style={styles.processContainer}>
            {/* Step 1 */}
            <div style={styles.processStep}>
              <div style={styles.stepNumber}>1</div>
              <div style={styles.stepIcon}>📂</div>
              <h3 style={styles.stepTitle}>Upload Data</h3>
              <p style={styles.stepDescription}>Upload your dataset securely in CSV format.</p>
            </div>

            <div style={styles.processArrow}>→</div>

            {/* Step 2 */}
            <div style={styles.processStep}>
              <div style={styles.stepNumber}>2</div>
              <div style={styles.stepIcon}>⚙️</div>
              <h3 style={styles.stepTitle}>Select Method</h3>
              <p style={styles.stepDescription}>Choose from advanced causal inference methods.</p>
            </div>

            <div style={styles.processArrow}>→</div>

            {/* Step 3 */}
            <div style={styles.processStep}>
              <div style={styles.stepNumber}>3</div>
              <div style={styles.stepIcon}>🎛️</div>
              <h3 style={styles.stepTitle}>Define Variables</h3>
              <p style={styles.stepDescription}>Select treatment, outcome, and controls.</p>
            </div>

            <div style={styles.processArrow}>→</div>

            {/* Step 4 */}
            <div style={styles.processStep}>
              <div style={styles.stepNumber}>4</div>
              <div style={styles.stepIcon}>✨</div>
              <h3 style={styles.stepTitle}>View Results</h3>
              <p style={styles.stepDescription}>Get clear, actionable causal insights.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={styles.ctaSection}>
        <div style={styles.ctaContent}>
          <h2 style={styles.ctaTitle}>Ready to explore your data?</h2>
          <button
            onClick={handleStartAnalysis}
            style={styles.ctaButtonLarge}
          >
            Start Your Project Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <p style={styles.footerText}>
            © 2025 CausAl Studio. All rights reserved.
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
    backgroundColor: '#fff',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    overflowX: 'hidden' as const
  },
  hero: {
    paddingTop: '60px',
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #043873 0%, #064b96 100%)',
    position: 'relative' as const,
    color: 'white',
    paddingBottom: '40px'
  },
  heroContent: {
    textAlign: 'center' as const,
    maxWidth: '900px',
    padding: '0 20px',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center'
  },
  heroBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '16px',
    letterSpacing: '0.5px',
    border: '1px solid rgba(255, 255, 255, 0.2)'
  },
  heroTitle: {
    fontSize: '56px',
    fontWeight: '800',
    margin: '0 0 16px 0',
    lineHeight: '1.1',
    letterSpacing: '-1px'
  },
  highlight: {
    color: '#FFE492',
    position: 'relative' as const
  },
  heroSubtitle: {
    fontSize: '20px',
    color: '#e0e0e0',
    margin: '0 0 40px 0',
    lineHeight: '1.6',
    maxWidth: '640px',
    fontWeight: '400'
  },
  ctaButton: {
    backgroundColor: '#FFE492',
    color: '#043873',
    border: 'none',
    borderRadius: '8px',
    padding: '18px 40px',
    fontSize: '18px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
    marginBottom: '16px'
  },
  noCreditCard: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: '0'
  },
  section: {
    padding: '100px 0',
    backgroundColor: 'white'
  },
  sectionAlt: {
    padding: '100px 0',
    backgroundColor: '#f8fafc'
  },
  contentWrapper: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 24px'
  },
  sectionHeader: {
    textAlign: 'center' as const,
    marginBottom: '60px',
    maxWidth: '700px',
    marginLeft: 'auto',
    marginRight: 'auto'
  },
  sectionTitle: {
    fontSize: '36px',
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: '16px',
    letterSpacing: '-0.5px'
  },
  sectionSubtitle: {
    fontSize: '18px',
    color: '#64748b',
    lineHeight: '1.6'
  },

  // Comparison Grid
  comparisonGrid: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '40px',
    flexWrap: 'wrap' as const
  },
  comparisonCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    flex: 1,
    minWidth: '300px',
    maxWidth: '400px',
    border: '1px solid #e2e8f0'
  },
  cardHeaderRed: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px',
    textAlign: 'center' as const,
    fontWeight: '700',
    fontSize: '14px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px'
  },
  cardHeaderGreen: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '12px',
    textAlign: 'center' as const,
    fontWeight: '700',
    fontSize: '14px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px'
  },
  cardBody: {
    padding: '32px'
  },
  iconLarge: {
    fontSize: '48px',
    marginBottom: '16px',
    textAlign: 'center' as const
  },
  cardTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '12px',
    textAlign: 'center' as const
  },
  cardText: {
    fontSize: '16px',
    color: '#475569',
    lineHeight: '1.5',
    marginBottom: '24px',
    textAlign: 'center' as const,
    fontStyle: 'italic'
  },
  flawBox: {
    backgroundColor: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '14px',
    color: '#991b1b',
    lineHeight: '1.4'
  },
  benefitBox: {
    backgroundColor: '#F0FDF4',
    border: '1px solid #BBF7D0',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '14px',
    color: '#166534',
    lineHeight: '1.4'
  },
  arrowContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  arrowRight: {
    fontSize: '40px',
    color: '#94a3b8',
    fontWeight: 'bold'
  },

  // AI Section
  splitLayout: {
    display: 'flex',
    alignItems: 'center',
    gap: '60px',
    flexWrap: 'wrap' as const
  },
  splitContent: {
    flex: 1,
    minWidth: '300px'
  },
  splitImage: {
    flex: 1,
    minWidth: '300px'
  },
  badge: {
    display: 'inline-block',
    backgroundColor: '#e0f2fe',
    color: '#0284c7',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase' as const,
    marginBottom: '20px',
    letterSpacing: '0.5px'
  },
  sectionTitleLeft: {
    fontSize: '42px',
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: '20px',
    lineHeight: '1.1'
  },
  textLeft: {
    fontSize: '18px',
    color: '#64748b',
    lineHeight: '1.6',
    marginBottom: '32px'
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: 0
  },
  featureItem: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
    fontSize: '16px',
    color: '#334155',
    lineHeight: '1.5'
  },
  checkIcon: {
    color: '#043873',
    fontWeight: 'bold'
  },

  // AI Card Mockup
  aiCard: {
    backgroundColor: 'white',
    borderRadius: '20px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    padding: '24px',
    border: '1px solid #e2e8f0',
    maxWidth: '450px',
    margin: '0 auto'
  },
  aiHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
    borderBottom: '1px solid #f1f5f9',
    paddingBottom: '16px'
  },
  botIcon: {
    fontSize: '24px',
    backgroundColor: '#f0f9ff',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '10px'
  },
  botName: {
    fontWeight: '700',
    color: '#0f172a'
  },
  chatMessage: {
    backgroundColor: '#f1f5f9',
    padding: '16px',
    borderRadius: '12px 12px 12px 2px',
    color: '#334155',
    marginBottom: '16px',
    lineHeight: '1.5',
    fontSize: '15px'
  },
  chatMessageUser: {
    backgroundColor: '#043873',
    color: 'white',
    padding: '16px',
    borderRadius: '12px 12px 2px 12px',
    marginBottom: '0',
    lineHeight: '1.5',
    fontSize: '15px',
    textAlign: 'right' as const
  },

  // Process Section
  processContainer: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: '20px',
    flexWrap: 'wrap' as const,
    marginTop: '40px'
  },
  processStep: {
    flex: 1,
    minWidth: '200px',
    maxWidth: '250px',
    textAlign: 'center' as const,
    padding: '20px',
    position: 'relative' as const
  },
  stepNumber: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#FFE492',
    color: '#043873',
    fontWeight: 'bold',
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px auto'
  },
  stepIcon: {
    fontSize: '40px',
    marginBottom: '16px'
  },
  stepTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '8px'
  },
  stepDescription: {
    fontSize: '14px',
    color: '#64748b',
    lineHeight: '1.5',
    margin: 0
  },
  processArrow: {
    fontSize: '24px',
    color: '#cbd5e1',
    fontWeight: 'bold',
    marginTop: '60px',
    display: 'block'
  },

  // CTA Section
  ctaSection: {
    padding: '100px 20px',
    backgroundColor: '#043873',
    textAlign: 'center' as const,
    color: 'white'
  },
  ctaContent: {
    maxWidth: '800px',
    margin: '0 auto'
  },
  ctaTitle: {
    fontSize: '48px',
    fontWeight: '800',
    marginBottom: '24px'
  },
  ctaText: {
    fontSize: '20px',
    color: '#cbd5e1',
    marginBottom: '40px'
  },
  ctaButtonLarge: {
    backgroundColor: '#FFE492',
    color: '#043873',
    border: 'none',
    borderRadius: '8px',
    padding: '20px 48px',
    fontSize: '20px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
  },

  footer: {
    backgroundColor: '#022c5e',
    padding: '40px 0',
    textAlign: 'center' as const
  },
  footerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px'
  },
  footerText: {
    color: '#94a3b8',
    fontSize: '14px'
  }
};

export default LandingPage;
