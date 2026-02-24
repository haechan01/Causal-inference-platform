import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import { aiService, ResultsInterpretation } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import { projectStateService } from '../services/projectStateService';

const COLLAPSE_THRESHOLD = 200;
const MAX_MESSAGE_LENGTH = 2000;

// ── Helper components ────────────────────────────────────────────────────────

const StatPill: React.FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color = '#043873',
}) => (
  <div style={pillStyles.container}>
    <span style={pillStyles.label}>{label}</span>
    <span style={{ ...pillStyles.value, color }}>{value}</span>
  </div>
);

const pillStyles = {
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    padding: '14px 20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    border: '1px solid #e9ecef',
    minWidth: '120px',
  },
  label: { fontSize: '12px', color: '#666', marginBottom: '6px' },
  value: { fontSize: '20px', fontWeight: 'bold' as const },
};

const StrengthBadge: React.FC<{ strength: string }> = ({ strength }) => {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    strong: { bg: '#d4edda', color: '#155724', label: '✓ Strong' },
    moderate: { bg: '#fff3cd', color: '#856404', label: '~ Moderate' },
    weak: { bg: '#ffe5d0', color: '#7d3c0d', label: '⚠ Weak' },
    very_weak: { bg: '#f8d7da', color: '#721c24', label: '✗ Very Weak' },
  };
  const c = cfg[strength] || cfg['weak'];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: '20px',
        backgroundColor: c.bg,
        color: c.color,
        fontSize: '13px',
        fontWeight: '600' as const,
      }}
    >
      {c.label}
    </span>
  );
};

// ── IVResults ────────────────────────────────────────────────────────────────
const IVResults: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { currentStep, steps, goToPreviousStep, goToNextStep, navigateToStep } =
    useProgressStep();

  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [aiInterpretation, setAiInterpretation] =
    useState<ResultsInterpretation | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [aiSidebarWidth, setAiSidebarWidth] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const [isAiSidebarCollapsed, setIsAiSidebarCollapsed] = useState(false);

  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string; timestamp?: string }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [datasetInfo, setDatasetInfo] = useState<any>(null);

  const [expandedStat, setExpandedStat] = useState<
    'ci' | 'pvalue' | 'se' | null
  >(null);

  const recommendedQuestions = [
    'What is the exclusion restriction assumption?',
    'How do I interpret the first-stage F-statistic?',
    'What are the limitations of 2SLS estimation?',
  ];

  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load results ──────────────────────────────────────────────────────────
  useEffect(() => {
    const loadResults = async () => {
      const projectId =
        (location.state as any)?.projectId ||
        parseInt(
          new URLSearchParams(location.search).get('projectId') || '0'
        ) ||
        null;

      let loadedResults: any = null;

      // 1. Project state (backend)
      if (projectId && accessToken) {
        try {
          const project = await projectStateService.loadProject(
            projectId,
            accessToken
          );
          if (project.lastResults?.results && project.lastResults?.parameters) {
            loadedResults = project.lastResults;
          }
        } catch (err) {
          console.warn('Failed to load IV results from project state:', err);
        }
      }

      // 2. localStorage keyed by project
      if (!loadedResults && projectId) {
        const stored = localStorage.getItem(`ivAnalysisResults_${projectId}`);
        if (stored) {
          try {
            loadedResults = JSON.parse(stored);
          } catch (e) {
            console.warn('Failed to parse IV results from localStorage:', e);
          }
        }
      }

      // 3. Fallback global key
      if (!loadedResults) {
        const stored = localStorage.getItem('ivAnalysisResults');
        if (stored) {
          try {
            loadedResults = JSON.parse(stored);
          } catch (e) {
            console.warn('Failed to parse IV results:', e);
          }
        }
      }

      if (loadedResults) {
        setResults(loadedResults);

        // Load cached AI interpretation
        const interpretationKey = projectId
          ? `ivAiInterpretation_${projectId}`
          : 'ivAiInterpretation';
        const storedInterp = localStorage.getItem(interpretationKey);
        if (storedInterp) {
          try {
            const parsed = JSON.parse(storedInterp);
            const res = loadedResults.results || {};
            const currentKey = JSON.stringify({
              dataset_id: loadedResults.dataset_id,
              treatment_effect: res.treatment_effect,
              p_value: res.p_value,
            });
            if (parsed.analysisKey === currentKey) {
              setAiInterpretation(parsed.interpretation);
            } else {
              localStorage.removeItem(interpretationKey);
            }
          } catch {
            /* ignore */
          }
        }
      }

      setLoading(false);
    };

    loadResults();
  }, [accessToken, location.state, location.search]);

  // ── Load dataset info for chat context ────────────────────────────────────
  useEffect(() => {
    if (!results || !accessToken) return;
    const loadDatasetInfo = async () => {
      const datasetId =
        results.dataset_id || (location.state as any)?.datasetId;
      const projectId = (location.state as any)?.projectId;
      if (!datasetId) return;
      try {
        const axios = (await import('axios')).default;
        if (projectId) {
          const resp = await axios.get(`/projects/${projectId}/datasets`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const dataset = (resp.data.datasets || []).find(
            (d: any) => d.id === datasetId
          );
          if (dataset) {
            try {
              const prev = await axios.get(`/datasets/${datasetId}/preview`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              setDatasetInfo({
                name: dataset.name,
                columns: prev.data.columns || [],
                summary: prev.data.summary || {},
              });
            } catch {
              setDatasetInfo({ name: dataset.name, columns: [], summary: {} });
            }
          }
        }
      } catch (err) {
        console.error('Error loading dataset info:', err);
      }
    };
    loadDatasetInfo();
  }, [results, accessToken, location.state]);

  // ── Scroll chat ───────────────────────────────────────────────────────────
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── AI sidebar resize ─────────────────────────────────────────────────────
  useEffect(() => {
    let lastWidth = aiSidebarWidth;
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const container = document.querySelector(
        '[data-iv-main-layout]'
      ) as HTMLElement;
      if (!container) return;
      const newWidth = container.getBoundingClientRect().right - e.clientX;
      const clamped = Math.max(COLLAPSE_THRESHOLD, Math.min(800, newWidth));
      lastWidth = clamped;
      if (clamped <= COLLAPSE_THRESHOLD) {
        setIsAiSidebarCollapsed(true);
      } else {
        setIsAiSidebarCollapsed(false);
        setAiSidebarWidth(clamped);
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

  // ── AI interpretation ─────────────────────────────────────────────────────
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
        'Instrumental Variables (2SLS)'
      );
      setAiInterpretation(interpretation);

      const res = results.results || {};
      const analysisKey = JSON.stringify({
        dataset_id: results.dataset_id,
        treatment_effect: res.treatment_effect,
        p_value: res.p_value,
      });
      const projectId =
        (location.state as any)?.projectId ||
        parseInt(
          new URLSearchParams(location.search).get('projectId') || '0'
        ) ||
        null;
      const interpKey = projectId
        ? `ivAiInterpretation_${projectId}`
        : 'ivAiInterpretation';
      localStorage.setItem(
        interpKey,
        JSON.stringify({
          analysisKey,
          interpretation,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (error: any) {
      setAiError(
        error.response?.data?.error ||
          error.message ||
          'Failed to get AI interpretation'
      );
    } finally {
      setLoadingAI(false);
    }
  };

  // ── Chat ──────────────────────────────────────────────────────────────────
  const handleSendMessage = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    if (message.length > MAX_MESSAGE_LENGTH) {
      setChatError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }
    setChatError(null);
    setChatLoading(true);
    const userMessage = {
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    try {
      const history = chatMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const analysisContext = results
        ? {
            parameters: results.parameters,
            results: results.results,
            ai_interpretation: aiInterpretation || undefined,
          }
        : undefined;
      const response = await aiService.chat(
        message,
        history,
        analysisContext,
        datasetInfo
      );
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant' as const,
          content: response.response,
          timestamp: response.timestamp,
        },
      ]);
    } catch (error: any) {
      setChatError(
        error.response?.data?.error ||
          error.message ||
          'Failed to send message'
      );
      setChatMessages((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ── Loading / no results ──────────────────────────────────────────────────
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
            No IV analysis results available. Please run an analysis first.
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

  const { results: res, parameters } = results;
  const isSignificant = res.p_value < 0.05;
  const isWeak = res.instrument_strength?.is_weak;
  const overid = res.overidentification_test;
  const overidApplicable = overid && !overid.not_applicable;
  const sensitivity = results.sensitivity_analysis;

  return (
    <div>
      <Navbar />
      <div style={styles.contentContainer}>
        <div
          data-iv-main-layout
          style={{
            ...styles.mainLayout,
            justifyContent: isAiSidebarCollapsed ? 'center' : 'flex-start',
          }}
        >
          {/* ── Main content ── */}
          <div
            style={{
              ...styles.mainContent,
              flex: isAiSidebarCollapsed ? '1 1 auto' : '1 1 60%',
              maxWidth: isAiSidebarCollapsed ? '1100px' : 'none',
              margin: isAiSidebarCollapsed ? '0 auto' : '0',
            }}
          >
            <div style={styles.header}>
              <h1 style={styles.title}>Instrumental Variables Results</h1>
              <p style={styles.subtitle}>
                2SLS estimate: effect of{' '}
                <strong>{parameters.treatment}</strong> on{' '}
                <strong>{parameters.outcome}</strong>
              </p>
              {parameters.instruments && (
                <p style={styles.subtitleSmall}>
                  Instruments: {(parameters.instruments as string[]).join(', ')}
                </p>
              )}
            </div>

            <div style={styles.content}>

              {/* ── Main result card ── */}
              <div style={styles.mainResultCard}>
                <div style={styles.estimandLabel}>
                  2SLS Causal Effect Estimate
                  {res.estimand && (
                    <span style={styles.estimandBadge}>{res.estimand}</span>
                  )}
                </div>
                <div style={styles.effectValue}>
                  {typeof res.treatment_effect === 'number'
                    ? res.treatment_effect.toFixed(3)
                    : '—'}
                </div>
                <div
                  style={{
                    ...styles.significanceBadge,
                    ...(isSignificant
                      ? styles.significantBadge
                      : styles.notSignificantBadge),
                  }}
                >
                  {isSignificant
                    ? '✓ Statistically Significant (p < 0.05)'
                    : 'Not Statistically Significant (p ≥ 0.05)'}
                </div>

                {isWeak && (
                  <div style={styles.weakInstrumentWarning}>
                    ⚠️ <strong>Weak instruments detected.</strong> 2SLS
                    estimates may be biased toward OLS. Interpret with caution.
                  </div>
                )}

                {/* Stats row */}
                <div style={styles.statsRow}>
                  <div style={styles.statRowItem}>
                    <span style={styles.statRowLabel}>95% CI</span>
                    <span style={{ ...styles.statRowValue, fontFamily: 'monospace' }}>
                      [{res.ci_lower?.toFixed(3)}, {res.ci_upper?.toFixed(3)}]
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStat((s) => (s === 'ci' ? null : 'ci'))
                      }
                      style={
                        expandedStat === 'ci'
                          ? styles.expandButtonActive
                          : styles.expandButton
                      }
                    >
                      {expandedStat === 'ci' ? '▼ Hide' : '▶ How is this derived?'}
                    </button>
                  </div>
                  <div style={styles.statRowItem}>
                    <span style={styles.statRowLabel}>P-Value</span>
                    <span style={styles.statRowValue}>
                      {res.p_value?.toFixed(4)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStat((s) => (s === 'pvalue' ? null : 'pvalue'))
                      }
                      style={
                        expandedStat === 'pvalue'
                          ? styles.expandButtonActive
                          : styles.expandButton
                      }
                    >
                      {expandedStat === 'pvalue' ? '▼ Hide' : '▶ How is this derived?'}
                    </button>
                  </div>
                  <div style={styles.statRowItem}>
                    <span style={styles.statRowLabel}>Standard Error</span>
                    <span style={styles.statRowValue}>
                      {res.se?.toFixed(4)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStat((s) => (s === 'se' ? null : 'se'))
                      }
                      style={
                        expandedStat === 'se'
                          ? styles.expandButtonActive
                          : styles.expandButton
                      }
                    >
                      {expandedStat === 'se' ? '▼ Hide' : '▶ How is this derived?'}
                    </button>
                  </div>
                </div>

                {expandedStat && (
                  <div style={styles.explanationBox}>
                    {expandedStat === 'ci' && (
                      <p style={styles.explanationText}>
                        The 95% confidence interval is computed as estimate ± 1.96 × SE
                        = {res.treatment_effect?.toFixed(3)} ± 1.96 × {res.se?.toFixed(4)}
                        = [{res.ci_lower?.toFixed(3)}, {res.ci_upper?.toFixed(3)}].
                        If the interval excludes zero, the effect is statistically significant at 5%.
                        These are asymptotic 2SLS standard errors using the structural residuals.
                      </p>
                    )}
                    {expandedStat === 'pvalue' && (
                      <p style={styles.explanationText}>
                        The p-value is derived from the z-statistic: z = estimate / SE
                        = {res.treatment_effect?.toFixed(3)} / {res.se?.toFixed(4)}
                        ≈ {res.z_statistic?.toFixed(3)}.
                        The p-value of {res.p_value?.toFixed(4)} is the two-tailed probability
                        under a standard normal distribution. A p-value below 0.05 indicates
                        statistical significance at the conventional level.
                      </p>
                    )}
                    {expandedStat === 'se' && (
                      <p style={styles.explanationText}>
                        The 2SLS standard error is computed from the structural residuals
                        (Y − X·β using the original X, not predicted X̂):
                        σ² = residuals'·residuals / (n − k) where n={res.n_obs} and
                        k = {1 + 1 + (res.n_controls || 0)} (intercept + treatment + controls).
                        Var(β) = σ² × (X̂'X̂)⁻¹. Using structural residuals gives
                        correct, consistent SEs unlike naive second-stage OLS SEs.
                      </p>
                    )}
                  </div>
                )}

                {/* Meta info */}
                <div style={styles.metaRow}>
                  <StatPill label="Observations" value={String(res.n_obs || '—')} />
                  <StatPill label="Instruments" value={String(res.n_instruments || '—')} />
                  <StatPill
                    label="Controls"
                    value={String(res.n_controls || 0)}
                    color="#555"
                  />
                </div>
              </div>

              {/* ── Instrument Strength ── */}
              {res.first_stage && res.instrument_strength && (
                <div style={styles.infoCard}>
                  <h3 style={styles.infoTitle}>
                    🔩 Instrument Strength (First Stage)
                  </h3>

                  <div style={styles.strengthHeader}>
                    <div>
                      <span style={styles.fStatValue}>
                        F = {res.first_stage.f_statistic?.toFixed(2)}
                      </span>
                      <span style={styles.fStatNote}>
                        {' '}(p = {res.first_stage.f_p_value?.toFixed(4)})
                      </span>
                    </div>
                    <StrengthBadge strength={res.instrument_strength.strength} />
                  </div>

                  <p style={styles.strengthMessage}>
                    {res.instrument_strength.message}
                  </p>

                  <div style={styles.thresholdGrid}>
                    <div style={styles.thresholdItem}>
                      <span style={styles.thresholdLabel}>
                        Stock-Yogo threshold (10% max size distortion):
                      </span>
                      <span style={styles.thresholdValue}>
                        {res.instrument_strength.stock_yogo_threshold?.toFixed(2)}
                      </span>
                    </div>
                    <div style={styles.thresholdItem}>
                      <span style={styles.thresholdLabel}>
                        Rule-of-thumb threshold:
                      </span>
                      <span style={styles.thresholdValue}>
                        {res.instrument_strength.rule_of_thumb_threshold}
                      </span>
                    </div>
                    <div style={styles.thresholdItem}>
                      <span style={styles.thresholdLabel}>
                        First-stage R²:
                      </span>
                      <span style={styles.thresholdValue}>
                        {res.first_stage.r_squared?.toFixed(4)}
                      </span>
                    </div>
                    <div style={styles.thresholdItem}>
                      <span style={styles.thresholdLabel}>
                        Partial R² (instruments only):
                      </span>
                      <span style={styles.thresholdValue}>
                        {res.first_stage.r_squared_partial?.toFixed(4)}
                      </span>
                    </div>
                  </div>

                  {/* Instrument coefficients */}
                  {res.first_stage.instrument_coefficients &&
                    Object.keys(res.first_stage.instrument_coefficients).length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        <p style={styles.subSectionTitle}>
                          Instrument Coefficients (First Stage)
                        </p>
                        <div style={styles.coefTable}>
                          <div style={styles.coefHeader}>
                            <span>Instrument</span>
                            <span>Coefficient</span>
                            <span>SE</span>
                            <span>t-stat</span>
                            <span>p-value</span>
                          </div>
                          {Object.entries(
                            res.first_stage.instrument_coefficients
                          ).map(([name, coef]: [string, any]) => (
                            <div key={name} style={styles.coefRow}>
                              <span style={styles.coefName}>{name}</span>
                              <span>{coef.coefficient?.toFixed(4)}</span>
                              <span>{coef.se?.toFixed(4)}</span>
                              <span>{coef.t_stat?.toFixed(3)}</span>
                              <span
                                style={{
                                  color:
                                    coef.p_value < 0.05 ? '#155724' : '#666',
                                  fontWeight:
                                    coef.p_value < 0.05 ? '600' : 'normal',
                                }}
                              >
                                {coef.p_value?.toFixed(4)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* ── Endogeneity Test (Wu-Hausman) ── */}
              {res.endogeneity_test && (
                <div style={styles.infoCard}>
                  <h3 style={styles.infoTitle}>
                    🧪 Endogeneity Test (Wu-Hausman)
                  </h3>
                  <div style={styles.testRow}>
                    <div>
                      <span style={styles.testStatLabel}>Test Statistic: </span>
                      <span style={styles.testStatValue}>
                        {res.endogeneity_test.statistic?.toFixed(4)}
                      </span>
                    </div>
                    <div>
                      <span style={styles.testStatLabel}>p-value: </span>
                      <span
                        style={{
                          ...styles.testStatValue,
                          color:
                            res.endogeneity_test.p_value < 0.05
                              ? '#155724'
                              : '#666',
                        }}
                      >
                        {res.endogeneity_test.p_value?.toFixed(4)}
                      </span>
                    </div>
                    <div
                      style={{
                        ...styles.testVerdict,
                        backgroundColor: res.endogeneity_test.is_endogenous
                          ? '#d4edda'
                          : '#f8d7da',
                        color: res.endogeneity_test.is_endogenous
                          ? '#155724'
                          : '#721c24',
                      }}
                    >
                      {res.endogeneity_test.is_endogenous
                        ? '✓ Endogeneity confirmed — IV is justified'
                        : '○ No significant endogeneity — OLS may suffice'}
                    </div>
                  </div>
                  <p style={styles.testExplanation}>
                    {res.endogeneity_test.message ||
                      'The Wu-Hausman test checks whether the treatment variable is endogenous. A significant result (p < 0.05) means OLS would be biased and IV estimation is justified.'}
                  </p>
                </div>
              )}

              {/* ── Over-identification Test (Sargan-Hansen) ── */}
              {overidApplicable ? (
                <div style={styles.infoCard}>
                  <h3 style={styles.infoTitle}>
                    📐 Over-identification Test (Sargan-Hansen)
                  </h3>
                  <div style={styles.testRow}>
                    <div>
                      <span style={styles.testStatLabel}>J Statistic: </span>
                      <span style={styles.testStatValue}>
                        {overid.statistic?.toFixed(4)}
                      </span>
                    </div>
                    <div>
                      <span style={styles.testStatLabel}>p-value: </span>
                      <span
                        style={{
                          ...styles.testStatValue,
                          color: overid.p_value < 0.05 ? '#721c24' : '#155724',
                        }}
                      >
                        {overid.p_value?.toFixed(4)}
                      </span>
                    </div>
                    <div>
                      <span style={styles.testStatLabel}>
                        Over-id restrictions:{' '}
                      </span>
                      <span style={styles.testStatValue}>
                        {overid.n_overidentifying_restrictions}
                      </span>
                    </div>
                    <div
                      style={{
                        ...styles.testVerdict,
                        backgroundColor: overid.is_overidentified_rejected
                          ? '#f8d7da'
                          : '#d4edda',
                        color: overid.is_overidentified_rejected
                          ? '#721c24'
                          : '#155724',
                      }}
                    >
                      {overid.is_overidentified_rejected
                        ? '✗ Exclusion restrictions rejected — some instruments may be invalid'
                        : '✓ Exclusion restrictions not rejected — instruments appear valid'}
                    </div>
                  </div>
                  <p style={styles.testExplanation}>
                    {overid.message ||
                      'The Sargan-Hansen J-test checks whether over-identifying restrictions are satisfied. Rejection (p < 0.05) suggests some instruments may violate the exclusion restriction.'}
                  </p>
                </div>
              ) : overid?.not_applicable ? (
                <div style={styles.infoCardMuted}>
                  <h3 style={styles.infoTitle}>
                    📐 Over-identification Test (Sargan-Hansen)
                  </h3>
                  <p style={styles.mutedNote}>
                    {overid.reason ||
                      'Not applicable for just-identified IV (1 instrument = 1 endogenous variable). The Sargan-Hansen test requires more instruments than endogenous variables.'}
                  </p>
                </div>
              ) : null}

              {/* ── OLS Comparison ── */}
              {res.ols_comparison && (
                <div style={styles.infoCard}>
                  <h3 style={styles.infoTitle}>📊 OLS vs. 2SLS Comparison</h3>
                  <p style={styles.infoSubtitle}>
                    The difference between OLS and 2SLS estimates reflects the
                    degree of endogeneity bias corrected by IV.
                  </p>
                  <div style={styles.comparisonGrid}>
                    <div style={styles.comparisonItem}>
                      <div style={styles.comparisonLabel}>OLS Estimate</div>
                      <div style={styles.comparisonValue}>
                        {res.ols_comparison.estimate?.toFixed(4)}
                      </div>
                      <div style={styles.comparisonSub}>
                        SE: {res.ols_comparison.se?.toFixed(4)} &nbsp;|&nbsp; 95%
                        CI: [{res.ols_comparison.ci_lower?.toFixed(3)},{' '}
                        {res.ols_comparison.ci_upper?.toFixed(3)}]
                      </div>
                    </div>
                    <div style={styles.comparisonArrow}>→</div>
                    <div
                      style={{
                        ...styles.comparisonItem,
                        borderColor: '#043873',
                        backgroundColor: '#f0f7ff',
                      }}
                    >
                      <div style={styles.comparisonLabel}>2SLS Estimate</div>
                      <div
                        style={{ ...styles.comparisonValue, color: '#043873' }}
                      >
                        {res.treatment_effect?.toFixed(4)}
                      </div>
                      <div style={styles.comparisonSub}>
                        SE: {res.se?.toFixed(4)} &nbsp;|&nbsp; 95% CI: [
                        {res.ci_lower?.toFixed(3)}, {res.ci_upper?.toFixed(3)}]
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const diff =
                      (res.treatment_effect || 0) -
                      (res.ols_comparison.estimate || 0);
                    const absDiff = Math.abs(diff);
                    const pctDiff = res.ols_comparison.estimate
                      ? (absDiff / Math.abs(res.ols_comparison.estimate)) * 100
                      : null;
                    return (
                      <p style={styles.biasCorrectionNote}>
                        <strong>Bias correction:</strong> 2SLS corrects{' '}
                        {diff > 0 ? 'upward' : 'downward'} by{' '}
                        {absDiff.toFixed(4)}
                        {pctDiff != null
                          ? ` (${pctDiff.toFixed(1)}% relative to OLS)`
                          : ''}
                        . A large difference suggests substantial endogeneity in
                        the OLS estimate.
                      </p>
                    );
                  })()}
                </div>
              )}

              {/* ── Sensitivity Analysis ── */}
              {sensitivity && !sensitivity.error && (
                <div style={styles.infoCard}>
                  <h3 style={styles.infoTitle}>🔍 Sensitivity Analysis</h3>
                  {sensitivity.anderson_rubin_ci && (
                    <div style={{ marginBottom: '16px' }}>
                      <p style={styles.subSectionTitle}>
                        Anderson-Rubin Confidence Interval
                        <span style={styles.subSectionNote}>
                          {' '}(weak-instrument robust)
                        </span>
                      </p>
                      <p style={styles.testExplanation}>
                        AR CI: [{sensitivity.anderson_rubin_ci.ci_lower?.toFixed(4)},{' '}
                        {sensitivity.anderson_rubin_ci.ci_upper?.toFixed(4)}] &nbsp;
                        (α = {sensitivity.anderson_rubin_ci.alpha})
                      </p>
                      <p style={styles.testExplanation}>
                        {sensitivity.anderson_rubin_ci.note}
                      </p>
                    </div>
                  )}
                  {sensitivity.leave_one_out &&
                    sensitivity.leave_one_out.length > 0 && (
                      <div>
                        <p style={styles.subSectionTitle}>
                          Leave-One-Out Instrument Sensitivity
                        </p>
                        <div style={styles.louTable}>
                          <div style={styles.louHeader}>
                            <span>Dropped Instrument</span>
                            <span>2SLS Estimate</span>
                            <span>SE</span>
                            <span>p-value</span>
                            <span>CI</span>
                          </div>
                          {sensitivity.leave_one_out.map((row: any, i: number) => (
                            <div key={i} style={styles.louRow}>
                              <span style={{ fontWeight: '500' as const }}>
                                {row.dropped_instrument}
                              </span>
                              <span>{row.estimate?.toFixed(4)}</span>
                              <span>{row.se?.toFixed(4)}</span>
                              <span
                                style={{
                                  color: row.p_value < 0.05 ? '#155724' : '#666',
                                }}
                              >
                                {row.p_value?.toFixed(4)}
                              </span>
                              <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                                [{row.ci_lower?.toFixed(3)}, {row.ci_upper?.toFixed(3)}]
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* ── Warnings ── */}
              {res.warnings && res.warnings.length > 0 && (
                <div style={styles.warningCard}>
                  <h3 style={styles.warningTitle}>⚠️ Warnings</h3>
                  <ul style={styles.warningList}>
                    {res.warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* ── AI Sidebar ── */}
          {!isAiSidebarCollapsed && (
            <div
              style={{
                ...styles.aiSidebar,
                width: `${aiSidebarWidth}px`,
                flex: `0 0 ${aiSidebarWidth}px`,
                position: 'sticky' as const,
                top: '90px',
                marginTop: '90px',
                maxHeight: 'calc(100vh - 200px)',
              }}
            >
              {/* Resize handle */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizing(true);
                }}
                style={{
                  position: 'absolute',
                  left: '-4px',
                  top: 0,
                  bottom: 0,
                  width: '8px',
                  cursor: 'col-resize',
                  zIndex: 10,
                  backgroundColor: isResizing
                    ? 'rgba(79,156,249,0.3)'
                    : 'transparent',
                  borderLeft: isResizing ? '2px solid #4F9CF9' : 'none',
                }}
              />

              <div
                style={{
                  ...styles.aiSection,
                  maxHeight: 'calc(100vh - 200px)',
                  overflowY: 'auto' as const,
                  boxSizing: 'border-box' as const,
                }}
              >
                {/* AI Interpretation */}
                <div style={styles.aiSectionHeader}>
                  <h2 style={styles.sectionTitle}>
                    🤖 AI-Powered Interpretation
                  </h2>
                  {!aiInterpretation && !loadingAI && (
                    <button
                      onClick={loadAIInterpretation}
                      style={styles.getAiButton}
                      disabled={loadingAI}
                    >
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
                    <p style={styles.aiErrorNote}>
                      Your results are still valid. AI interpretation is
                      temporarily unavailable.
                    </p>
                    {!aiError.includes('quota exceeded') && (
                      <button
                        onClick={() => {
                          setAiError(null);
                          loadAIInterpretation();
                        }}
                        style={styles.retryButton}
                      >
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
                      Click above to get AI insights: executive summary, effect
                      size interpretation, instrument validity assessment,
                      limitations, and practical implications.
                    </p>
                  </div>
                )}

                {aiInterpretation && !loadingAI && (
                  <>
                    <div style={styles.aiCard}>
                      <h3 style={styles.aiCardTitle}>Executive Summary</h3>
                      <p style={styles.aiText}>
                        {aiInterpretation.executive_summary}
                      </p>
                    </div>
                    {aiInterpretation.parallel_trends_interpretation && (
                      <div style={styles.aiCard}>
                        <h3 style={styles.aiCardTitle}>
                          Instrument Validity Assessment
                        </h3>
                        <p style={styles.aiText}>
                          {aiInterpretation.parallel_trends_interpretation}
                        </p>
                      </div>
                    )}
                    {aiInterpretation.effect_size_interpretation && (
                      <div style={styles.aiCard}>
                        <h3 style={styles.aiCardTitle}>Effect Size</h3>
                        <p style={styles.aiText}>
                          {aiInterpretation.effect_size_interpretation}
                        </p>
                      </div>
                    )}
                    {aiInterpretation.statistical_interpretation && (
                      <div style={styles.aiCard}>
                        <h3 style={styles.aiCardTitle}>
                          Statistical Significance
                        </h3>
                        <p style={styles.aiText}>
                          {aiInterpretation.statistical_interpretation}
                        </p>
                      </div>
                    )}
                    {aiInterpretation.limitations &&
                      aiInterpretation.limitations.length > 0 && (
                        <div
                          style={{ ...styles.aiCard, ...styles.aiCardWarning }}
                        >
                          <h3 style={styles.aiCardTitle}>
                            ⚠️ Limitations & Caveats
                          </h3>
                          <ul style={styles.aiList}>
                            {aiInterpretation.limitations.map((l, i) => (
                              <li key={i} style={styles.aiListItem}>
                                {l}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {aiInterpretation.implications &&
                      aiInterpretation.implications.length > 0 && (
                        <div
                          style={{ ...styles.aiCard, ...styles.aiCardSuccess }}
                        >
                          <h3 style={styles.aiCardTitle}>
                            💡 Practical Implications
                          </h3>
                          <ul style={styles.aiList}>
                            {aiInterpretation.implications.map((imp, i) => (
                              <li key={i} style={styles.aiListItem}>
                                {imp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {aiInterpretation.next_steps &&
                      aiInterpretation.next_steps.length > 0 && (
                        <div
                          style={{
                            ...styles.aiCard,
                            ...styles.aiCardNextSteps,
                          }}
                        >
                          <h3 style={styles.aiCardTitle}>
                            🚀 Recommended Next Steps
                          </h3>
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
                      <div
                        style={{
                          ...styles.aiCard,
                          ...styles.aiCardRecommendation,
                        }}
                      >
                        <h3 style={styles.aiCardTitle}>📋 Bottom Line</h3>
                        <p style={styles.aiText}>
                          {aiInterpretation.recommendation}
                        </p>
                        {aiInterpretation.confidence_level && (
                          <p style={styles.confidenceLevel}>
                            Analysis Confidence:{' '}
                            <strong
                              style={{
                                color:
                                  aiInterpretation.confidence_level === 'high'
                                    ? '#28a745'
                                    : aiInterpretation.confidence_level ===
                                      'medium'
                                    ? '#ffc107'
                                    : '#dc3545',
                              }}
                            >
                              {aiInterpretation.confidence_level.toUpperCase()}
                            </strong>
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Chat section */}
                <div
                  style={{
                    marginTop: '24px',
                    borderTop: '2px solid #e9ecef',
                    paddingTop: '20px',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#043873',
                      margin: '0 0 16px 0',
                    }}
                  >
                    💬 Ask AI
                  </h3>
                  <p
                    style={{
                      fontSize: '13px',
                      color: '#666',
                      marginBottom: '16px',
                      lineHeight: 1.5,
                    }}
                  >
                    Ask questions about your study, dataset, or IV concepts.
                  </p>

                  <div
                    style={{
                      maxHeight: '400px',
                      overflowY: 'auto' as const,
                      marginBottom: '16px',
                      padding: '12px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      border: '1px solid #e9ecef',
                      minHeight: '200px',
                    }}
                  >
                    {chatMessages.length === 0 ? (
                      <div
                        style={{
                          textAlign: 'center' as const,
                          color: '#999',
                          padding: '40px 20px',
                          fontSize: '14px',
                        }}
                      >
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
                            alignItems:
                              msg.role === 'user' ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '85%',
                              padding: '10px 14px',
                              borderRadius: '12px',
                              backgroundColor:
                                msg.role === 'user' ? '#4F9CF9' : '#ffffff',
                              color: msg.role === 'user' ? '#ffffff' : '#333',
                              fontSize: '14px',
                              lineHeight: 1.5,
                              boxShadow:
                                msg.role === 'user'
                                  ? 'none'
                                  : '0 1px 3px rgba(0,0,0,0.1)',
                              border:
                                msg.role === 'user'
                                  ? 'none'
                                  : '1px solid #e9ecef',
                              whiteSpace: 'pre-wrap' as const,
                              wordBreak: 'break-word' as const,
                            }}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))
                    )}
                    {chatLoading && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          marginBottom: '16px',
                        }}
                      >
                        <div
                          style={{
                            padding: '10px 14px',
                            borderRadius: '12px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #e9ecef',
                            fontSize: '14px',
                            color: '#666',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <div
                            style={{
                              width: '16px',
                              height: '16px',
                              border: '2px solid #f3f3f3',
                              borderTop: '2px solid #4F9CF9',
                              borderRadius: '50%',
                              animation: 'spin 1s linear infinite',
                              marginRight: '8px',
                            }}
                          />
                          <span>AI is thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatMessagesEndRef} />
                  </div>

                  {chatError && (
                    <div
                      style={{
                        padding: '10px',
                        marginBottom: '12px',
                        backgroundColor: '#f8d7da',
                        color: '#721c24',
                        borderRadius: '6px',
                        fontSize: '13px',
                        border: '1px solid #f5c6cb',
                      }}
                    >
                      ⚠️ {chatError}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'flex-end',
                    }}
                  >
                    <textarea
                      value={chatInput}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                          setChatInput(e.target.value);
                          setChatError(null);
                        }
                      }}
                      onKeyPress={handleChatKeyPress}
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
                      disabled={
                        !chatInput.trim() ||
                        chatLoading ||
                        chatInput.length > MAX_MESSAGE_LENGTH
                      }
                      style={{
                        padding: '10px 20px',
                        backgroundColor:
                          chatInput.trim() &&
                          !chatLoading &&
                          chatInput.length <= MAX_MESSAGE_LENGTH
                            ? '#4F9CF9'
                            : '#ccc',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor:
                          chatInput.trim() &&
                          !chatLoading &&
                          chatInput.length <= MAX_MESSAGE_LENGTH
                            ? 'pointer'
                            : 'not-allowed',
                        fontSize: '14px',
                        fontWeight: 600,
                        height: '60px',
                        minWidth: '80px',
                      }}
                    >
                      {chatLoading ? '...' : 'Send'}
                    </button>
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#999',
                      marginTop: '6px',
                      textAlign: 'right' as const,
                    }}
                  >
                    {chatInput.length}/{MAX_MESSAGE_LENGTH} characters
                  </div>

                  {recommendedQuestions.length > 0 && (
                    <div
                      style={{
                        marginTop: '16px',
                        paddingTop: '16px',
                        borderTop: '1px solid #e9ecef',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          color: '#666',
                          marginBottom: '10px',
                          fontWeight: 500,
                        }}
                      >
                        💡 Suggested questions:
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column' as const,
                          gap: '8px',
                        }}
                      >
                        {recommendedQuestions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setChatInput(q);
                              setChatError(null);
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

          {/* Collapsed AI tab */}
          {isAiSidebarCollapsed && (
            <button
              onClick={() => {
                setIsAiSidebarCollapsed(false);
                setAiSidebarWidth(480);
              }}
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
                boxShadow: '-4px 0 12px rgba(79,156,249,0.3)',
                zIndex: 1000,
                padding: '20px 10px',
              }}
              type="button"
            >
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  letterSpacing: '1px',
                }}
              >
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

export default IVResults;

// ── Styles ───────────────────────────────────────────────────────────────────
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
    maxHeight: 'calc(100vh - 110px)',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    boxSizing: 'border-box' as const,
    transition: 'all 0.3s ease',
    position: 'relative' as const,
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 70px)',
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
  loadingText: { fontSize: '18px', color: '#666', margin: 0 },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 70px)',
    padding: '40px 20px',
    textAlign: 'center' as const,
  },
  errorIcon: { fontSize: '64px', marginBottom: '20px' },
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
  },
  backButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '16px',
    cursor: 'pointer',
  },
  header: {
    textAlign: 'center' as const,
    padding: '40px 20px 20px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0',
  },
  subtitle: { fontSize: '16px', color: '#555', margin: '0 0 4px 0' },
  subtitleSmall: { fontSize: '13px', color: '#888', margin: 0 },
  content: { maxWidth: '900px', margin: '0 auto', padding: '0 20px 40px' },

  // Main result card
  mainResultCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    textAlign: 'center' as const,
    marginBottom: '30px',
  },
  estimandLabel: {
    fontSize: '18px',
    fontWeight: '600' as const,
    color: '#666',
    margin: '0 0 15px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  estimandBadge: {
    backgroundColor: '#e8f4ff',
    color: '#043873',
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600' as const,
  },
  effectValue: {
    fontSize: '52px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 15px 0',
    fontFamily: 'monospace',
  },
  significanceBadge: {
    display: 'inline-block',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600' as const,
    marginBottom: '12px',
  },
  significantBadge: { backgroundColor: '#d4edda', color: '#155724' },
  notSignificantBadge: { backgroundColor: '#f8d7da', color: '#721c24' },
  weakInstrumentWarning: {
    backgroundColor: '#fff3cd',
    color: '#856404',
    border: '1px solid #ffc107',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '14px',
    margin: '10px 0 20px',
    lineHeight: '1.5',
  },
  statsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '24px',
    marginTop: '24px',
    paddingTop: '20px',
    borderTop: '1px solid #eee',
    justifyContent: 'center',
  },
  statRowItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    minWidth: '200px',
  },
  statRowLabel: { fontSize: '14px', color: '#666', marginBottom: '4px' },
  statRowValue: {
    fontSize: '20px',
    fontWeight: 'bold' as const,
    color: '#043873',
    marginBottom: '8px',
  },
  expandButton: {
    padding: '4px 10px',
    backgroundColor: 'transparent',
    color: '#043873',
    border: '1px solid #043873',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  expandButtonActive: {
    padding: '4px 10px',
    backgroundColor: '#043873',
    color: '#fff',
    border: '1px solid #043873',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  explanationBox: {
    marginTop: '16px',
    padding: '16px 20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    border: '1px solid #e9ecef',
    textAlign: 'left' as const,
  },
  explanationText: {
    margin: 0,
    fontSize: '14px',
    color: '#333',
    lineHeight: 1.6,
  },
  metaRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginTop: '20px',
    flexWrap: 'wrap' as const,
  },

  // Info cards
  infoCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '28px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    marginBottom: '24px',
  },
  infoCardMuted: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    border: '1px solid #dee2e6',
  },
  infoTitle: {
    fontSize: '20px',
    fontWeight: 'bold' as const,
    color: '#333',
    margin: '0 0 16px 0',
  },
  infoSubtitle: { fontSize: '14px', color: '#666', margin: '0 0 16px 0' },
  mutedNote: { fontSize: '14px', color: '#6c757d', margin: 0, lineHeight: '1.5' },

  // Instrument strength
  strengthHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
  },
  fStatValue: {
    fontSize: '28px',
    fontWeight: 'bold' as const,
    color: '#043873',
    fontFamily: 'monospace',
  },
  fStatNote: { fontSize: '14px', color: '#666' },
  strengthMessage: {
    fontSize: '14px',
    color: '#444',
    lineHeight: '1.6',
    margin: '0 0 16px 0',
    padding: '12px 16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
  },
  thresholdGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '10px',
  },
  thresholdItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    fontSize: '13px',
  },
  thresholdLabel: { color: '#666' },
  thresholdValue: { fontWeight: '600' as const, color: '#333' },
  subSectionTitle: {
    fontSize: '15px',
    fontWeight: '600' as const,
    color: '#043873',
    margin: '0 0 10px 0',
  },
  subSectionNote: {
    fontSize: '12px',
    color: '#888',
    fontWeight: 'normal' as const,
  },
  coefTable: {
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    overflow: 'hidden' as const,
  },
  coefHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
    backgroundColor: '#f8f9fa',
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: '600' as const,
    color: '#666',
    gap: '8px',
    borderBottom: '1px solid #e9ecef',
  },
  coefRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
    padding: '10px 16px',
    fontSize: '13px',
    color: '#333',
    gap: '8px',
    borderBottom: '1px solid #f0f0f0',
  },
  coefName: { fontWeight: '500' as const, color: '#043873' },

  // Endogeneity / overid tests
  testRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '12px',
    alignItems: 'center',
    marginBottom: '12px',
  },
  testStatLabel: { fontSize: '14px', color: '#666' },
  testStatValue: { fontSize: '16px', fontWeight: '600' as const, color: '#333' },
  testVerdict: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600' as const,
    width: '100%',
    textAlign: 'center' as const,
  },
  testExplanation: {
    fontSize: '13px',
    color: '#555',
    lineHeight: '1.6',
    margin: 0,
  },

  // OLS comparison
  comparisonGrid: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
  },
  comparisonItem: {
    flex: 1,
    minWidth: '200px',
    padding: '18px',
    border: '1px solid #e0e0e0',
    borderRadius: '10px',
    textAlign: 'center' as const,
  },
  comparisonArrow: {
    fontSize: '24px',
    color: '#666',
    flexShrink: 0,
  },
  comparisonLabel: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '6px',
    fontWeight: '500' as const,
  },
  comparisonValue: {
    fontSize: '28px',
    fontWeight: 'bold' as const,
    color: '#333',
    fontFamily: 'monospace',
    marginBottom: '8px',
  },
  comparisonSub: { fontSize: '12px', color: '#888' },
  biasCorrectionNote: {
    fontSize: '13px',
    color: '#555',
    lineHeight: '1.6',
    margin: 0,
    padding: '10px 14px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
  },

  // Sensitivity / leave-one-out
  louTable: {
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    overflow: 'hidden' as const,
  },
  louHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr',
    backgroundColor: '#f8f9fa',
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: '600' as const,
    color: '#666',
    gap: '8px',
    borderBottom: '1px solid #e9ecef',
  },
  louRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr',
    padding: '10px 16px',
    fontSize: '13px',
    color: '#333',
    gap: '8px',
    borderBottom: '1px solid #f0f0f0',
  },

  // Warnings
  warningCard: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
  },
  warningTitle: {
    fontSize: '18px',
    fontWeight: 'bold' as const,
    color: '#856404',
    margin: '0 0 12px 0',
  },
  warningList: {
    margin: 0,
    paddingLeft: '20px',
    color: '#856404',
    lineHeight: '1.6',
    fontSize: '14px',
  },

  // AI sidebar
  aiSection: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
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
  aiLoading: { textAlign: 'center' as const, padding: '40px' },
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
  aiErrorNote: { fontSize: '14px', marginTop: '8px', opacity: 0.9 },
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
  aiPrompt: { textAlign: 'center' as const, padding: '40px' },
  aiPromptIcon: { fontSize: '36px', marginBottom: '12px' },
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
    borderLeft: '4px solid #ffc107',
  },
  aiCardSuccess: {
    backgroundColor: '#d4edda',
    border: '1px solid #28a745',
    borderLeft: '4px solid #28a745',
  },
  aiCardNextSteps: {
    backgroundColor: '#e8f5e9',
    border: '1px solid #4caf50',
    borderLeft: '4px solid #4caf50',
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
  aiText: { fontSize: '16px', lineHeight: '1.6', color: '#333', margin: 0 },
  aiList: { margin: '10px 0', paddingLeft: '20px' },
  aiListItem: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#333',
    marginBottom: '6px',
  },
  stepNumber: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
