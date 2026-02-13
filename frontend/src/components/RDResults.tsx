import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import RDSensitivityPlot from './RDSensitivityPlot';
import RDScatterPlot from './RDScatterPlot';
import { aiService, ResultsInterpretation } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import { projectStateService } from '../services/projectStateService';

const COLLAPSE_THRESHOLD = 200;
const MAX_MESSAGE_LENGTH = 2000;

const RDResults: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { currentStep, steps, goToPreviousStep, goToNextStep, navigateToStep } = useProgressStep();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [aiInterpretation, setAiInterpretation] = useState<ResultsInterpretation | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSidebarWidth, setAiSidebarWidth] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const [isAiSidebarCollapsed, setIsAiSidebarCollapsed] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp?: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [datasetInfo, setDatasetInfo] = useState<any>(null);
  const [recommendedQuestions] = useState<string[]>([
    'What is the local continuity assumption in RD?',
    'How do I interpret my RD estimate?',
    'What are the limitations of this analysis?',
  ]);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadResults = async () => {
      const projectId =
        (location.state as any)?.projectId ||
        parseInt(new URLSearchParams(location.search).get('projectId') || '0') ||
        null;

      let loadedResults: any = null;

      // 1. Try project state (backend) - source of truth per project
      if (projectId && accessToken) {
        try {
          const project = await projectStateService.loadProject(projectId, accessToken);
          if (project.lastResults?.results && project.lastResults?.parameters) {
            loadedResults = project.lastResults;
          }
        } catch (err) {
          console.warn('Failed to load RD results from project state:', err);
        }
      }

      // 2. Try localStorage keyed by project
      if (!loadedResults && projectId) {
        const stored = localStorage.getItem(`rdAnalysisResults_${projectId}`);
        if (stored) {
          try {
            loadedResults = JSON.parse(stored);
          } catch (e) {
            console.warn('Failed to parse project RD results from localStorage:', e);
          }
        }
      }

      // 3. Fallback: legacy global key (for backwards compatibility when no projectId)
      if (!loadedResults) {
        const stored = localStorage.getItem('rdAnalysisResults');
        if (stored) {
          try {
            loadedResults = JSON.parse(stored);
          } catch (e) {
            console.warn('Failed to parse RD results from localStorage:', e);
          }
        }
      }

      if (loadedResults) {
        setResults(loadedResults);

        // Load cached AI interpretation if it matches this analysis
        const interpretationKey = projectId
          ? `rdAiInterpretation_${projectId}`
          : 'rdAiInterpretation';
        const storedInterpretation = localStorage.getItem(interpretationKey);
        if (storedInterpretation) {
          try {
            const parsed = JSON.parse(storedInterpretation);
            const params = loadedResults.parameters || {};
            const currentKey = JSON.stringify({
              dataset_id: loadedResults.dataset_id,
              running_var: params.running_var,
              outcome_var: params.outcome_var,
              cutoff: params.cutoff,
              treatment_effect: loadedResults.results?.treatment_effect,
              p_value: loadedResults.results?.p_value,
            });
            if (parsed.analysisKey === currentKey) {
              setAiInterpretation(parsed.interpretation);
            } else {
              localStorage.removeItem(interpretationKey);
            }
          } catch {
            localStorage.removeItem(interpretationKey);
          }
        }
      } else {
        setAiInterpretation(null);
      }
      setLoading(false);
    };

    loadResults();
  }, [accessToken, location.state, location.search]);

  const loadAIInterpretation = async () => {
    if (!results?.results || !results?.parameters) {
      setAiError('Results or parameters not available');
      return;
    }

    setLoadingAI(true);
    setAiError(null);

    try {
      const interpretation = await aiService.interpretResults(
        results.results,
        results.parameters,
        undefined,
        'Regression Discontinuity'
      );
      setAiInterpretation(interpretation);

      const params = results.parameters || {};
      const analysisKey = JSON.stringify({
        dataset_id: results.dataset_id,
        running_var: params.running_var,
        outcome_var: params.outcome_var,
        cutoff: params.cutoff,
        treatment_effect: results.results?.treatment_effect,
        p_value: results.results?.p_value,
      });
      const projectId =
        (location.state as any)?.projectId ||
        parseInt(new URLSearchParams(location.search).get('projectId') || '0') ||
        null;
      const interpretationKey = projectId ? `rdAiInterpretation_${projectId}` : 'rdAiInterpretation';
      localStorage.setItem(interpretationKey, JSON.stringify({
        analysisKey,
        interpretation,
        timestamp: new Date().toISOString(),
      }));
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMessage = errorData?.error || error.message || 'Failed to get AI interpretation';
      setAiError(errorMessage);
    } finally {
      setLoadingAI(false);
    }
  };

  // Load dataset info for chat context
  useEffect(() => {
    const loadDatasetInfo = async () => {
      const datasetId = results?.dataset_id || (location.state as any)?.datasetId;
      const projectId = (location.state as any)?.projectId;
      if (!datasetId || !accessToken) return;

      try {
        const axios = (await import('axios')).default;
        if (projectId) {
          const projectResponse = await axios.get(`/projects/${projectId}/datasets`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const datasets = projectResponse.data.datasets || [];
          const dataset = datasets.find((d: any) => d.id === datasetId);
          if (dataset) {
            try {
              const previewResponse = await axios.get(`/datasets/${datasetId}/preview`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              setDatasetInfo({
                name: dataset.name,
                columns: previewResponse.data.columns || [],
                summary: previewResponse.data.summary || {},
              });
            } catch {
              setDatasetInfo({ name: dataset.name, columns: [], summary: {} });
            }
          }
        } else {
          try {
            const previewResponse = await axios.get(`/datasets/${datasetId}/preview`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            setDatasetInfo({
              name: undefined,
              columns: previewResponse.data.columns || [],
              summary: previewResponse.data.summary || {},
            });
          } catch {
            setDatasetInfo(null);
          }
        }
      } catch (error) {
        console.error('Error loading dataset info:', error);
      }
    };

    if (results) loadDatasetInfo();
  }, [results, accessToken, location.state]);

  // Scroll chat to bottom
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Resize handlers for AI sidebar
  useEffect(() => {
    let lastWidth = aiSidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const container = document.querySelector('[data-rd-main-layout]') as HTMLElement;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      const minWidth = COLLAPSE_THRESHOLD;
      const maxWidth = 800;
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      lastWidth = constrainedWidth;
      if (constrainedWidth <= COLLAPSE_THRESHOLD) {
        setIsAiSidebarCollapsed(true);
      } else {
        setIsAiSidebarCollapsed(false);
        setAiSidebarWidth(constrainedWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (lastWidth <= COLLAPSE_THRESHOLD) setIsAiSidebarCollapsed(true);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, aiSidebarWidth]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  const handleOpenAiSection = () => {
    setIsAiSidebarCollapsed(false);
    if (aiSidebarWidth <= COLLAPSE_THRESHOLD) setAiSidebarWidth(480);
  };

  const handleSendMessage = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    if (message.length > MAX_MESSAGE_LENGTH) {
      setChatError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`);
      return;
    }

    setChatError(null);
    setChatLoading(true);
    const userMessage = { role: 'user' as const, content: message, timestamp: new Date().toISOString() };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');

    try {
      const conversationHistory = chatMessages.map((msg) => ({ role: msg.role, content: msg.content }));
      const analysisContext = results
        ? {
            parameters: results.parameters,
            results: results.results,
            ai_interpretation: aiInterpretation || undefined,
          }
        : undefined;

      const response = await aiService.chat(
        message,
        conversationHistory,
        analysisContext,
        datasetInfo
      );

      const assistantMessage = {
        role: 'assistant' as const,
        content: response.response,
        timestamp: response.timestamp,
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Chat error:', error);
      setChatError(error.response?.data?.error || error.message || 'Failed to send message');
      setChatMessages((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatInputKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading) {
    return (
      <div>
        <Navbar />
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}></div>
          <p style={styles.loadingText}>Loading results...</p>
        </div>
      </div>
    );
  }

  if (!results || !results.results) {
    return (
      <div>
        <Navbar />
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠️</div>
          <h2 style={styles.errorTitle}>No Results Found</h2>
          <p style={styles.errorMessage}>
            No analysis results available. Please run an analysis first.
          </p>
          <button
            onClick={() => navigate('/method-selection')}
            style={styles.backButton}
          >
            Go to Method Selection
          </button>
        </div>
      </div>
    );
  }

  const { results: res, parameters, bandwidth_info } = results;
  const isSignificant = res.p_value < 0.05;

  return (
    <div>
      <Navbar />
      <div style={styles.contentContainer}>
        <div
          data-rd-main-layout
          style={{
            ...styles.mainLayout,
            justifyContent: isAiSidebarCollapsed ? 'center' : 'flex-start',
            gap: isAiSidebarCollapsed ? '24px' : '48px',
            position: 'relative' as const,
          }}
        >
          {/* Main Content */}
          <div
            style={{
              ...styles.mainContent,
              flex: isAiSidebarCollapsed ? '1 1 auto' : '1 1 60%',
              minWidth: isAiSidebarCollapsed ? 'auto' : '60%',
              maxWidth: isAiSidebarCollapsed ? '1200px' : 'none',
              margin: isAiSidebarCollapsed ? '0 auto' : '0',
            }}
          >
        <div style={styles.header}>
          <h1 style={styles.title}>Regression Discontinuity Results</h1>
          <p style={styles.subtitle}>
            Analysis complete for {parameters.running_var} at cutoff {parameters.cutoff}
          </p>
        </div>

        <div style={styles.content}>
          {/* Main Result Card */}
          <div style={styles.mainResultCard}>
            <h2 style={styles.resultLabel}>Treatment Effect</h2>
            <div style={styles.effectValue}>
              {res.treatment_effect.toFixed(3)}
            </div>
            <div style={styles.ciContainer}>
              <span style={styles.ciLabel}>95% CI:</span>
              <span style={styles.ciValue}>
                [{res.ci_lower.toFixed(3)}, {res.ci_upper.toFixed(3)}]
              </span>
            </div>
            <div
              style={{
                ...styles.significanceBadge,
                ...(isSignificant
                  ? styles.significantBadge
                  : styles.notSignificantBadge),
              }}
            >
              {isSignificant ? '✓ Statistically Significant' : 'Not Statistically Significant'}
            </div>
          </div>

          {/* Statistics Grid */}
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>P-Value</div>
              <div style={styles.statValue}>{res.p_value.toFixed(4)}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Standard Error</div>
              <div style={styles.statValue}>{res.se.toFixed(3)}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>
                {parameters.treatment_side === 'below' ? 'Treated (Below)' : 'Treated (Above)'}
              </div>
              <div style={styles.statValue}>{res.n_treated}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>
                {parameters.treatment_side === 'below' ? 'Control (Above)' : 'Control (Below)'}
              </div>
              <div style={styles.statValue}>{res.n_control}</div>
            </div>
          </div>

          {/* Bandwidth Info */}
          <div style={styles.infoCard}>
            <h3 style={styles.infoTitle}>Bandwidth Information</h3>
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Bandwidth Used:</span>
                <span style={styles.infoValue}>{res.bandwidth_used.toFixed(3)}</span>
              </div>
              {bandwidth_info.optimal_bandwidth && (
                <div style={styles.infoItem}>
                  <span style={styles.infoLabel}>Optimal Bandwidth:</span>
                  <span style={styles.infoValue}>
                    {bandwidth_info.optimal_bandwidth.toFixed(3)}
                  </span>
                </div>
              )}
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Method:</span>
                <span style={styles.infoValue}>
                  {bandwidth_info.bandwidth_method === 'user_specified'
                    ? 'User Specified'
                    : 'Imbens-Kalyanaraman (2012)'}
                </span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Polynomial Order:</span>
                <span style={styles.infoValue}>{res.polynomial_order === 1 ? 'Linear' : 'Quadratic'}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Kernel:</span>
                <span style={styles.infoValue}>Triangular</span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {(res.warnings && res.warnings.length > 0) ||
            (bandwidth_info.bandwidth_warnings && bandwidth_info.bandwidth_warnings.length > 0) ? (
            <div style={styles.warningCard}>
              <h3 style={styles.warningTitle}>⚠️ Warnings</h3>
              <ul style={styles.warningList}>
                {res.warnings &&
                  res.warnings.map((warning: string, idx: number) => (
                    <li key={`warn-${idx}`}>{warning}</li>
                  ))}
                {bandwidth_info.bandwidth_warnings &&
                  bandwidth_info.bandwidth_warnings.map(
                    (warning: string, idx: number) => (
                      <li key={`bw-warn-${idx}`}>{warning}</li>
                    )
                  )}
              </ul>
            </div>
          ) : null}

          {/* RD Scatter Plot Visualization */}
          <RDScatterPlot
            datasetId={results.dataset_id}
            runningVar={parameters.running_var}
            outcomeVar={parameters.outcome_var}
            cutoff={parameters.cutoff}
            bandwidth={res.bandwidth_used}
            polynomialOrder={res.polynomial_order}
            treatmentSide={parameters.treatment_side}
          />

          {/* Sensitivity Analysis Visualization */}
          <RDSensitivityPlot
            datasetId={results.dataset_id}
            runningVar={parameters.running_var}
            outcomeVar={parameters.outcome_var}
            cutoff={parameters.cutoff}
            optimalBandwidth={bandwidth_info.optimal_bandwidth}
            treatmentSide={parameters.treatment_side}
          />

        </div>
          </div>

          {/* AI Sidebar */}
          {!isAiSidebarCollapsed && (
            <div
              style={{
                ...styles.aiSidebar,
                width: `${aiSidebarWidth}px`,
                flex: `0 0 ${aiSidebarWidth}px`,
                position: 'sticky' as const,
                top: '90px',
                right: '0px',
                overflow: 'visible' as const,
                maxHeight: 'calc(100vh - 200px)',
                marginTop: '90px',
              }}
            >
              <div
                onMouseDown={handleResizeStart}
                style={{
                  position: 'absolute',
                  left: '-4px',
                  top: 0,
                  bottom: 0,
                  width: '8px',
                  cursor: 'col-resize',
                  zIndex: 10,
                  backgroundColor: isResizing ? 'rgba(79, 156, 249, 0.3)' : 'transparent',
                  borderLeft: isResizing ? '2px solid #4F9CF9' : 'none',
                }}
                title="Drag to resize"
              />
              <div
                style={{
                  ...styles.aiSection,
                  maxHeight: 'calc(100vh - 200px)',
                  overflowY: 'auto' as const,
                  overflowX: 'hidden' as const,
                  boxSizing: 'border-box' as const,
                }}
              >
                <div style={styles.aiSectionHeader}>
                  <h2 style={styles.sectionTitle}>🤖 AI-Powered Interpretation</h2>
                  {!aiInterpretation && !loadingAI && (
                    <button onClick={loadAIInterpretation} style={styles.getAiButton} disabled={loadingAI}>
                      ✨ Get AI Interpretation
                    </button>
                  )}
                </div>

                {loadingAI && (
                  <div style={styles.aiLoading}>
                    <div style={styles.aiSpinner}></div>
                    <p>AI is analyzing your results...</p>
                  </div>
                )}

                {aiError && !loadingAI && (
                  <div style={styles.aiError}>
                    <p>⚠️ {aiError}</p>
                    <p style={styles.aiErrorNote}>Your results are still valid. AI interpretation is temporarily unavailable.</p>
                    {!aiError.includes('quota exceeded') && (
                      <button onClick={() => { setAiError(null); loadAIInterpretation(); }} style={styles.retryButton}>
                        Try Again
                      </button>
                    )}
                  </div>
                )}

                {!loadingAI && !aiInterpretation && !aiError && (
                  <div style={styles.aiPrompt}>
                    <div style={styles.aiPromptIcon}>🤖</div>
                    <h3 style={styles.aiPromptTitle}>Get Expert Analysis</h3>
                    <p style={styles.aiPromptText}>
                      Click the button above to get AI-powered insights including executive summary,
                      effect size interpretation, bandwidth assessment, limitations, and actionable recommendations.
                    </p>
                  </div>
                )}

                {aiInterpretation && !loadingAI && (
                  <>
                    <div style={styles.aiCard}>
                      <h3 style={styles.aiCardTitle}>Executive Summary</h3>
                      <p style={styles.aiText}>{aiInterpretation.executive_summary}</p>
                    </div>
                    {aiInterpretation.parallel_trends_interpretation && (
                      <div style={styles.aiCard}>
                        <h3 style={styles.aiCardTitle}>Bandwidth & Design Assessment</h3>
                        <p style={styles.aiText}>{aiInterpretation.parallel_trends_interpretation}</p>
                      </div>
                    )}
                    {aiInterpretation.effect_size_interpretation && (
                      <div style={styles.aiCard}>
                        <h3 style={styles.aiCardTitle}>Effect Size</h3>
                        <p style={styles.aiText}>{aiInterpretation.effect_size_interpretation}</p>
                      </div>
                    )}
                    {aiInterpretation.statistical_interpretation && (
                      <div style={styles.aiCard}>
                        <h3 style={styles.aiCardTitle}>Statistical Significance</h3>
                        <p style={styles.aiText}>{aiInterpretation.statistical_interpretation}</p>
                      </div>
                    )}
                    {aiInterpretation.limitations && aiInterpretation.limitations.length > 0 && (
                      <div style={{ ...styles.aiCard, ...styles.aiCardWarning }}>
                        <h3 style={styles.aiCardTitle}>⚠️ Limitations & Caveats</h3>
                        <ul style={styles.aiList}>
                          {aiInterpretation.limitations.map((limit, i) => (
                            <li key={i} style={styles.aiListItem}>{limit}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiInterpretation.implications && aiInterpretation.implications.length > 0 && (
                      <div style={{ ...styles.aiCard, ...styles.aiCardSuccess }}>
                        <h3 style={styles.aiCardTitle}>💡 Practical Implications</h3>
                        <ul style={styles.aiList}>
                          {aiInterpretation.implications.map((imp, i) => (
                            <li key={i} style={styles.aiListItem}>{imp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiInterpretation.next_steps && aiInterpretation.next_steps.length > 0 && (
                      <div style={{ ...styles.aiCard, ...styles.aiCardNextSteps }}>
                        <h3 style={styles.aiCardTitle}>🚀 Recommended Next Steps</h3>
                        <ul style={styles.aiList}>
                          {aiInterpretation.next_steps.map((step, i) => (
                            <li key={i} style={styles.aiListItem}>
                              <span style={styles.stepNumber}>{i + 1}</span>
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiInterpretation.recommendation && (
                      <div style={{ ...styles.aiCard, ...styles.aiCardRecommendation }}>
                        <h3 style={styles.aiCardTitle}>📋 Bottom Line</h3>
                        <p style={styles.aiText}>{aiInterpretation.recommendation}</p>
                        {aiInterpretation.confidence_level && (
                          <p style={styles.confidenceLevel}>
                            Analysis Confidence: <strong style={{
                              color: aiInterpretation.confidence_level === 'high' ? '#28a745' :
                                aiInterpretation.confidence_level === 'medium' ? '#ffc107' : '#dc3545',
                            }}>{aiInterpretation.confidence_level.toUpperCase()}</strong>
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Ask AI Chat */}
                <div style={{ marginTop: '24px', borderTop: '2px solid #e9ecef', paddingTop: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#043873', margin: '0 0 16px 0' }}>
                    💬 Ask AI
                  </h3>
                  <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px', lineHeight: 1.5 }}>
                    Ask questions about your study, dataset, or causal inference concepts.
                  </p>

                  <div style={{
                    maxHeight: '400px',
                    overflowY: 'auto' as const,
                    marginBottom: '16px',
                    padding: '12px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #e9ecef',
                    minHeight: '200px',
                  }}>
                    {chatMessages.length === 0 ? (
                      <div style={{ textAlign: 'center' as const, color: '#999', padding: '40px 20px', fontSize: '14px' }}>
                        Start a conversation by asking a question below.
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          style={{
                            marginBottom: '16px',
                            display: 'flex',
                            flexDirection: 'column' as const,
                            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <div style={{
                            maxWidth: '85%',
                            padding: '10px 14px',
                            borderRadius: '12px',
                            backgroundColor: msg.role === 'user' ? '#4F9CF9' : '#ffffff',
                            color: msg.role === 'user' ? '#ffffff' : '#333',
                            fontSize: '14px',
                            lineHeight: 1.5,
                            boxShadow: msg.role === 'user' ? 'none' : '0 1px 3px rgba(0,0,0,0.1)',
                            border: msg.role === 'user' ? 'none' : '1px solid #e9ecef',
                            whiteSpace: 'pre-wrap' as const,
                            wordBreak: 'break-word' as const,
                          }}>
                            {msg.content}
                          </div>
                        </div>
                      ))
                    )}
                    {chatLoading && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div style={{
                          padding: '10px 14px',
                          borderRadius: '12px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #e9ecef',
                          fontSize: '14px',
                          color: '#666',
                          display: 'flex',
                          alignItems: 'center',
                        }}>
                          <div style={{
                            width: '16px',
                            height: '16px',
                            border: '2px solid #f3f3f3',
                            borderTop: '2px solid #4F9CF9',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginRight: '8px',
                          }} />
                          <span>AI is thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatMessagesEndRef} />
                  </div>

                  {chatError && (
                    <div style={{
                      padding: '10px',
                      marginBottom: '12px',
                      backgroundColor: '#f8d7da',
                      color: '#721c24',
                      borderRadius: '6px',
                      fontSize: '13px',
                      border: '1px solid #f5c6cb',
                    }}>
                      ⚠️ {chatError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <textarea
                      value={chatInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.length <= MAX_MESSAGE_LENGTH) {
                          setChatInput(v);
                          setChatError(null);
                        }
                      }}
                      onKeyPress={handleChatInputKeyPress}
                      placeholder="Ask a question about your analysis..."
                      disabled={chatLoading}
                      style={{
                        flex: 1,
                        minHeight: '60px',
                        maxHeight: '120px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #dee2e6',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        resize: 'vertical' as const,
                        outline: 'none',
                        boxSizing: 'border-box' as const,
                      }}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || chatLoading || chatInput.length > MAX_MESSAGE_LENGTH}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: chatInput.trim() && !chatLoading && chatInput.length <= MAX_MESSAGE_LENGTH ? '#4F9CF9' : '#ccc',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: chatInput.trim() && !chatLoading && chatInput.length <= MAX_MESSAGE_LENGTH ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        fontWeight: 600,
                        height: '60px',
                        minWidth: '80px',
                      }}
                    >
                      {chatLoading ? '...' : 'Send'}
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '6px', textAlign: 'right' as const }}>
                    {chatInput.length}/{MAX_MESSAGE_LENGTH} characters
                  </div>

                  {recommendedQuestions.length > 0 && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e9ecef' }}>
                      <div style={{ fontSize: '13px', color: '#666', marginBottom: '10px', fontWeight: 500 }}>
                        💡 Suggested questions:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                        {recommendedQuestions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setChatInput(q);
                              setChatError(null);
                              setTimeout(() => {
                                const ta = document.querySelector('textarea[placeholder*="Ask a question"]') as HTMLTextAreaElement;
                                if (ta) {
                                  ta.focus();
                                  ta.setSelectionRange(q.length, q.length);
                                }
                              }, 0);
                            }}
                            disabled={chatLoading}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: '#f8f9fa',
                              border: '1px solid #dee2e6',
                              borderRadius: '8px',
                              fontSize: '13px',
                              color: '#043873',
                              cursor: chatLoading ? 'not-allowed' : 'pointer',
                              textAlign: 'left' as const,
                              opacity: chatLoading ? 0.6 : 1,
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {isAiSidebarCollapsed && (
            <button
              onClick={handleOpenAiSection}
              style={{
                position: 'fixed',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: '60px',
                height: '220px',
                backgroundColor: '#4F9CF9',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px 0 0 8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                boxShadow: '-4px 0 12px rgba(79, 156, 249, 0.3)',
                zIndex: 1000,
                padding: '20px 10px',
              }}
              title="Show AI Interpretation"
              type="button"
            >
              <span style={{ fontSize: '14px', fontWeight: 600, writingMode: 'vertical-rl', textOrientation: 'mixed', letterSpacing: '1px' }}>
                Open AI section
              </span>
            </button>
          )}
        </div>
      </div>
      <BottomProgressBar
        currentStep={currentStep}
        steps={steps}
        onPrev={goToPreviousStep}
        onNext={goToNextStep}
        canGoNext={false}
        onStepClick={(stepPath) => navigateToStep(stepPath)}
      />
    </div>
  );
};

export default RDResults;

const styles = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '120px',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5',
  },
  mainLayout: {
    display: 'flex',
    gap: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px 10px',
    width: '100%',
    boxSizing: 'border-box' as const,
    alignItems: 'flex-start',
    position: 'relative' as const,
  },
  mainContent: {
    flex: '1 1 0',
    minWidth: 0,
    boxSizing: 'border-box' as const,
  },
  aiSidebar: {
    width: '420px',
    maxHeight: 'calc(100vh - 110px)',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    boxSizing: 'border-box' as const,
    transition: 'all 0.3s ease',
  },
  container: {
    paddingTop: '70px',
    paddingBottom: '100px',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px',
  },
  loadingText: {
    fontSize: '18px',
    color: '#666',
    margin: 0,
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5',
    padding: '40px 20px',
    textAlign: 'center' as const,
  },
  errorIcon: {
    fontSize: '64px',
    marginBottom: '20px',
  },
  errorTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#dc3545',
    margin: '0 0 15px 0',
  },
  errorMessage: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 30px 0',
    maxWidth: '500px',
    lineHeight: '1.5',
  },
  backButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  header: {
    textAlign: 'center' as const,
    padding: '40px 20px 30px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0',
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    margin: 0,
  },
  content: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '0 20px 40px',
  },
  mainResultCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as const,
    marginBottom: '30px',
  },
  resultLabel: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#666',
    margin: '0 0 15px 0',
  },
  effectValue: {
    fontSize: '48px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 15px 0',
  },
  ciContainer: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '20px',
  },
  ciLabel: {
    fontWeight: '600',
    marginRight: '8px',
  },
  ciValue: {
    fontFamily: 'monospace',
  },
  significanceBadge: {
    display: 'inline-block',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
  },
  significantBadge: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  notSignificantBadge: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },
  statCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '25px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as const,
  },
  statLabel: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '10px',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#043873',
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    marginBottom: '30px',
  },
  infoTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 20px 0',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '15px',
  },
  infoItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
  },
  infoLabel: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: '14px',
    color: '#333',
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '12px',
    padding: '25px',
    marginBottom: '30px',
  },
  warningTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#856404',
    margin: '0 0 15px 0',
  },
  warningList: {
    margin: 0,
    paddingLeft: '20px',
    color: '#856404',
    lineHeight: '1.6',
  },
  // AI Interpretation styles
  aiSection: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    border: '1px solid #e0e0e0',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  aiSectionHeader: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#043873',
    margin: 0,
  },
  aiSectionTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#043873',
    margin: 0,
  },
  getAiButton: {
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  aiLoading: {
    textAlign: 'center' as const,
    padding: '40px',
  },
  aiSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #4F9CF9',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 16px',
  },
  aiError: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #f5c6cb',
  },
  aiErrorNote: {
    fontSize: '14px',
    marginTop: '8px',
    opacity: 0.9,
  },
  retryButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '12px',
  },
  aiPrompt: {
    textAlign: 'center' as const,
    padding: '40px',
  },
  aiPromptIcon: {
    fontSize: '36px',
    marginBottom: '12px',
  },
  aiPromptTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 8px 0',
  },
  aiPromptText: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.6',
    margin: '0 auto',
  },
  aiCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    border: '1px solid #e9ecef',
    borderLeft: '4px solid #4F9CF9',
  },
  aiCardWarning: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
  },
  aiCardSuccess: {
    backgroundColor: '#d4edda',
    border: '1px solid #28a745',
  },
  aiCardNextSteps: {
    backgroundColor: '#e8f5e9',
    border: '1px solid #4caf50',
  },
  aiCardRecommendation: {
    backgroundColor: '#e3f2fd',
    borderLeft: '4px solid #2196f3',
  },
  aiCardTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 12px 0',
  },
  aiText: {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#333',
    margin: 0,
  },
  aiList: {
    margin: '10px 0',
    paddingLeft: '20px',
  },
  aiListItem: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#333',
    marginBottom: '6px',
  },
  stepNumber: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    backgroundColor: '#4caf50',
    color: 'white',
    borderRadius: '50%',
    marginRight: '8px',
    fontSize: '12px',
    fontWeight: 600,
  },
  confidenceLevel: {
    marginTop: '15px',
    fontSize: '14px',
    color: '#666',
    fontStyle: 'italic',
  },
};

