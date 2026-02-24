import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import { useAuth } from '../contexts/AuthContext';
import SearchableDropdown from './SearchableDropdown';
import HelpTooltip from './HelpTooltip';
import { aiService } from '../services/aiService';
import { projectStateService } from '../services/projectStateService';

const MAX_MESSAGE_LENGTH = 2000;

const COLLAPSE_THRESHOLD = 200;

interface Variable {
  name: string;
  type: string;
  unique_count?: number;
}

// ── Multi-select chip picker ─────────────────────────────────────────────────
const ChipSelector: React.FC<{
  variables: Variable[];
  selected: string[];
  onChange: (selected: string[]) => void;
  excludeVars?: string[];
  placeholder?: string;
}> = ({ variables, selected, onChange, excludeVars = [], placeholder }) => {
  const [search, setSearch] = useState('');

  const available = variables
    .filter((v) => !excludeVars.includes(v.name))
    .filter((v) =>
      search ? v.name.toLowerCase().includes(search.toLowerCase()) : true
    );

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((s) => s !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <div>
      {/* Selected tags */}
      {selected.length > 0 && (
        <div style={chipStyles.tagsRow}>
          {selected.map((name) => (
            <div key={name} style={chipStyles.tag}>
              <span>{name}</span>
              <button
                onClick={() => toggle(name)}
                style={chipStyles.tagRemove}
                title={`Remove ${name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        placeholder={placeholder || 'Search variables…'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={chipStyles.searchInput}
      />

      {/* Variable chips */}
      <div style={chipStyles.chipsGrid}>
        {available.map((v) => {
          const isSelected = selected.includes(v.name);
          return (
            <button
              key={v.name}
              onClick={() => toggle(v.name)}
              style={{
                ...chipStyles.chip,
                ...(isSelected ? chipStyles.chipSelected : {}),
              }}
            >
              {isSelected && <span style={chipStyles.checkmark}>✓ </span>}
              {v.name}
            </button>
          );
        })}
        {available.length === 0 && search && (
          <span style={chipStyles.noMatch}>No variables match "{search}"</span>
        )}
      </div>
    </div>
  );
};

const chipStyles = {
  tagsRow: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginBottom: '12px',
  },
  tag: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
    backgroundColor: '#043873',
    color: 'white',
    borderRadius: '20px',
    padding: '4px 12px',
    fontSize: '13px',
    fontWeight: '500' as const,
  },
  tagRemove: {
    background: 'none' as const,
    border: 'none' as const,
    color: 'white',
    cursor: 'pointer' as const,
    fontSize: '16px',
    lineHeight: '1' as const,
    padding: '0 2px',
    opacity: 0.8,
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1.5px solid #e0e0e0',
    borderRadius: '8px',
    marginBottom: '12px',
    boxSizing: 'border-box' as const,
  },
  chipsGrid: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '8px',
    maxHeight: '180px',
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  chip: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: '1.5px solid #d0d7de',
    backgroundColor: 'white',
    color: '#333',
    fontSize: '13px',
    cursor: 'pointer' as const,
    transition: 'all 0.15s',
    fontWeight: '400' as const,
  },
  chipSelected: {
    backgroundColor: '#e8f4ff',
    borderColor: '#043873',
    color: '#043873',
    fontWeight: '600' as const,
  },
  checkmark: {
    color: '#043873',
    fontWeight: 'bold' as const,
  },
  noMatch: {
    fontSize: '13px',
    color: '#888',
    fontStyle: 'italic' as const,
    padding: '4px',
  },
};

// ── IVSetup ──────────────────────────────────────────────────────────────────
const IVSetup: React.FC = () => {
  const navigate = useNavigate();
  const { currentStep, steps, goToPreviousStep, navigateToStep } = useProgressStep();
  const { accessToken } = useAuth();
  const location = useLocation();

  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [projectId, setProjectId] = useState<number | null>(
    (location.state as any)?.projectId || null
  );
  const [datasetId, setDatasetId] = useState<number | null>(
    (location.state as any)?.datasetId || null
  );

  // IV parameters
  const [outcomeVar, setOutcomeVar] = useState('');
  const [treatmentVar, setTreatmentVar] = useState('');
  const [instruments, setInstruments] = useState<string[]>([]);
  const [controls, setControls] = useState<string[]>([]);
  const [runSensitivity, setRunSensitivity] = useState(false);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // AI panel resize
  const [aiSidebarWidth, setAiSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  // AI chat state
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string; timestamp?: string }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [schemaInfo, setSchemaInfo] = useState<any>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Dataset preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    columns: Array<{ name: string; type: string }>;
    rows: Record<string, any>[];
    summary: { total_rows: number; total_columns: number };
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSearch, setPreviewSearch] = useState('');

  const recommendedQuestions = [
    'How do I know if my instrument is valid?',
    'What makes a good instrument for IV analysis?',
    'What control variables should I include in my IV setup?',
  ];

  // ── Load dataset variables ────────────────────────────────────────────────
  useEffect(() => {
    const loadDatasetVariables = async () => {
      try {
        setLoading(true);
        setError(null);

        let currentProjectId = projectId;
        if (!currentProjectId) {
          const urlParams = new URLSearchParams(location.search);
          currentProjectId =
            parseInt(urlParams.get('projectId') || '0') || null;
          if (currentProjectId) setProjectId(currentProjectId);
        }

        if (!currentProjectId) {
          setError('No project selected. Please go back and select a project.');
          setLoading(false);
          return;
        }

        // Load saved project state
        try {
          const project = await projectStateService.loadProject(
            currentProjectId,
            accessToken!
          );
          if (project.analysisConfig) {
            const cfg = project.analysisConfig;
            if (cfg.outcomeVar) setOutcomeVar(cfg.outcomeVar);
            if (cfg.treatmentVar) setTreatmentVar(cfg.treatmentVar);
            if (cfg.instruments) setInstruments(cfg.instruments);
            if (cfg.controls) setControls(cfg.controls);
            if (cfg.runSensitivity != null)
              setRunSensitivity(cfg.runSensitivity);
          }
          if (!datasetId && project.datasets && project.datasets.length > 0) {
            setDatasetId(project.datasets[0].id);
          }
        } catch (err) {
          console.warn('Failed to load saved IV state:', err);
        }

        // Load datasets
        const datasetsResponse = await axios.get(
          `/projects/${currentProjectId}/datasets`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const datasets = datasetsResponse.data.datasets;
        if (datasets.length === 0) {
          setError('No datasets found. Please upload a dataset first.');
          setLoading(false);
          return;
        }

        const dataset = datasetId
          ? datasets.find((d: any) => d.id === datasetId) || datasets[0]
          : datasets[0];
        setSelectedDataset(dataset);

        // Load schema
        const schemaResponse = await axios.get(`/datasets/${dataset.id}/schema`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const schemaData = schemaResponse.data;
        const mappedVars = schemaData.columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          unique_count: col.unique_count,
        }));
        setVariables(mappedVars);
        setSchemaInfo(schemaData);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load dataset variables');
      } finally {
        setLoading(false);
      }
    };

    if (accessToken) loadDatasetVariables();
  }, [accessToken, location, projectId, datasetId]);

  // ── Resize handlers ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const container = document.querySelector('[data-iv-setup-layout]') as HTMLElement;
      if (!container) return;
      const newWidth = container.getBoundingClientRect().right - e.clientX;
      setAiSidebarWidth(
        Math.max(COLLAPSE_THRESHOLD, Math.min(700, newWidth))
      );
    };
    const handleMouseUp = () => setIsResizing(false);
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
  }, [isResizing]);

  // Auto-scroll chat
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Fetch dataset preview when panel is opened (lazy load)
  useEffect(() => {
    if (!previewOpen || !selectedDataset || previewData || previewLoading) return;
    const fetchPreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const response = await axios.get(`/datasets/${selectedDataset.id}/preview?limit=150`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setPreviewData(response.data);
      } catch (err: any) {
        setPreviewError(err.response?.data?.error || 'Failed to load data preview');
      } finally {
        setPreviewLoading(false);
      }
    };
    fetchPreview();
  }, [previewOpen, selectedDataset, accessToken, previewData, previewLoading]);

  // Chat handler
  const handleSendMessage = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    if (message.length > MAX_MESSAGE_LENGTH) {
      setChatError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }
    setChatError(null);
    setChatLoading(true);
    setChatMessages((prev) => [
      ...prev,
      { role: 'user' as const, content: message, timestamp: new Date().toISOString() },
    ]);
    setChatInput('');
    try {
      const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
      const analysisContext = {
        method: 'Instrumental Variables (2SLS)',
        parameters: {
          outcome: outcomeVar || null,
          treatment: treatmentVar || null,
          instruments: instruments.length > 0 ? instruments : null,
          controls: controls.length > 0 ? controls : null,
        },
        iv_guidelines: `INSTRUCTIONS for helping with Instrumental Variables (2SLS) analysis:

VARIABLE USAGE:
- OUTCOME variable: ${outcomeVar ? `"${outcomeVar}"` : 'NOT YET SELECTED'}
- TREATMENT (endogenous) variable: ${treatmentVar ? `"${treatmentVar}"` : 'NOT YET SELECTED'}
- INSTRUMENTS: ${instruments.length > 0 ? instruments.map(i => `"${i}"`).join(', ') : 'NONE SELECTED YET'}
- CONTROLS: ${controls.length > 0 ? controls.map(c => `"${c}"`).join(', ') : 'none'}

INSTRUMENT VALIDITY:
- A valid instrument must be: (1) Relevant — strongly predicts the treatment (F > 10, ideally > 16); (2) Exogenous — uncorrelated with unobserved confounders; (3) Exclusion restriction — affects outcome ONLY through treatment.
- If the user asks about instrument selection, discuss these three criteria with respect to their specific context.
- Never assume what a variable name means; ask the user if clarification is needed.

CONTROL VARIABLES:
- Controls appear in BOTH stages. They should be exogenous (not affected by the treatment).
- Do NOT include the instruments or the treatment variable as controls.
- Warn against including "bad controls" that are affected by treatment.

SENSITIVITY ANALYSIS:
- Just-identified IV (1 instrument): Anderson-Rubin CI is weak-instrument-robust.
- Over-identified IV (>1 instrument): Leave-one-out checks if results depend on a single instrument.`,
      };
      const datasetInfo = schemaInfo
        ? {
            name: selectedDataset?.name || 'Dataset',
            columns: schemaInfo.columns,
            summary: schemaInfo.summary,
          }
        : undefined;
      const response = await aiService.chat(message, history, analysisContext, datasetInfo);
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant' as const, content: response.response, timestamp: response.timestamp },
      ]);
    } catch (err: any) {
      setChatError(err.response?.data?.error || err.message || 'Failed to send message');
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

  const canProceed =
    Boolean(outcomeVar) &&
    Boolean(treatmentVar) &&
    instruments.length >= 1 &&
    !instruments.includes(outcomeVar) &&
    !instruments.includes(treatmentVar);

  // ── Run analysis ──────────────────────────────────────────────────────────
  const handleRunAnalysis = async () => {
    if (!canProceed || !selectedDataset) return;

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const payload: any = {
        outcome: outcomeVar,
        treatment: treatmentVar,
        instruments,
        run_sensitivity: runSensitivity,
      };
      if (controls.length > 0) payload.controls = controls;

      const response = await axios.post(
        `/datasets/${selectedDataset.id}/analyze/iv`,
        payload,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      // Save to localStorage
      const storageKey = projectId
        ? `ivAnalysisResults_${projectId}`
        : 'ivAnalysisResults';
      localStorage.setItem(storageKey, JSON.stringify(response.data));

      // Save project state
      if (projectId && accessToken) {
        try {
          await projectStateService.saveState(
            projectId,
            {
              currentStep: 'results',
              selectedMethod: 'iv',
              analysisConfig: {
                outcomeVar,
                treatmentVar,
                instruments,
                controls,
                runSensitivity,
              },
              lastResults: response.data,
            },
            accessToken
          );
        } catch (saveError) {
          console.warn('Failed to save project state:', saveError);
        }
      }

      // Navigate to results
      const params = new URLSearchParams();
      if (projectId != null) params.set('projectId', String(projectId));
      params.set('datasetId', String(selectedDataset.id));
      navigate(`/iv-results?${params.toString()}`, {
        state: { projectId, datasetId: selectedDataset.id },
      });
    } catch (err: any) {
      setAnalysisError(
        err.response?.data?.error || 'Failed to run IV analysis'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <Navbar />
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}></div>
          <p style={styles.loadingText}>Loading your dataset...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Navbar />
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠️</div>
          <h2 style={styles.errorTitle}>Error Loading Dataset</h2>
          <p style={styles.errorMessage}>{error}</p>
          <button onClick={() => window.history.back()} style={styles.backButton}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const numericVars = variables.filter((v) => v.type === 'numeric');
  const allVars = variables;

  // Vars already claimed by outcome / treatment / instruments
  const claimedByInstruments = new Set(instruments);
  const claimedForControls = new Set([
    outcomeVar,
    treatmentVar,
    ...instruments,
  ]);

  return (
    <div>
      <Navbar />
      <div style={styles.contentContainer}>
        <div style={styles.header}>
          <h1 style={styles.title}>Instrumental Variables Setup</h1>
          <p style={styles.subtitle}>
            Configure your 2SLS analysis: select your outcome, endogenous
            treatment, and instruments
          </p>
        </div>

        <div style={styles.mainContent} data-iv-setup-layout>
          <div style={styles.contentWrapper}>

            {/* ── Data Preview Panel (far-left, collapsible) ── */}
            {!previewOpen ? (
              /* Collapsed tab */
              <div
                style={styles.previewCollapsedTab}
                onClick={() => setPreviewOpen(true)}
                title="Open dataset preview"
              >
                <span style={styles.previewTabEmoji}>📊</span>
                <span style={styles.previewTabText}>Data Preview</span>
              </div>
            ) : (
              /* Open panel */
              <div style={styles.previewPanel}>
                {/* Header */}
                <div style={styles.previewPanelHeader}>
                  <span style={styles.previewPanelTitle}>📊 Data Preview</span>
                  <button
                    style={styles.previewCloseBtn}
                    onClick={() => setPreviewOpen(false)}
                    title="Close preview"
                  >
                    ✕
                  </button>
                </div>

                {/* Dataset info row */}
                {selectedDataset && (
                  <div style={styles.previewDatasetInfo}>
                    <strong style={{ color: '#043873' }}>{selectedDataset.name}</strong>
                    {previewData && (
                      <span style={{ color: '#666' }}>
                        {' '}· {previewData.summary.total_rows.toLocaleString()} rows ·{' '}
                        {previewData.summary.total_columns} cols
                      </span>
                    )}
                  </div>
                )}

                {/* Color legend */}
                <div style={styles.previewLegend}>
                  {[
                    { label: 'Y  Outcome',    bg: '#d1fae5', border: '#059669' },
                    { label: 'T  Treatment',  bg: '#dbeafe', border: '#2563eb' },
                    { label: 'Z  Instrument', bg: '#ede9fe', border: '#7c3aed' },
                    { label: 'C  Control',    bg: '#fef9c3', border: '#ca8a04' },
                  ].map(({ label, bg, border }) => (
                    <span key={label} style={styles.legendItem}>
                      <span style={{ ...styles.legendDot, backgroundColor: bg, borderColor: border }} />
                      {label}
                    </span>
                  ))}
                </div>

                {/* Column filter */}
                <div style={styles.previewSearchWrapper}>
                  <input
                    type="text"
                    placeholder="🔍  Filter columns…"
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    style={styles.previewSearchInput}
                  />
                </div>

                {/* Table area */}
                <div style={styles.previewTableWrapper}>
                  {previewLoading ? (
                    <div style={styles.previewLoadingState}>
                      <div style={styles.previewSpinner} />
                      <span>Loading preview…</span>
                    </div>
                  ) : previewError ? (
                    <div style={styles.previewErrorState}>⚠️ {previewError}</div>
                  ) : previewData ? (() => {
                    const colNames = previewData.columns.map((c) => c.name);
                    const filteredCols = colNames.filter((c) =>
                      !previewSearch || c.toLowerCase().includes(previewSearch.toLowerCase())
                    );
                    const roleOf = (col: string) =>
                      col === outcomeVar ? 'outcome'
                        : col === treatmentVar ? 'treatment'
                        : instruments.includes(col) ? 'instrument'
                        : controls.includes(col) ? 'control'
                        : 'none';
                    const headerBg: Record<string, string> = {
                      outcome: '#d1fae5', treatment: '#dbeafe',
                      instrument: '#ede9fe', control: '#fef9c3', none: '#f1f5f9',
                    };
                    const headerBorder: Record<string, string> = {
                      outcome: '#059669', treatment: '#2563eb',
                      instrument: '#7c3aed', control: '#ca8a04', none: 'transparent',
                    };
                    const cellBg: Record<string, string> = {
                      outcome: '#f0fdf4', treatment: '#eff6ff',
                      instrument: '#f5f3ff', control: '#fefce8', none: 'transparent',
                    };
                    const roleLabel: Record<string, string> = {
                      outcome: 'Y', treatment: 'T', instrument: 'Z', control: 'C', none: '',
                    };
                    return (
                      <table style={styles.previewTable}>
                        <thead>
                          <tr>
                            <th style={styles.previewRowNumTh}>#</th>
                            {filteredCols.map((col) => {
                              const role = roleOf(col);
                              return (
                                <th
                                  key={col}
                                  style={{
                                    ...styles.previewTh,
                                    backgroundColor: headerBg[role],
                                    borderBottom: `3px solid ${headerBorder[role]}`,
                                  }}
                                  title={col}
                                >
                                  {col.length > 14 ? col.slice(0, 13) + '…' : col}
                                  {role !== 'none' && (
                                    <span style={styles.previewRoleTag}>{roleLabel[role]}</span>
                                  )}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.rows.map((row, rowIdx) => (
                            <tr
                              key={rowIdx}
                              style={rowIdx % 2 === 1 ? { backgroundColor: '#f9fafb' } : {}}
                            >
                              <td style={styles.previewRowNumTd}>{rowIdx + 1}</td>
                              {filteredCols.map((col) => {
                                const role = roleOf(col);
                                const raw = row[col];
                                const display =
                                  raw === null || raw === undefined || raw === ''
                                    ? null
                                    : String(raw).length > 13
                                    ? String(raw).slice(0, 12) + '…'
                                    : String(raw);
                                return (
                                  <td
                                    key={col}
                                    style={{
                                      ...styles.previewTd,
                                      backgroundColor: cellBg[role],
                                    }}
                                    title={raw !== null && raw !== undefined ? String(raw) : ''}
                                  >
                                    {display ?? <span style={{ color: '#ccc' }}>—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })() : (
                    <div style={styles.previewEmptyState}>No preview data available.</div>
                  )}
                </div>
              </div>
            )}

            {/* ── Left: variable cards ── */}
            <div style={styles.leftContent}>
              <div style={styles.cardsContainer}>

                {/* Card 1: Outcome */}
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardNumber}>1</div>
                    <HelpTooltip concept="outcome variable in causal inference">
                      <div style={styles.cardTitle}>Outcome Variable</div>
                    </HelpTooltip>
                    <div style={styles.requiredBadge}>Required</div>
                  </div>
                  <p style={styles.helperText}>
                    The result you want to measure — what changes because of the treatment (e.g., wages,
                    test scores, health outcomes).
                  </p>
                  <SearchableDropdown
                    options={numericVars.map((v) => ({
                      value: v.name,
                      label: v.name,
                    }))}
                    value={outcomeVar}
                    onChange={setOutcomeVar}
                    placeholder="Search and select outcome variable…"
                    style={styles.select}
                  />
                </div>

                {/* Card 2: Treatment (Endogenous) */}
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardNumber}>2</div>
                    <HelpTooltip concept="endogenous treatment in iv">
                      <div style={styles.cardTitle}>
                        Endogenous Treatment Variable
                      </div>
                    </HelpTooltip>
                    <div style={styles.requiredBadge}>Required</div>
                  </div>
                  <p style={styles.helperText}>
                    The variable whose causal effect you want to estimate, but which is
                    likely <em>correlated with unobserved factors</em> — making plain
                    regression unreliable (e.g., education, program participation, price).
                  </p>
                  <SearchableDropdown
                    options={numericVars
                      .filter((v) => v.name !== outcomeVar)
                      .map((v) => ({ value: v.name, label: v.name }))}
                    value={treatmentVar}
                    onChange={(val) => {
                      setTreatmentVar(val);
                      // Remove from instruments if selected there
                      if (instruments.includes(val)) {
                        setInstruments(instruments.filter((i) => i !== val));
                      }
                    }}
                    placeholder="Search and select treatment variable…"
                    style={styles.select}
                  />
                </div>

                {/* Card 3: Instruments */}
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardNumber}>3</div>
                    <HelpTooltip concept="instrumental variable">
                      <div style={styles.cardTitle}>Instrument(s)</div>
                    </HelpTooltip>
                    <div style={styles.requiredBadge}>Required (≥ 1)</div>
                  </div>
                  <p style={styles.helperText}>
                    A variable that <strong>strongly predicts the treatment</strong> but has
                    {' '}<strong>no direct effect on the outcome</strong> other than through
                    the treatment (e.g., lottery assignment, geographic distance, draft number).
                  </p>
                  <div style={styles.threeRulesBox}>
                    <div style={styles.ruleItem}>
                      <span style={styles.ruleIcon}>🎯</span>
                      <span><strong>Relevant:</strong> strongly predicts the treatment (F &gt; 10)</span>
                    </div>
                    <div style={styles.ruleItem}>
                      <span style={styles.ruleIcon}>🔒</span>
                      <span><strong>Exclusion:</strong> no direct effect on the outcome</span>
                    </div>
                    <div style={styles.ruleItem}>
                      <span style={styles.ruleIcon}>🎲</span>
                      <span><strong>Exogenous:</strong> uncorrelated with unobserved confounders</span>
                    </div>
                  </div>
                  <ChipSelector
                    variables={allVars.filter(
                      (v) => v.name !== outcomeVar && v.name !== treatmentVar
                    )}
                    selected={instruments}
                    onChange={(sel) => {
                      setInstruments(sel);
                      // Remove from controls if added to instruments
                      setControls(controls.filter((c) => !sel.includes(c)));
                    }}
                    excludeVars={[outcomeVar, treatmentVar]}
                    placeholder="Search instrument variables…"
                  />
                  {instruments.length === 0 && (
                    <p style={styles.validationHint}>
                      ⚠️ Select at least one instrument to proceed.
                    </p>
                  )}
                  {instruments.length > 0 && (
                    <p style={styles.selectionCount}>
                      {instruments.length} instrument
                      {instruments.length > 1 ? 's' : ''} selected
                      {instruments.length > 1
                        ? ' — Sargan-Hansen over-identification test will be run'
                        : ' — Just-identified (Anderson-Rubin CI available)'}
                    </p>
                  )}
                </div>

                {/* Card 4: Options (controls + sensitivity) */}
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardNumber}>4</div>
                    <div style={styles.cardTitle}>Controls & Options</div>
                    <div style={styles.optionalBadge}>Optional</div>
                  </div>

                  <div style={styles.formGroup}>
                    <HelpTooltip concept="control variables">
                      <label style={styles.label}>Control Variables</label>
                    </HelpTooltip>
                    <p style={styles.helperTextSmall}>
                      Exogenous covariates included in both stages to improve precision.
                      Must not be instruments, treatment, or outcome — and must not be
                      affected by the treatment itself.
                    </p>
                    <ChipSelector
                      variables={allVars.filter(
                        (v) => !claimedForControls.has(v.name)
                      )}
                      selected={controls}
                      onChange={setControls}
                      excludeVars={Array.from(claimedForControls)}
                      placeholder="Search control variables…"
                    />
                  </div>

                  <div style={{ ...styles.formGroup, marginTop: '20px' }}>
                    <label style={styles.toggleRow}>
                      <input
                        type="checkbox"
                        checked={runSensitivity}
                        onChange={(e) => setRunSensitivity(e.target.checked)}
                        style={styles.checkbox}
                      />
                      <div>
                        <HelpTooltip concept="sensitivity analysis in iv">
                          <span style={styles.label}>Run Sensitivity Analysis</span>
                        </HelpTooltip>
                        <p style={styles.helperTextSmall}>
                          {instruments.length === 1
                            ? 'Computes weak-instrument-robust Anderson-Rubin confidence intervals.'
                            : 'Runs leave-one-out instrument sensitivity for over-identified IV.'}
                          {' '}May add a few seconds to analysis time.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Analysis error */}
              {analysisError && (
                <div style={styles.errorBox}>
                  <strong>⚠️ Analysis Error:</strong> {analysisError}
                </div>
              )}

              {/* Run button */}
              <div style={styles.actionContainer}>
                <button
                  style={{
                    ...styles.runButton,
                    ...(!canProceed || analyzing ? styles.runButtonDisabled : {}),
                  }}
                  onClick={handleRunAnalysis}
                  disabled={!canProceed || analyzing}
                >
                  {analyzing ? 'Running Analysis…' : 'Run IV Analysis'}
                </button>
              </div>
            </div>

            {/* ── Right: IV tips sidebar ── */}
            <div
              style={{
                ...styles.aiSidebar,
                width: `${aiSidebarWidth}px`,
                flex: `0 0 ${aiSidebarWidth}px`,
                position: 'sticky' as const,
                top: '90px',
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
                }}
              />

              <div style={styles.tipPanel}>
                {/* ── IV Assumptions Guide ── */}
                <h3 style={styles.tipTitle}>🎻 IV Assumptions Guide</h3>

                <div style={styles.tipCard}>
                  <div style={styles.tipCardTitle}>1️⃣ Relevance</div>
                  <p style={styles.tipCardText}>
                    The instrument must <strong>strongly predict</strong> the treatment.
                    Checked by the first-stage F-statistic — F &gt; 10 is the rule of thumb;
                    Stock-Yogo recommends F &gt; 16 for minimal size distortion.
                  </p>
                </div>

                <div style={styles.tipCard}>
                  <div style={styles.tipCardTitle}>
                    2️⃣{' '}
                    <HelpTooltip concept="exclusion restriction">
                      <span>Exclusion Restriction</span>
                    </HelpTooltip>
                  </div>
                  <p style={styles.tipCardText}>
                    The instrument must affect the outcome{' '}
                    <strong>only through the treatment</strong> — no direct path.
                    Cannot be statistically tested; requires domain justification.
                  </p>
                </div>

                <div style={styles.tipCard}>
                  <div style={styles.tipCardTitle}>3️⃣ Independence (Exogeneity)</div>
                  <p style={styles.tipCardText}>
                    The instrument must be <strong>uncorrelated with unobserved
                    confounders</strong>. Ideal instruments are "as-good-as-randomly
                    assigned" (lottery numbers, weather, geographic distance, etc.).
                  </p>
                </div>

                <div style={styles.tipCard}>
                  <div style={styles.tipCardTitle}>
                    📐{' '}
                    <HelpTooltip concept="two-stage least squares">
                      <span>What 2SLS estimates</span>
                    </HelpTooltip>
                  </div>
                  <p style={styles.tipCardText}>
                    With a binary instrument, 2SLS gives you the{' '}
                    <HelpTooltip concept="local average treatment effect">
                      <strong>LATE</strong>
                    </HelpTooltip>
                    {' '}— the effect for "compliers" who change treatment status because
                    of the instrument, not the entire population.
                  </p>
                </div>

                <div style={styles.tipCard}>
                  <div style={styles.tipCardTitle}>💡 Classic Examples</div>
                  <ul style={styles.tipList}>
                    <li><strong>Education → Wages:</strong> Instrument = quarter of birth (Angrist &amp; Krueger 1991)</li>
                    <li><strong>Military service → Earnings:</strong> Instrument = Vietnam draft lottery number</li>
                    <li><strong>Hospital quality → Health:</strong> Instrument = distance to nearest hospital</li>
                  </ul>
                </div>

                {/* ── AI Chat Section ── */}
                <div style={styles.chatSection}>
                  <h3 style={styles.chatTitle}>💬 Ask AI</h3>
                  <p style={styles.chatTip}>
                    💡 <strong>Tip:</strong> Tell the AI about your causal question and
                    data context — it will give specific guidance on instrument validity,
                    variable selection, and 2SLS design.
                  </p>

                  {/* Messages */}
                  <div style={styles.chatMessages}>
                    {chatMessages.length === 0 ? (
                      <div style={styles.chatEmpty}>
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
                          <div
                            style={{
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
                            }}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))
                    )}
                    {chatLoading && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div style={styles.thinkingBubble}>
                          <div style={styles.thinkingSpinner} />
                          <span>AI is thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatMessagesEndRef} />
                  </div>

                  {/* Error */}
                  {chatError && (
                    <div style={styles.chatErrorBox}>⚠️ {chatError}</div>
                  )}

                  {/* Input row */}
                  <div style={styles.chatInputRow}>
                    <textarea
                      value={chatInput}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                          setChatInput(e.target.value);
                          setChatError(null);
                        }
                      }}
                      onKeyPress={handleChatKeyPress}
                      placeholder="Ask about instrument validity, variable selection, or 2SLS design…"
                      disabled={chatLoading}
                      style={styles.chatTextarea}
                      onFocus={(e) => { e.target.style.borderColor = '#4F9CF9'; }}
                      onBlur={(e) => { e.target.style.borderColor = '#dee2e6'; }}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || chatLoading || chatInput.length > MAX_MESSAGE_LENGTH}
                      style={{
                        ...styles.chatSendBtn,
                        backgroundColor:
                          chatInput.trim() && !chatLoading && chatInput.length <= MAX_MESSAGE_LENGTH
                            ? '#4F9CF9' : '#ccc',
                        cursor:
                          chatInput.trim() && !chatLoading && chatInput.length <= MAX_MESSAGE_LENGTH
                            ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {chatLoading ? '...' : 'Send'}
                    </button>
                  </div>
                  <div style={styles.charCount}>
                    {chatInput.length}/{MAX_MESSAGE_LENGTH} characters
                  </div>

                  {/* Suggested questions */}
                  <div style={styles.suggestedSection}>
                    <div style={styles.suggestedLabel}>💡 Suggested questions:</div>
                    <div style={styles.suggestedBtns}>
                      {recommendedQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => { setChatInput(q); setChatError(null); }}
                          disabled={chatLoading}
                          style={{
                            ...styles.suggestedBtn,
                            opacity: chatLoading ? 0.6 : 1,
                            cursor: chatLoading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <BottomProgressBar
        currentStep={currentStep}
        steps={steps}
        onPrev={goToPreviousStep}
        onNext={handleRunAnalysis}
        canGoNext={canProceed && !analyzing}
        onStepClick={(path) => navigateToStep(path)}
      />
    </div>
  );
};

export default IVSetup;

const styles = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '80px',
    minHeight: 'calc(100vh - 70px)',
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
    padding: '40px 20px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0',
  },
  subtitle: { fontSize: '18px', color: '#666', margin: 0 },
  mainContent: { maxWidth: '1400px', margin: '0 auto', padding: '0 20px' },
  contentWrapper: {
    display: 'flex',
    gap: '20px',
    alignItems: 'flex-start',
    position: 'relative' as const,
  },
  leftContent: { flex: '1', minWidth: 0 },
  aiSidebar: {
    flexShrink: 0,
    position: 'relative' as const,
  },
  cardsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '25px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    border: '1px solid #e0e0e0',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    marginBottom: '15px',
  },
  cardNumber: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    backgroundColor: '#043873',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  requiredBadge: {
    backgroundColor: '#dc3545',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500' as const,
  },
  optionalBadge: {
    backgroundColor: '#6c757d',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500' as const,
  },
  helperText: {
    fontSize: '14px',
    color: '#334155',
    margin: '0 0 15px 0',
    lineHeight: '1.5',
  },
  helperTextSmall: {
    fontSize: '13px',
    color: '#666',
    margin: '4px 0 10px 0',
    lineHeight: '1.4',
  },
  select: {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  validationHint: {
    fontSize: '13px',
    color: '#c05621',
    margin: '10px 0 0 0',
    padding: '8px 12px',
    backgroundColor: '#fffaf0',
    borderRadius: '6px',
    border: '1px solid #fbd38d',
  },
  selectionCount: {
    fontSize: '13px',
    color: '#155724',
    margin: '10px 0 0 0',
    padding: '8px 12px',
    backgroundColor: '#d4edda',
    borderRadius: '6px',
    border: '1px solid #c3e6cb',
  },
  formGroup: { marginBottom: '10px' },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600' as const,
    color: '#333',
    marginBottom: '6px',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    marginTop: '2px',
    cursor: 'pointer',
    accentColor: '#043873',
    flexShrink: 0,
  },
  errorBox: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#fee',
    border: '1px solid #fcc',
    borderRadius: '8px',
    color: '#c33',
    fontSize: '14px',
  },
  actionContainer: {
    marginTop: '30px',
    display: 'flex',
    justifyContent: 'center',
  },
  runButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '14px 40px',
    fontSize: '18px',
    fontWeight: '600' as const,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  runButtonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  // Three-rules inline box (instrument requirements)
  threeRulesBox: {
    backgroundColor: '#f0f7ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    padding: '12px 14px',
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  ruleItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '13px',
    color: '#1e40af',
    lineHeight: '1.4',
  },
  ruleIcon: { flexShrink: 0, fontSize: '14px' },

  // Tips sidebar
  tipPanel: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    border: '1px solid #e0e0e0',
    maxHeight: 'calc(100vh - 200px)',
    overflowY: 'auto' as const,
  },
  tipTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 20px 0',
  },
  tipCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '14px 16px',
    marginBottom: '14px',
    border: '1px solid #e9ecef',
    borderLeft: '4px solid #043873',
  },
  tipCardTitle: {
    fontSize: '14px',
    fontWeight: '700' as const,
    color: '#043873',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  tipCardText: {
    fontSize: '13px',
    color: '#444',
    lineHeight: '1.6',
    margin: 0,
  },
  tipList: {
    margin: '0',
    paddingLeft: '18px',
    fontSize: '13px',
    color: '#444',
    lineHeight: '1.8',
  },

  // AI chat section styles
  chatSection: {
    marginTop: '28px',
    borderTop: '2px solid #e9ecef',
    paddingTop: '22px',
  },
  chatTitle: {
    fontSize: '18px',
    fontWeight: 'bold' as const,
    color: '#043873',
    margin: '0 0 8px 0',
  },
  chatTip: {
    fontSize: '13px',
    color: '#475569',
    marginBottom: '14px',
    lineHeight: '1.6',
    backgroundColor: '#f0f9ff',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #bfdbfe',
  },
  chatMessages: {
    maxHeight: '380px',
    overflowY: 'auto' as const,
    marginBottom: '14px',
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
    minHeight: '180px',
  },
  chatEmpty: {
    textAlign: 'center' as const,
    color: '#999',
    padding: '40px 20px',
    fontSize: '14px',
  },
  thinkingBubble: {
    padding: '10px 14px',
    borderRadius: '12px',
    backgroundColor: '#ffffff',
    border: '1px solid #e9ecef',
    fontSize: '14px',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
  },
  thinkingSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #f3f3f3',
    borderTop: '2px solid #4F9CF9',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginRight: '8px',
    flexShrink: 0,
  },
  chatErrorBox: {
    padding: '10px',
    marginBottom: '12px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderRadius: '6px',
    fontSize: '13px',
    border: '1px solid #f5c6cb',
  },
  chatInputRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end',
  },
  chatTextarea: {
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
  },
  chatSendBtn: {
    padding: '10px 20px',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600' as const,
    height: '60px',
    minWidth: '70px',
    transition: 'background-color 0.2s',
  },
  charCount: {
    fontSize: '12px',
    color: '#999',
    marginTop: '6px',
    textAlign: 'right' as const,
  },
  suggestedSection: {
    marginTop: '16px',
    paddingTop: '14px',
    borderTop: '1px solid #e9ecef',
  },
  suggestedLabel: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '10px',
    fontWeight: '500' as const,
  },
  suggestedBtns: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  suggestedBtn: {
    padding: '10px 14px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#043873',
    textAlign: 'left' as const,
    lineHeight: '1.4',
  },

  // ── Data Preview Panel ─────────────────────────────────────────────────────
  previewCollapsedTab: {
    width: '38px',
    flexShrink: 0,
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    border: '1px solid #e0e0e0',
    borderLeft: '4px solid #043873',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '10px',
    padding: '18px 0',
    position: 'sticky' as const,
    top: '90px',
    alignSelf: 'flex-start',
    minHeight: '130px',
    transition: 'box-shadow 0.2s',
  },
  previewTabEmoji: {
    fontSize: '16px',
    lineHeight: '1',
  },
  previewTabText: {
    fontSize: '11px',
    color: '#043873',
    fontWeight: '700' as const,
    writingMode: 'vertical-rl' as const,
    textOrientation: 'mixed' as const,
    transform: 'rotate(180deg)',
    letterSpacing: '0.6px',
    userSelect: 'none' as const,
  },
  previewPanel: {
    width: '350px',
    flexShrink: 0,
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    border: '1px solid #e0e0e0',
    position: 'sticky' as const,
    top: '90px',
    alignSelf: 'flex-start',
    maxHeight: 'calc(100vh - 180px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  previewPanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #e9ecef',
    backgroundColor: '#f8f9fa',
    borderRadius: '12px 12px 0 0',
    flexShrink: 0,
  },
  previewPanelTitle: {
    fontSize: '14px',
    fontWeight: 'bold' as const,
    color: '#043873',
  },
  previewCloseBtn: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    color: '#666',
    padding: '0 2px',
    lineHeight: '1',
  },
  previewDatasetInfo: {
    padding: '8px 16px',
    fontSize: '12px',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  previewLegend: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
    padding: '8px 12px',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#444',
    fontWeight: '500' as const,
  },
  legendDot: {
    width: '10px',
    height: '10px',
    borderRadius: '2px',
    border: '1.5px solid',
    display: 'inline-block',
    flexShrink: 0,
  },
  previewSearchWrapper: {
    padding: '8px 12px',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  previewSearchInput: {
    width: '100%',
    padding: '6px 10px',
    fontSize: '13px',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  },
  previewTableWrapper: {
    flex: 1,
    overflowX: 'auto' as const,
    overflowY: 'auto' as const,
  },
  previewTable: {
    width: 'max-content',
    minWidth: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
  },
  previewTh: {
    padding: '8px 10px',
    textAlign: 'left' as const,
    fontWeight: '600' as const,
    color: '#333',
    whiteSpace: 'nowrap' as const,
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
    borderBottom: '1px solid #dee2e6',
    fontSize: '12px',
  },
  previewRowNumTh: {
    padding: '8px 8px',
    backgroundColor: '#f1f5f9',
    textAlign: 'center' as const,
    fontWeight: '600' as const,
    color: '#64748b',
    position: 'sticky' as const,
    top: 0,
    left: 0,
    zIndex: 2,
    borderBottom: '1px solid #dee2e6',
    borderRight: '1px solid #dee2e6',
    fontSize: '11px',
    minWidth: '32px',
  },
  previewTd: {
    padding: '5px 10px',
    borderBottom: '1px solid #f0f0f0',
    color: '#333',
    whiteSpace: 'nowrap' as const,
    fontSize: '12px',
  },
  previewRowNumTd: {
    padding: '5px 8px',
    borderBottom: '1px solid #f0f0f0',
    color: '#94a3b8',
    textAlign: 'center' as const,
    backgroundColor: '#f8fafc',
    position: 'sticky' as const,
    left: 0,
    borderRight: '1px solid #e9ecef',
    fontSize: '11px',
    fontWeight: '500' as const,
  },
  previewRoleTag: {
    marginLeft: '5px',
    fontSize: '10px',
    fontWeight: 'bold' as const,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: '3px',
    padding: '1px 4px',
    letterSpacing: '0.3px',
  },
  previewLoadingState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    color: '#666',
    fontSize: '14px',
    gap: '12px',
    minHeight: '120px',
  },
  previewSpinner: {
    width: '28px',
    height: '28px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  previewErrorState: {
    padding: '20px 16px',
    color: '#dc3545',
    fontSize: '13px',
  },
  previewEmptyState: {
    padding: '30px 16px',
    color: '#888',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
};
