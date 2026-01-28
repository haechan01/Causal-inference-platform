import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import { aiService, MethodRecommendation } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import { projectStateService } from '../services/projectStateService';

const MethodSelectionPage: React.FC = () => {
    const { currentStep, steps, goToPreviousStep } = useProgressStep();
    const { accessToken } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [selectedMethod, setSelectedMethod] = useState<string>('');

    // AI aid section state
    const [showAIAid, setShowAIAid] = useState(false);

    // Get project info from navigation state (with state management for fallback)
    const [projectId, setProjectId] = useState<number | null>((location.state as any)?.projectId || null);
    const [datasetId, setDatasetId] = useState<number | null>((location.state as any)?.datasetId || null);

    // Load saved state when page opens
    useEffect(() => {
        const loadSavedState = async () => {
            // Try to get projectId from URL params if not in location state
            let currentProjectId = projectId;
            if (!currentProjectId) {
                const urlParams = new URLSearchParams(location.search);
                currentProjectId = parseInt(urlParams.get('projectId') || '0') || null;
                if (currentProjectId) {
                    setProjectId(currentProjectId);
                }
            }

            if (currentProjectId && accessToken) {
                try {
                    const project = await projectStateService.loadProject(currentProjectId, accessToken);
                    if (project.selectedMethod) {
                        setSelectedMethod(project.selectedMethod);
                    }
                    // Get datasetId from project if not set
                    if (!datasetId && project.datasets && project.datasets.length > 0) {
                        setDatasetId(project.datasets[0].id);
                    }
                } catch (error) {
                    console.error('Failed to load project state:', error);
                }
            }
        };
        loadSavedState();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, accessToken, location.search]);

    const [treatmentVariable, setTreatmentVariable] = useState('');
    const [outcomeVariable, setOutcomeVariable] = useState('');
    const [isTimeSeries, setIsTimeSeries] = useState(false);
    const [hasControlTreatmentGroups, setHasControlTreatmentGroups] = useState(false);
    const [causalQuestion, setCausalQuestion] = useState('');
    const [loadingRecommendation, setLoadingRecommendation] = useState(false);
    const [recommendation, setRecommendation] = useState<MethodRecommendation | null>(null);
    const [recommendationError, setRecommendationError] = useState<string | null>(null);

    // Save state when method is selected
    const handleMethodSelect = async (method: string) => {
        setSelectedMethod(method);

        // Auto-save state
        if (projectId && accessToken) {
            try {
                await projectStateService.saveState(projectId, {
                    currentStep: 'method',
                    selectedMethod: method
                }, accessToken);
            } catch (error) {
                console.error('Failed to save state:', error);
            }
        }
    };

    const handleNext = async () => {
        if (selectedMethod === 'did') {
            // Save state before navigating
            if (projectId && accessToken) {
                try {
                    await projectStateService.saveState(projectId, {
                        currentStep: 'variables',
                        selectedMethod: selectedMethod
                    }, accessToken);
                } catch (error) {
                    console.error('Failed to save state:', error);
                }
            }

            // Navigate to variable selection with project ID
            navigate('/variable-selection', {
                state: { projectId, datasetId }
            });
        } else if (selectedMethod === 'rdd') {
            // Save state before navigating to RD setup
            if (projectId && accessToken) {
                try {
                    await projectStateService.saveState(projectId, {
                        currentStep: 'rd-setup',
                        selectedMethod: selectedMethod
                    }, accessToken);
                } catch (error) {
                    console.error('Failed to save state:', error);
                }
            }

            // Navigate to RD setup with project ID
            navigate('/rd-setup', {
                state: { projectId, datasetId }
            });
        } else {
            // For other methods, show coming soon
            alert("This method is coming soon! Please select Difference-in-Differences or Regression Discontinuity for now.");
        }
    };

    const handleGetRecommendation = async () => {
        if (!treatmentVariable.trim() || !outcomeVariable.trim()) {
            setRecommendationError('Please provide both treatment and outcome variables');
            return;
        }

        setLoadingRecommendation(true);
        setRecommendationError(null);
        setRecommendation(null);

        try {
            const result = await aiService.recommendMethod(
                treatmentVariable.trim(),
                outcomeVariable.trim(),
                isTimeSeries,
                hasControlTreatmentGroups,
                causalQuestion.trim() || undefined
            );
            setRecommendation(result);
            // Auto-select the recommended method
            if (result.method_code) {
                setSelectedMethod(result.method_code);
            }
        } catch (error: any) {
            console.error('Failed to get AI interpretation:', error);
            setRecommendationError(
                error.response?.data?.error ||
                error.message ||
                'Failed to get AI interpretation. Please try again.'
            );
        } finally {
            setLoadingRecommendation(false);
        }
    };

    return (
        <div>
            <Navbar />
            <div style={styles.contentContainer}>
                <div style={styles.mainContent}>
                    <div style={styles.header}>
                        <h2 style={styles.pageTitle}>Select Analysis Method</h2>
                        <p style={styles.subtitle}>Choose the causal inference method that fits your data and research question.</p>
                    </div>

                    <div style={styles.cardsContainer}>
                        {/* Difference-in-Differences Card */}
                        <div
                            style={{
                                ...styles.methodCard,
                                ...(selectedMethod === 'did' ? styles.selectedCard : {})
                            }}
                            onClick={() => handleMethodSelect('did')}
                        >
                            <div style={styles.statusBadge}>Available</div>
                            <div style={styles.cardContent}>
                                <div style={styles.icon}>📈</div>
                                <h3 style={styles.cardTitle}>Difference-in-Differences</h3>
                                <p style={styles.cardDescription}>
                                    Compare changes over time between treatment and control groups
                                </p>
                            </div>
                            <div style={styles.cardRadio}>
                                <div style={{
                                    ...styles.radioOuter,
                                    ...(selectedMethod === 'did' ? styles.radioOuterSelected : {})
                                }}>
                                    {selectedMethod === 'did' && <div style={styles.radioInner}></div>}
                                </div>
                            </div>
                        </div>

                        {/* Regression Discontinuity Card */}
                        <div
                            style={{
                                ...styles.methodCard,
                                ...(selectedMethod === 'rdd' ? styles.selectedCard : {})
                            }}
                            onClick={() => handleMethodSelect('rdd')}
                        >
                            <div style={styles.statusBadge}>Available</div>
                            <div style={styles.cardContent}>
                                <div style={styles.icon}>✂️</div>
                                <h3 style={styles.cardTitle}>Regression Discontinuity</h3>
                                <p style={styles.cardDescription}>
                                    Exploit cutoffs or thresholds to estimate causal effects
                                </p>
                            </div>
                            <div style={styles.cardRadio}>
                                <div style={{
                                    ...styles.radioOuter,
                                    ...(selectedMethod === 'rdd' ? styles.radioOuterSelected : {})
                                }}>
                                    {selectedMethod === 'rdd' && <div style={styles.radioInner}></div>}
                                </div>
                            </div>
                        </div>

                        {/* Instrumental Variables Card */}
                        <div
                            style={{
                                ...styles.methodCard,
                                ...styles.methodCardDisabled,
                                ...(selectedMethod === 'iv' ? styles.selectedCard : {})
                            }}
                            onClick={() => handleMethodSelect('iv')}
                        >
                            <div style={styles.comingSoonBadge}>Coming Soon</div>
                            <div style={styles.cardContent}>
                                <div style={styles.icon}>🎻</div>
                                <h3 style={styles.cardTitle}>Instrumental Variables</h3>
                                <p style={styles.cardDescription}>
                                    Use external instruments to isolate causal variation
                                </p>
                            </div>
                            <div style={styles.cardRadio}>
                                <div style={{
                                    ...styles.radioOuter,
                                    ...(selectedMethod === 'iv' ? styles.radioOuterSelected : {})
                                }}>
                                    {selectedMethod === 'iv' && <div style={styles.radioInner}></div>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Method Description Section - appears when a method is selected */}
                    {selectedMethod && (
                        <div style={styles.methodDescriptionSection}>
                            {selectedMethod === 'did' && (
                                <div style={styles.methodExplanation}>
                                    <div style={styles.explanationHeader}>
                                        <h3 style={styles.explanationTitle}>📊 Difference-in-Differences (DiD)</h3>
                                        <p style={styles.explanationSubtitle}>A powerful method for estimating causal effects from observational data</p>
                                    </div>

                                    {/* When to use section */}
                                    <div style={styles.whenToUseSection}>
                                        <h4 style={styles.whenToUseTitle}>✓ When to use this method</h4>
                                        <div style={styles.whenToUseGrid}>
                                            <div style={styles.whenToUseItem}>
                                                <span style={styles.whenToUseIcon}>⏰</span>
                                                <span>You have data over time (before & after treatment)</span>
                                            </div>
                                            <div style={styles.whenToUseItem}>
                                                <span style={styles.whenToUseIcon}>👥</span>
                                                <span>You have a treated group and a control group</span>
                                            </div>
                                            <div style={styles.whenToUseItem}>
                                                <span style={styles.whenToUseIcon}>📈</span>
                                                <span>Parallel trends assumption likely holds</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={styles.explanationContent}>
                                        {/* Visual Chart Section */}
                                        <div style={styles.chartSection}>
                                            <h4 style={styles.sectionTitle}>The Key Idea</h4>
                                            <div style={styles.chartContainer}>
                                                <svg viewBox="0 0 500 280" style={styles.didChart}>
                                                    {/* Background grid */}
                                                    <defs>
                                                        <pattern id="grid" width="50" height="30" patternUnits="userSpaceOnUse">
                                                            <path d="M 50 0 L 0 0 0 30" fill="none" stroke="#e8e8e8" strokeWidth="0.5" />
                                                        </pattern>
                                                    </defs>
                                                    <rect x="60" y="20" width="400" height="200" fill="url(#grid)" />

                                                    {/* Axes */}
                                                    <line x1="60" y1="220" x2="460" y2="220" stroke="#333" strokeWidth="2" />
                                                    <line x1="60" y1="20" x2="60" y2="220" stroke="#333" strokeWidth="2" />

                                                    {/* Y-axis label */}
                                                    <text x="25" y="120" style={{ fontSize: '12px', fill: '#666' }} transform="rotate(-90, 25, 120)">Outcome</text>

                                                    {/* X-axis labels */}
                                                    <text x="160" y="250" style={{ fontSize: '12px', fill: '#666', fontWeight: 'bold' }}>Before</text>
                                                    <text x="360" y="250" style={{ fontSize: '12px', fill: '#666', fontWeight: 'bold' }}>After</text>
                                                    <text x="260" y="270" style={{ fontSize: '11px', fill: '#999' }}>Treatment occurs here ↑</text>

                                                    {/* Treatment line - solid */}
                                                    <line x1="100" y1="150" x2="260" y2="130" stroke="#e74c3c" strokeWidth="3" />
                                                    <line x1="260" y1="130" x2="420" y2="60" stroke="#e74c3c" strokeWidth="3" />
                                                    <circle cx="100" cy="150" r="6" fill="#e74c3c" />
                                                    <circle cx="260" cy="130" r="6" fill="#e74c3c" />
                                                    <circle cx="420" cy="60" r="8" fill="#e74c3c" stroke="white" strokeWidth="2" />

                                                    {/* Control line - solid */}
                                                    <line x1="100" y1="180" x2="260" y2="160" stroke="#3498db" strokeWidth="3" />
                                                    <line x1="260" y1="160" x2="420" y2="140" stroke="#3498db" strokeWidth="3" />
                                                    <circle cx="100" cy="180" r="6" fill="#3498db" />
                                                    <circle cx="260" cy="160" r="6" fill="#3498db" />
                                                    <circle cx="420" cy="140" r="6" fill="#3498db" />

                                                    {/* Counterfactual line - dashed */}
                                                    <line x1="260" y1="130" x2="420" y2="110" stroke="#e74c3c" strokeWidth="2" strokeDasharray="8,4" opacity="0.5" />
                                                    <circle cx="420" cy="110" r="6" fill="none" stroke="#e74c3c" strokeWidth="2" strokeDasharray="4,2" />

                                                    {/* Treatment Effect Arrow */}
                                                    <line x1="430" y1="110" x2="430" y2="60" stroke="#27ae60" strokeWidth="3" />
                                                    <polygon points="430,58 425,68 435,68" fill="#27ae60" />
                                                    <text x="445" y="90" style={{ fontSize: '11px', fill: '#27ae60', fontWeight: 'bold' }}>Causal</text>
                                                    <text x="445" y="102" style={{ fontSize: '11px', fill: '#27ae60', fontWeight: 'bold' }}>Effect</text>

                                                    {/* Vertical line at treatment time */}
                                                    <line x1="260" y1="20" x2="260" y2="220" stroke="#f39c12" strokeWidth="2" strokeDasharray="5,5" />

                                                    {/* Legend */}
                                                    <rect x="70" y="30" width="150" height="60" fill="white" stroke="#ddd" rx="4" />
                                                    <line x1="80" y1="50" x2="110" y2="50" stroke="#e74c3c" strokeWidth="3" />
                                                    <text x="118" y="54" style={{ fontSize: '11px', fill: '#333' }}>Treatment Group</text>
                                                    <line x1="80" y1="70" x2="110" y2="70" stroke="#3498db" strokeWidth="3" />
                                                    <text x="118" y="74" style={{ fontSize: '11px', fill: '#333' }}>Control Group</text>
                                                </svg>
                                            </div>
                                            <p style={styles.chartCaption}>
                                                DiD compares the change over time in the treatment group to the change in the control group.
                                                The <strong style={{ color: '#27ae60' }}>causal effect</strong> is the difference between what happened
                                                vs. what <em>would have happened</em> without treatment.
                                            </p>
                                        </div>

                                        {/* Key Concepts */}
                                        <div style={styles.conceptsSection}>
                                            <h4 style={styles.sectionTitle}>Key Concepts</h4>
                                            <div style={styles.conceptsGrid}>
                                                <div style={styles.conceptCard}>
                                                    <div style={styles.conceptIcon}>🔀</div>
                                                    <h5 style={styles.conceptTitle}>Parallel Trends</h5>
                                                    <p style={styles.conceptText}>
                                                        The core assumption: without treatment, both groups would have
                                                        followed similar trends over time.
                                                    </p>
                                                </div>
                                                <div style={styles.conceptCard}>
                                                    <div style={styles.conceptIcon}>⏰</div>
                                                    <h5 style={styles.conceptTitle}>Before & After</h5>
                                                    <p style={styles.conceptText}>
                                                        You need observations from both before and after the treatment
                                                        was introduced.
                                                    </p>
                                                </div>
                                                <div style={styles.conceptCard}>
                                                    <div style={styles.conceptIcon}>👥</div>
                                                    <h5 style={styles.conceptTitle}>Treatment & Control</h5>
                                                    <p style={styles.conceptText}>
                                                        One group receives treatment while the control group doesn't,
                                                        providing a comparison baseline.
                                                    </p>
                                                </div>
                                                <div style={styles.conceptCard}>
                                                    <div style={styles.conceptIcon}>📐</div>
                                                    <h5 style={styles.conceptTitle}>The "Double Difference"</h5>
                                                    <p style={styles.conceptText}>
                                                        Effect = (Treatment After - Before) − (Control After - Before).
                                                        This removes time trends and group differences.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Real-World Example */}
                                        <div style={styles.exampleSection}>
                                            <h4 style={styles.sectionTitle}>📖 Example: Minimum Wage Study</h4>
                                            <div style={styles.exampleBox}>
                                                <div style={styles.exampleScenario}>
                                                    <p><strong>Question:</strong> Did raising the minimum wage in New Jersey affect fast-food employment?</p>
                                                </div>
                                                <div style={styles.exampleSteps}>
                                                    <div style={styles.exampleStep}>
                                                        <div style={styles.stepNumber}>1</div>
                                                        <div>
                                                            <strong>Treatment Group:</strong> Fast-food restaurants in New Jersey (where minimum wage increased)
                                                        </div>
                                                    </div>
                                                    <div style={styles.exampleStep}>
                                                        <div style={styles.stepNumber}>2</div>
                                                        <div>
                                                            <strong>Control Group:</strong> Fast-food restaurants in Pennsylvania (no change)
                                                        </div>
                                                    </div>
                                                    <div style={styles.exampleStep}>
                                                        <div style={styles.stepNumber}>3</div>
                                                        <div>
                                                            <strong>Outcome:</strong> Employment levels before and after the policy
                                                        </div>
                                                    </div>
                                                    <div style={styles.exampleStep}>
                                                        <div style={styles.stepNumber}>4</div>
                                                        <div>
                                                            <strong>Result:</strong> DiD revealed no significant negative impact on employment
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mathematical Intuition */}
                                        <div style={styles.formulaSection}>
                                            <h4 style={styles.sectionTitle}>🧮 The Math (Simplified)</h4>
                                            <div style={styles.formulaBox}>
                                                <div style={styles.formula}>
                                                    <span style={styles.formulaHighlight}>DiD Effect</span> =
                                                    <span style={styles.formulaChange}> (Y<sub>T,after</sub> − Y<sub>T,before</sub>)</span> −
                                                    <span style={styles.formulaBaseline}> (Y<sub>C,after</sub> − Y<sub>C,before</sub>)</span>
                                                </div>
                                                <div style={styles.formulaLegend}>
                                                    <span><span style={styles.formulaChange}>■</span> Change in treatment group</span>
                                                    <span><span style={styles.formulaBaseline}>■</span> Change in control group (baseline trend)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedMethod === 'rdd' && (
                                <div style={styles.methodExplanation}>
                                    <div style={styles.explanationHeader}>
                                        <h3 style={styles.explanationTitle}>✂️ Regression Discontinuity (RDD)</h3>
                                        <p style={styles.explanationSubtitle}>Exploiting cutoffs to estimate causal effects</p>
                                    </div>

                                    <div style={styles.whenToUseSection}>
                                        <h4 style={styles.whenToUseTitle}>✓ When to use this method</h4>
                                        <div style={styles.whenToUseGrid}>
                                            <div style={styles.whenToUseItem}>
                                                <span style={styles.whenToUseIcon}>📊</span>
                                                <span>Treatment is assigned based on a score or threshold</span>
                                            </div>
                                            <div style={styles.whenToUseItem}>
                                                <span style={styles.whenToUseIcon}>✂️</span>
                                                <span>There's a clear cutoff point for treatment eligibility</span>
                                            </div>
                                            <div style={styles.whenToUseItem}>
                                                <span style={styles.whenToUseIcon}>🚫</span>
                                                <span>No other changes occur exactly at the threshold</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={styles.explanationContent}>
                                        {/* Visual Chart Section */}
                                        <div style={styles.chartSection}>
                                            <h4 style={styles.sectionTitle}>The Key Idea</h4>
                                            <div style={styles.chartContainer}>
                                                <svg viewBox="0 0 500 280" style={styles.didChart}>
                                                    {/* Background grid */}
                                                    <defs>
                                                        <pattern id="rdd-grid" width="50" height="30" patternUnits="userSpaceOnUse">
                                                            <path d="M 50 0 L 0 0 0 30" fill="none" stroke="#e8e8e8" strokeWidth="0.5" />
                                                        </pattern>
                                                    </defs>
                                                    <rect x="60" y="20" width="400" height="200" fill="url(#rdd-grid)" />

                                                    {/* Axes */}
                                                    <line x1="60" y1="220" x2="460" y2="220" stroke="#333" strokeWidth="2" />
                                                    <line x1="60" y1="20" x2="60" y2="220" stroke="#333" strokeWidth="2" />

                                                    {/* Y-axis label */}
                                                    <text x="25" y="120" style={{ fontSize: '12px', fill: '#666' }} transform="rotate(-90, 25, 120)">Outcome</text>

                                                    {/* X-axis label */}
                                                    <text x="220" y="250" style={{ fontSize: '12px', fill: '#666', fontWeight: 'bold' }}>Running Variable (Score)</text>

                                                    {/* Cutoff line */}
                                                    <line x1="260" y1="20" x2="260" y2="220" stroke="#f39c12" strokeWidth="3" strokeDasharray="5,5" />
                                                    <text x="265" y="35" style={{ fontSize: '11px', fill: '#f39c12', fontWeight: 'bold' }}>Cutoff</text>

                                                    {/* Left side trend line (below cutoff - no treatment) */}
                                                    <line x1="80" y1="180" x2="260" y2="140" stroke="#3498db" strokeWidth="3" />
                                                    {/* Data points below cutoff */}
                                                    <circle cx="100" cy="175" r="4" fill="#3498db" opacity="0.6" />
                                                    <circle cx="130" cy="168" r="4" fill="#3498db" opacity="0.6" />
                                                    <circle cx="160" cy="162" r="4" fill="#3498db" opacity="0.6" />
                                                    <circle cx="190" cy="155" r="4" fill="#3498db" opacity="0.6" />
                                                    <circle cx="220" cy="148" r="4" fill="#3498db" opacity="0.6" />
                                                    <circle cx="245" cy="143" r="4" fill="#3498db" opacity="0.6" />

                                                    {/* Right side trend line (above cutoff - with treatment) */}
                                                    <line x1="260" y1="100" x2="440" y2="70" stroke="#e74c3c" strokeWidth="3" />
                                                    {/* Data points above cutoff */}
                                                    <circle cx="275" cy="98" r="4" fill="#e74c3c" opacity="0.6" />
                                                    <circle cx="300" cy="93" r="4" fill="#e74c3c" opacity="0.6" />
                                                    <circle cx="330" cy="88" r="4" fill="#e74c3c" opacity="0.6" />
                                                    <circle cx="360" cy="83" r="4" fill="#e74c3c" opacity="0.6" />
                                                    <circle cx="390" cy="78" r="4" fill="#e74c3c" opacity="0.6" />
                                                    <circle cx="420" cy="73" r="4" fill="#e74c3c" opacity="0.6" />

                                                    {/* Counterfactual - dashed extension of left trend */}
                                                    <line x1="260" y1="140" x2="320" y2="125" stroke="#3498db" strokeWidth="2" strokeDasharray="8,4" opacity="0.5" />

                                                    {/* Treatment Effect Arrow */}
                                                    <line x1="270" y1="122" x2="270" y2="97" stroke="#27ae60" strokeWidth="3" />
                                                    <polygon points="270,95 265,105 275,105" fill="#27ae60" />
                                                    <text x="280" y="110" style={{ fontSize: '11px', fill: '#27ae60', fontWeight: 'bold' }}>Causal</text>
                                                    <text x="280" y="122" style={{ fontSize: '11px', fill: '#27ae60', fontWeight: 'bold' }}>Effect</text>

                                                    {/* Legend */}
                                                    <rect x="70" y="30" width="150" height="60" fill="white" stroke="#ddd" rx="4" />
                                                    <line x1="80" y1="50" x2="110" y2="50" stroke="#3498db" strokeWidth="3" />
                                                    <text x="118" y="54" style={{ fontSize: '11px', fill: '#333' }}>Below Cutoff</text>
                                                    <line x1="80" y1="70" x2="110" y2="70" stroke="#e74c3c" strokeWidth="3" />
                                                    <text x="118" y="74" style={{ fontSize: '11px', fill: '#333' }}>Above Cutoff</text>
                                                </svg>
                                            </div>
                                            <p style={styles.chartCaption}>
                                                RDD exploits a sharp cutoff in treatment assignment. Units just above and below the threshold
                                                are nearly identical, so the <strong style={{ color: '#27ae60' }}>jump at the cutoff</strong> reveals
                                                the causal effect of treatment.
                                            </p>
                                        </div>

                                        {/* Key Concepts */}
                                        <div style={styles.conceptsSection}>
                                            <h4 style={styles.sectionTitle}>Key Concepts</h4>
                                            <div style={styles.conceptsGrid}>
                                                <div style={styles.conceptCard}>
                                                    <div style={styles.conceptIcon}>✂️</div>
                                                    <h5 style={styles.conceptTitle}>Sharp Cutoff</h5>
                                                    <p style={styles.conceptText}>
                                                        Treatment is assigned based on a clear threshold in a running variable
                                                        (e.g., test score ≥ 70 gets treatment).
                                                    </p>
                                                </div>
                                                <div style={styles.conceptCard}>
                                                    <div style={styles.conceptIcon}>🎯</div>
                                                    <h5 style={styles.conceptTitle}>Local Comparison</h5>
                                                    <p style={styles.conceptText}>
                                                        Units just above and below the cutoff are nearly identical, creating
                                                        a "natural experiment" at the threshold.
                                                    </p>
                                                </div>
                                                <div style={styles.conceptCard}>
                                                    <div style={styles.conceptIcon}>📊</div>
                                                    <h5 style={styles.conceptTitle}>Continuity Assumption</h5>
                                                    <p style={styles.conceptText}>
                                                        Without treatment, the outcome would change smoothly through the cutoff—no
                                                        other factors jump at the threshold.
                                                    </p>
                                                </div>
                                                <div style={styles.conceptCard}>
                                                    <div style={styles.conceptIcon}>🔍</div>
                                                    <h5 style={styles.conceptTitle}>The Discontinuity</h5>
                                                    <p style={styles.conceptText}>
                                                        Any jump in the outcome at the cutoff can be attributed to the treatment,
                                                        since everything else is continuous.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Real-World Example */}
                                        <div style={styles.exampleSection}>
                                            <h4 style={styles.sectionTitle}>📖 Example: Scholarship Eligibility</h4>
                                            <div style={styles.exampleBox}>
                                                <div style={styles.exampleScenario}>
                                                    <p><strong>Question:</strong> Does receiving a merit scholarship improve college graduation rates?</p>
                                                </div>
                                                <div style={styles.exampleSteps}>
                                                    <div style={styles.exampleStep}>
                                                        <div style={styles.stepNumber}>1</div>
                                                        <div>
                                                            <strong>Running Variable:</strong> High school GPA (the score that determines eligibility)
                                                        </div>
                                                    </div>
                                                    <div style={styles.exampleStep}>
                                                        <div style={styles.stepNumber}>2</div>
                                                        <div>
                                                            <strong>Cutoff:</strong> Students with GPA ≥ 3.5 receive the scholarship
                                                        </div>
                                                    </div>
                                                    <div style={styles.exampleStep}>
                                                        <div style={styles.stepNumber}>3</div>
                                                        <div>
                                                            <strong>Key Insight:</strong> Students with 3.49 vs. 3.51 GPA are nearly identical, but one gets the scholarship
                                                        </div>
                                                    </div>
                                                    <div style={styles.exampleStep}>
                                                        <div style={styles.stepNumber}>4</div>
                                                        <div>
                                                            <strong>Result:</strong> Compare graduation rates just above vs. below 3.5 to isolate the scholarship's effect
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mathematical Intuition */}
                                        <div style={styles.formulaSection}>
                                            <h4 style={styles.sectionTitle}>🧮 The Math (Simplified)</h4>
                                            <div style={styles.formulaBox}>
                                                <div style={styles.formula}>
                                                    <span style={styles.formulaHighlight}>RDD Effect</span> =
                                                    <span style={styles.formulaChange}> lim<sub>x→c⁺</sub> E[Y|X=x]</span> −
                                                    <span style={styles.formulaBaseline}> lim<sub>x→c⁻</sub> E[Y|X=x]</span>
                                                </div>
                                                <div style={styles.formulaLegend}>
                                                    <span><span style={styles.formulaChange}>■</span> Outcome just above cutoff (c)</span>
                                                    <span><span style={styles.formulaBaseline}>■</span> Outcome just below cutoff (c)</span>
                                                </div>
                                                <p style={{ fontSize: '13px', color: '#666', marginTop: '12px', lineHeight: '1.5' }}>
                                                    In plain English: The causal effect is the difference in outcomes between units
                                                    just barely above vs. just barely below the cutoff threshold.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedMethod === 'iv' && (
                                <div style={styles.methodExplanation}>
                                    <div style={styles.explanationHeader}>
                                        <h3 style={styles.explanationTitle}>🎻 Instrumental Variables (IV)</h3>
                                        <p style={styles.explanationSubtitle}>Using external variation to identify causal effects</p>
                                    </div>

                                    <div style={styles.whenToUseSection}>
                                        <h4 style={styles.whenToUseTitle}>✓ When to use this method</h4>
                                        <div style={styles.whenToUseGrid}>
                                            <div style={styles.whenToUseItem}>
                                                <span style={styles.whenToUseIcon}>⚠️</span>
                                                <span>Treatment is endogenous (correlated with errors)</span>
                                            </div>
                                            <div style={styles.whenToUseItem}>
                                                <span style={styles.whenToUseIcon}>🎯</span>
                                                <span>You have a valid instrument (relevant to treatment)</span>
                                            </div>
                                            <div style={styles.whenToUseItem}>
                                                <span style={styles.whenToUseIcon}>🔒</span>
                                                <span>The instrument is exclusive (only affects outcome through treatment)</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={styles.comingSoonContent}>
                                        <p style={styles.comingSoonText}>🚧 Full analysis coming soon!</p>
                                        <p style={{ color: '#666', fontSize: '14px' }}>
                                            IV uses an external "instrument" that affects treatment but has no direct effect on the outcome.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* AI Aid Section */}
                    <div style={styles.aiAidCard}>
                        <div style={styles.aiAidHeader}>
                            <h3 style={styles.aiAidTitle}>🤖 Help Me Choose</h3>
                            <button
                                style={styles.toggleButton}
                                onClick={() => setShowAIAid(!showAIAid)}
                            >
                                {showAIAid ? '▼ Hide' : '▶ Show'}
                            </button>
                        </div>

                        {!showAIAid && (
                            <p style={styles.aiAidDescription}>
                                Not sure which method is right for you? Let our AI analyze your research question.
                            </p>
                        )}

                        {showAIAid && (
                            <div style={styles.aiAidForm}>
                                <div style={styles.formGrid}>
                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>
                                            Treatment Variable <span style={styles.required}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            style={styles.input}
                                            placeholder="e.g., policy, intervention"
                                            value={treatmentVariable}
                                            onChange={(e) => setTreatmentVariable(e.target.value)}
                                        />
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>
                                            Outcome Variable <span style={styles.required}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            style={styles.input}
                                            placeholder="e.g., sales, revenue"
                                            value={outcomeVariable}
                                            onChange={(e) => setOutcomeVariable(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div style={styles.formGroup}>
                                    <label style={styles.label}>
                                        Causal Question (Optional)
                                    </label>
                                    <textarea
                                        style={styles.textarea}
                                        placeholder="e.g., What was the effect of the policy on sales?"
                                        value={causalQuestion}
                                        onChange={(e) => setCausalQuestion(e.target.value)}
                                        rows={2}
                                    />
                                </div>

                                <div style={styles.checkboxContainer}>
                                    <div style={styles.checkboxGroup}>
                                        <label style={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={isTimeSeries}
                                                onChange={(e) => setIsTimeSeries(e.target.checked)}
                                                style={styles.checkbox}
                                            />
                                            <span>My data is time series (longitudinal)</span>
                                        </label>
                                    </div>

                                    <div style={styles.checkboxGroup}>
                                        <label style={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={hasControlTreatmentGroups}
                                                onChange={(e) => setHasControlTreatmentGroups(e.target.checked)}
                                                style={styles.checkbox}
                                            />
                                            <span>I have distinct control and treatment groups</span>
                                        </label>
                                    </div>
                                </div>

                                <button
                                    style={{
                                        ...styles.recommendButton,
                                        ...((loadingRecommendation || !treatmentVariable.trim() || !outcomeVariable.trim()) && styles.recommendButtonDisabled)
                                    }}
                                    onClick={handleGetRecommendation}
                                    disabled={loadingRecommendation || !treatmentVariable.trim() || !outcomeVariable.trim()}
                                >
                                    {loadingRecommendation ? 'Getting Recommendation...' : 'Get AI Recommendation'}
                                </button>

                                {recommendationError && (
                                    <div style={styles.errorMessage}>
                                        ⚠️ {recommendationError}
                                    </div>
                                )}

                                {recommendation && (
                                    <div style={styles.recommendationBox}>
                                        <h4 style={styles.recommendationTitle}>
                                            Recommended Method: {recommendation.recommended_method}
                                        </h4>
                                        <p style={styles.recommendationExplanation}>
                                            {recommendation.explanation}
                                        </p>

                                        {recommendation.key_assumptions && recommendation.key_assumptions.length > 0 && (
                                            <div style={styles.assumptionsSection}>
                                                <strong>Key Assumptions:</strong>
                                                <ul style={styles.assumptionsList}>
                                                    {recommendation.key_assumptions.map((assumption, idx) => (
                                                        <li key={idx}>{assumption}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {recommendation.alternatives && recommendation.alternatives.length > 0 && (
                                            <div style={styles.alternativesSection}>
                                                <strong>Alternative Methods:</strong>
                                                {recommendation.alternatives.map((alt, idx) => (
                                                    <div key={idx} style={styles.alternativeItem}>
                                                        <strong>{alt.method}:</strong> {alt.when_appropriate}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Progress Bar */}
            <BottomProgressBar
                currentStep={currentStep}
                steps={steps}
                onPrev={goToPreviousStep}
                onNext={handleNext}
                canGoNext={selectedMethod === 'did' || selectedMethod === 'rdd'} // Allow next for DiD and RDD
                onStepClick={(path) => navigate(path, { state: { projectId, datasetId } })}
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
        flexDirection: 'column' as const,
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: '20px',
        flex: 1,
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box' as const
    },
    header: {
        textAlign: 'center' as const,
        marginBottom: '30px'
    },
    pageTitle: {
        fontSize: '28px',
        fontWeight: 'bold',
        color: '#043873',
        margin: '0 0 10px 0'
    },
    subtitle: {
        fontSize: '16px',
        color: '#666',
        margin: 0
    },
    cardsContainer: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '20px',
        width: '100%',
        maxWidth: '900px',
        marginBottom: '40px'
    },
    methodCard: {
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px 20px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: 'transparent',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        textAlign: 'center' as const,
        minHeight: '200px'
    },
    methodCardDisabled: {
        opacity: 0.65
    },
    selectedCard: {
        borderColor: '#043873',
        backgroundColor: '#f0f7ff',
        transform: 'translateY(-2px)',
        boxShadow: '0 8px 20px rgba(4, 56, 115, 0.15)'
    },
    cardContent: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px'
    },
    icon: {
        fontSize: '36px'
    },
    cardTitle: {
        fontSize: '16px',
        fontWeight: '600',
        color: '#043873',
        margin: 0,
        lineHeight: '1.3'
    },
    cardDescription: {
        fontSize: '13px',
        color: '#666',
        lineHeight: '1.4',
        margin: 0
    },
    cardRadio: {
        marginTop: '16px'
    },
    radioOuter: {
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: '#cbd5e1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s'
    },
    radioOuterSelected: {
        borderColor: '#043873'
    },
    radioInner: {
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        backgroundColor: '#043873'
    },
    statusBadge: {
        backgroundColor: '#d4edda',
        color: '#155724',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '600',
        marginBottom: '12px'
    },
    comingSoonBadge: {
        backgroundColor: '#f1f5f9',
        color: '#64748b',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '600',
        marginBottom: '12px'
    },
    aiAidCard: {
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '30px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '800px',
        marginTop: '20px',
        border: '1px solid #e0e0e0'
    },
    aiAidHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px'
    },
    aiAidTitle: {
        fontSize: '20px',
        fontWeight: 'bold',
        color: '#043873',
        margin: 0
    },
    toggleButton: {
        background: 'none',
        border: '1px solid #043873',
        color: '#043873',
        padding: '6px 12px',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500'
    },
    aiAidDescription: {
        fontSize: '14px',
        color: '#666',
        margin: '0',
        lineHeight: '1.5'
    },
    aiAidForm: {
        marginTop: '20px',
        paddingTop: '20px',
        borderTop: '1px solid #eee'
    },
    formGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px'
    },
    formGroup: {
        marginBottom: '20px'
    },
    label: {
        display: 'block',
        fontSize: '14px',
        fontWeight: '600',
        color: '#333',
        marginBottom: '8px'
    },
    required: {
        color: '#e74c3c'
    },
    input: {
        width: '100%',
        padding: '10px',
        fontSize: '14px',
        border: '2px solid #e0e0e0',
        borderRadius: '6px',
        boxSizing: 'border-box' as const,
        fontFamily: 'inherit'
    },
    textarea: {
        width: '100%',
        padding: '10px',
        fontSize: '14px',
        border: '2px solid #e0e0e0',
        borderRadius: '6px',
        boxSizing: 'border-box' as const,
        fontFamily: 'inherit',
        resize: 'vertical' as const
    },
    checkboxContainer: {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '10px',
        marginBottom: '20px'
    },
    checkboxGroup: {
        marginBottom: '0'
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        fontSize: '14px',
        color: '#333',
        cursor: 'pointer'
    },
    checkbox: {
        marginRight: '8px',
        width: '18px',
        height: '18px',
        cursor: 'pointer'
    },
    recommendButton: {
        width: '100%',
        padding: '12px',
        fontSize: '16px',
        fontWeight: '600',
        color: 'white',
        backgroundColor: '#043873',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        marginTop: '10px',
        transition: 'background-color 0.2s'
    },
    recommendButtonDisabled: {
        backgroundColor: '#ccc',
        cursor: 'not-allowed',
        opacity: 0.6
    },
    errorMessage: {
        marginTop: '15px',
        padding: '12px',
        backgroundColor: '#fee',
        border: '1px solid #fcc',
        borderRadius: '6px',
        color: '#c33',
        fontSize: '14px'
    },
    recommendationBox: {
        marginTop: '20px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        border: '2px solid #043873',
        borderRadius: '8px'
    },
    recommendationTitle: {
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#043873',
        margin: '0 0 12px 0'
    },
    recommendationExplanation: {
        fontSize: '14px',
        color: '#333',
        lineHeight: '1.6',
        margin: '0 0 15px 0'
    },
    assumptionsSection: {
        marginTop: '15px',
        fontSize: '14px',
        color: '#333'
    },
    assumptionsList: {
        margin: '8px 0 0 20px',
        padding: 0
    },
    alternativesSection: {
        marginTop: '15px',
        fontSize: '14px',
        color: '#333'
    },
    alternativeItem: {
        marginTop: '8px',
        padding: '8px',
        backgroundColor: 'white',
        borderRadius: '4px',
        fontSize: '13px'
    },
    // Method Description Section Styles
    methodDescriptionSection: {
        width: '100%',
        maxWidth: '1000px',
        marginBottom: '30px',
        animation: 'fadeInUp 0.4s ease-out'
    },
    methodExplanation: {
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '35px',
        boxShadow: '0 8px 32px rgba(4, 56, 115, 0.12)',
        border: '1px solid rgba(4, 56, 115, 0.1)'
    },
    explanationHeader: {
        textAlign: 'center' as const,
        marginBottom: '25px',
        paddingBottom: '20px',
        borderBottom: '2px solid #f0f4f8'
    },
    whenToUseSection: {
        backgroundColor: '#f0f7ff',
        borderRadius: '12px',
        padding: '20px 24px',
        marginBottom: '30px',
        border: '1px solid #d4e5f7'
    },
    whenToUseTitle: {
        fontSize: '16px',
        fontWeight: '600',
        color: '#043873',
        margin: '0 0 16px 0'
    },
    whenToUseGrid: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '12px'
    },
    whenToUseItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '14px',
        color: '#334155'
    },
    whenToUseIcon: {
        fontSize: '18px'
    },
    explanationTitle: {
        fontSize: '26px',
        fontWeight: 'bold',
        color: '#043873',
        margin: '0 0 10px 0'
    },
    explanationSubtitle: {
        fontSize: '15px',
        color: '#666',
        margin: 0
    },
    explanationContent: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '35px'
    },
    chartSection: {
        textAlign: 'center' as const
    },
    sectionTitle: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#043873',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
    },
    chartContainer: {
        backgroundColor: '#fafbfc',
        borderRadius: '12px',
        padding: '25px',
        border: '1px solid #e8e8e8',
        marginBottom: '15px'
    },
    didChart: {
        width: '100%',
        maxWidth: '500px',
        height: 'auto'
    },
    chartCaption: {
        fontSize: '14px',
        color: '#555',
        lineHeight: '1.7',
        maxWidth: '600px',
        margin: '0 auto',
        textAlign: 'center' as const
    },
    conceptsSection: {
        marginTop: '10px'
    },
    conceptsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px'
    },
    conceptCard: {
        backgroundColor: '#f8fafc',
        borderRadius: '12px',
        padding: '22px',
        border: '1px solid #e2e8f0',
        transition: 'transform 0.2s, box-shadow 0.2s'
    },
    conceptIcon: {
        fontSize: '28px',
        marginBottom: '12px'
    },
    conceptTitle: {
        fontSize: '15px',
        fontWeight: '600',
        color: '#043873',
        margin: '0 0 8px 0'
    },
    conceptText: {
        fontSize: '13px',
        color: '#555',
        lineHeight: '1.6',
        margin: 0
    },
    exampleSection: {
        marginTop: '10px'
    },
    exampleBox: {
        backgroundColor: 'linear-gradient(135deg, #f8f9fa 0%, #fff 100%)',
        background: '#f8f9fa',
        borderRadius: '12px',
        padding: '25px',
        border: '1px solid #e2e8f0'
    },
    exampleScenario: {
        backgroundColor: '#e8f4fc',
        borderRadius: '8px',
        padding: '15px 20px',
        marginBottom: '20px',
        borderLeft: '4px solid #3498db'
    },
    exampleSteps: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '12px'
    },
    exampleStep: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '15px',
        backgroundColor: 'white',
        padding: '15px',
        borderRadius: '8px',
        border: '1px solid #eee'
    },
    stepNumber: {
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        backgroundColor: '#043873',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: '14px',
        flexShrink: 0
    },
    formulaSection: {
        marginTop: '10px'
    },
    formulaBox: {
        backgroundColor: '#1a1a2e',
        borderRadius: '12px',
        padding: '25px',
        textAlign: 'center' as const
    },
    formula: {
        fontSize: '18px',
        color: '#fff',
        fontFamily: "'Georgia', serif",
        letterSpacing: '1px',
        marginBottom: '20px'
    },
    formulaHighlight: {
        color: '#4ecdc4',
        fontWeight: 'bold'
    },
    formulaChange: {
        color: '#ff6b6b'
    },
    formulaBaseline: {
        color: '#74b9ff'
    },
    formulaLegend: {
        display: 'flex',
        justifyContent: 'center',
        gap: '30px',
        fontSize: '13px',
        color: '#aaa'
    },
    comingSoonContent: {
        textAlign: 'center' as const,
        padding: '40px 20px',
        color: '#666',
        backgroundColor: '#f8fafc',
        borderRadius: '12px',
        border: '2px dashed #e2e8f0'
    },
    comingSoonText: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#64748b',
        margin: '0 0 12px 0'
    }
}
