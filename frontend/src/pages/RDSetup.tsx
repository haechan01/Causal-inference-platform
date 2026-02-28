import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Navbar, BottomProgressBar } from '../components/layout';
import { useProgressStep } from '../hooks/useProgressStep';
import { useAuth } from '../contexts/AuthContext';
import { SearchableDropdown } from '../components/inputs';
import { RDVariableSuggestions } from '../components/rd';
import { projectStateService } from '../services/projectStateService';

const COLLAPSE_THRESHOLD = 200;

interface Variable {
  name: string;
  type: string;
  unique_count?: number;
}

const RDSetup: React.FC = () => {
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

  // RD parameters
  const [runningVar, setRunningVar] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [outcomeVar, setOutcomeVar] = useState('');
  const [bandwidth, setBandwidth] = useState('');
  const [polynomialOrder, setPolynomialOrder] = useState(1);
  const [treatmentSide, setTreatmentSide] = useState<'above' | 'below'>('above');
  const [rdType, setRdType] = useState<'sharp' | 'fuzzy'>('sharp');
  const [treatmentVar, setTreatmentVar] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // AI panel state
  const [schemaInfo, setSchemaInfo] = useState<any>(null);
  const [aiSidebarWidth, setAiSidebarWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);

  // Hints from the AI assistant on the Method Selection page
  const aiHints: { treatmentVariable?: string; outcomeVariable?: string; causalQuestion?: string } =
    (location.state as any)?.aiHints || {};

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
          if (currentProjectId) {
            setProjectId(currentProjectId);
          }
        }

        if (!currentProjectId) {
          setError(
            'No project selected. Please go back and select a project.'
          );
          setLoading(false);
          return;
        }

        // Load saved project state (variable selection) - like DiD VariableSelectionPage
        try {
          const project = await projectStateService.loadProject(
            currentProjectId,
            accessToken!
          );
          if (project.analysisConfig) {
            const config = project.analysisConfig;
            if (config.runningVar || config.outcomeVar || config.cutoff) {
              setRunningVar(config.runningVar || '');
              setCutoff(String(config.cutoff ?? ''));
              setOutcomeVar(config.outcomeVar || '');
              setBandwidth(config.bandwidth || '');
              setPolynomialOrder(config.polynomialOrder ?? 1);
              setTreatmentSide(
                config.treatmentSide === 'below' ? 'below' : 'above'
              );
              setRdType(config.rdType === 'fuzzy' ? 'fuzzy' : 'sharp');
              setTreatmentVar(config.treatmentVar || '');
            }
          }
          if (!datasetId && project.datasets && project.datasets.length > 0) {
            setDatasetId(project.datasets[0].id);
          }
        } catch (err) {
          console.warn('Failed to load saved RD state:', err);
        }

        // Load datasets for the project
        const datasetsResponse = await axios.get(
          `/projects/${currentProjectId}/datasets`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        const datasets = datasetsResponse.data.datasets;

        if (datasets.length === 0) {
          setError(
            'No datasets found for this project. Please upload a dataset first.'
          );
          setLoading(false);
          return;
        }

        // Find selected dataset or use first one
        const dataset = datasetId
          ? datasets.find((d: any) => d.id === datasetId) || datasets[0]
          : datasets[0];

        setSelectedDataset(dataset);

        // Load dataset schema/variables
        const schemaResponse = await axios.get(
          `/datasets/${dataset.id}/schema`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        const schemaData = schemaResponse.data;
        setSchemaInfo(schemaData);

        // Transform schema data to our variable format
        const variablesFromSchema = schemaData.columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          unique_count: col.unique_count,
        }));

        setVariables(variablesFromSchema);

        // Pre-fill from AI hints if no saved state loaded yet
        if (aiHints.outcomeVariable && !outcomeVar) {
          const match = variablesFromSchema.find(
            (v: Variable) => v.name.toLowerCase() === aiHints.outcomeVariable!.toLowerCase()
          );
          if (match) setOutcomeVar(match.name);
        }
        // For RD, treatmentVariable from hints is a loose proxy for the running variable
        // only prefill if there's a clear numeric column match
        if (aiHints.treatmentVariable && !runningVar) {
          const match = variablesFromSchema.find(
            (v: Variable) =>
              v.name.toLowerCase() === aiHints.treatmentVariable!.toLowerCase() &&
              (v.type === 'numeric' || v.type === 'float' || v.type === 'integer')
          );
          if (match) setRunningVar(match.name);
        }
      } catch (error: any) {
        console.error('Error loading dataset variables:', error);
        setError(
          error.response?.data?.error || 'Failed to load dataset variables'
        );
      } finally {
        setLoading(false);
      }
    };

    if (accessToken) {
      loadDatasetVariables();
    }
    // aiHints are intentionally read once on mount; omitting from deps is correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, location, projectId, datasetId]);

  const canProceed = Boolean(
    runningVar &&
    cutoff &&
    outcomeVar &&
    !isNaN(parseFloat(cutoff)) &&
    (rdType === 'sharp' || treatmentVar)
  );

  const handleApplySuggestions = (suggestions: {
    runningVar?: string;
    outcomeVar?: string;
    cutoff?: string;
    treatmentSide?: 'above' | 'below';
  }) => {
    if (suggestions.runningVar) setRunningVar(suggestions.runningVar);
    if (suggestions.outcomeVar) setOutcomeVar(suggestions.outcomeVar);
    if (suggestions.cutoff != null) setCutoff(suggestions.cutoff);
    if (suggestions.treatmentSide) setTreatmentSide(suggestions.treatmentSide);
  };

  // Resize handlers for AI sidebar
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const container = document.querySelector('[data-rd-setup-layout]') as HTMLElement;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      const minWidth = COLLAPSE_THRESHOLD;
      const maxWidth = 800;
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setAiSidebarWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
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
  }, [isResizing]);

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

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  const handleRunAnalysis = async () => {
    if (!canProceed) return;
    if (!selectedDataset) {
      setAnalysisError('No dataset selected');
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      // Build request payload
      const payload: any = {
        running_var: runningVar,
        outcome_var: outcomeVar,
        cutoff: parseFloat(cutoff),
        treatment_side: treatmentSide,
        polynomial_order: polynomialOrder,
        rd_type: rdType,
      };

      // Add treatment_var for fuzzy RDD
      if (rdType === 'fuzzy' && treatmentVar) {
        payload.treatment_var = treatmentVar;
      }

      // Add bandwidth if provided
      if (bandwidth && !isNaN(parseFloat(bandwidth))) {
        payload.bandwidth = parseFloat(bandwidth);
      }

      // Call RD analysis endpoint
      const response = await axios.post(
        `/datasets/${selectedDataset.id}/analyze/rd`,
        payload,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      // Store results in localStorage (keyed by project for multi-project support)
      const storageKey = projectId
        ? `rdAnalysisResults_${projectId}`
        : 'rdAnalysisResults';
      localStorage.setItem(storageKey, JSON.stringify(response.data));

      // Save project state with analysis config and results - like DiD VariableSelectionPage
      if (projectId && accessToken) {
        try {
          await projectStateService.saveState(
            projectId,
            {
              currentStep: 'results',
              selectedMethod: 'rdd',
              analysisConfig: {
                runningVar,
                cutoff: parseFloat(cutoff),
                outcomeVar,
                bandwidth: bandwidth || undefined,
                polynomialOrder,
                treatmentSide,
                rdType,
                treatmentVar: rdType === 'fuzzy' ? treatmentVar : undefined,
              },
              lastResults: response.data,
            },
            accessToken
          );
        } catch (saveError) {
          console.warn('Failed to save project state:', saveError);
        }
      }

      // Navigate to results page (include query params so results load when URL is bookmarked or opened in new tab)
      const params = new URLSearchParams();
      if (projectId != null) params.set('projectId', String(projectId));
      params.set('datasetId', String(selectedDataset.id));
      const urlWithParams = `/rd-results?${params.toString()}`;
      navigate(urlWithParams, {
        state: { projectId, datasetId: selectedDataset.id },
      });
    } catch (error: any) {
      console.error('RD analysis failed:', error);
      setAnalysisError(
        error.response?.data?.error || 'Failed to run RD analysis'
      );
    } finally {
      setAnalyzing(false);
    }
  };

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
          <h2 style={styles.errorTitle}>Error Loading Dataset</h2>
          <p style={styles.errorMessage}>{error}</p>
          <button
            onClick={() => window.history.back()}
            style={styles.backButton}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div style={styles.contentContainer}>
        <div style={styles.header}>
          <h1 style={styles.title}>Regression Discontinuity Setup</h1>
          <p style={styles.subtitle}>
            Configure your RD analysis by selecting variables and the cutoff threshold
          </p>
        </div>

        <div style={styles.mainContent} data-rd-setup-layout>
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
                    { label: 'Y  Outcome',  bg: '#d1fae5', border: '#059669' },
                    { label: 'R  Running',  bg: '#dbeafe', border: '#2563eb' },
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
                        : col === runningVar ? 'running'
                        : 'none';
                    const headerBg: Record<string, string> = {
                      outcome: '#d1fae5', running: '#dbeafe', none: '#f1f5f9',
                    };
                    const headerBorder: Record<string, string> = {
                      outcome: '#059669', running: '#2563eb', none: 'transparent',
                    };
                    const cellBg: Record<string, string> = {
                      outcome: '#f0fdf4', running: '#eff6ff', none: 'transparent',
                    };
                    const roleLabel: Record<string, string> = {
                      outcome: 'Y', running: 'R', none: '',
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

            <div style={styles.leftContent}>
          <div style={styles.cardsContainer}>
            {/* Card 1: Running Variable */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>1</div>
                <div style={styles.cardTitle}>Running Variable</div>
                <div style={styles.requiredBadge}>Required</div>
              </div>
              <p style={styles.helperText}>
                Select the variable that determines treatment assignment (e.g., test score, age, income).
              </p>
              <SearchableDropdown
                options={variables
                  .filter((v) => v.type === 'numeric')
                  .map((variable) => ({
                    value: variable.name,
                    label: variable.name,
                  }))}
                value={runningVar}
                onChange={(value) => setRunningVar(value)}
                placeholder="Search and select running variable..."
                style={styles.select}
              />
            </div>

            {/* Card 2: Cutoff */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>2</div>
                <div style={styles.cardTitle}>Cutoff Threshold & Treatment Side</div>
                <div style={styles.requiredBadge}>Required</div>
              </div>
              <p style={styles.helperText}>
                Enter the cutoff value and specify which side receive treatment.
              </p>

              <div style={styles.formGroup}>
                <label style={styles.label}>Cutoff Value</label>
                <input
                  type="number"
                  style={styles.textInput}
                  placeholder="e.g., 70"
                  value={cutoff}
                  onChange={(e) => setCutoff(e.target.value)}
                  step="any"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Treatment Side</label>
                <div style={styles.radioGroup}>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="treatmentSide"
                      value="above"
                      checked={treatmentSide === 'above'}
                      onChange={() => setTreatmentSide('above')}
                      style={styles.radioInput}
                    />
                    Units at or above {cutoff || 'the cutoff'} (Standard)
                  </label>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="treatmentSide"
                      value="below"
                      checked={treatmentSide === 'below'}
                      onChange={() => setTreatmentSide('below')}
                      style={styles.radioInput}
                    />
                    Units below {cutoff || 'the cutoff'}
                  </label>
                </div>
              </div>
            </div>

            {/* Card 3: Outcome Variable */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>3</div>
                <div style={styles.cardTitle}>Outcome Variable</div>
                <div style={styles.requiredBadge}>Required</div>
              </div>
              <p style={styles.helperText}>
                Select the outcome you're measuring (e.g., earnings, college GPA, sales).
              </p>
              <SearchableDropdown
                options={variables
                  .filter(
                    (v) => v.type === 'numeric' || v.type === 'categorical'
                  )
                  .map((variable) => ({
                    value: variable.name,
                    label: variable.name,
                  }))}
                value={outcomeVar}
                onChange={(value) => setOutcomeVar(value)}
                placeholder="Search and select outcome variable..."
                style={styles.select}
              />
            </div>

            {/* Card 4: Design Type — Sharp vs Fuzzy */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>4</div>
                <div style={styles.cardTitle}>Design Type</div>
                <div style={styles.requiredBadge}>Required</div>
              </div>
              <p style={styles.helperText}>
                Is the cutoff rule perfectly enforced, or do some units not comply with it?
              </p>

              <div style={styles.radioGroup}>
                <label
                  style={{
                    ...styles.designTypeOption,
                    ...(rdType === 'sharp' ? styles.designTypeOptionActive : {}),
                  }}
                >
                  <input
                    type="radio"
                    name="rdType"
                    value="sharp"
                    checked={rdType === 'sharp'}
                    onChange={() => { setRdType('sharp'); setTreatmentVar(''); }}
                    style={styles.radioInput}
                  />
                  <div>
                    <div style={styles.designTypeLabel}>
                      Sharp RDD
                      <span style={styles.designTypeBadgeGreen}>Most common</span>
                    </div>
                    <div style={styles.designTypeDesc}>
                      Treatment is fully determined by the cutoff. Every unit {treatmentSide === 'above' ? 'at or above' : 'below'} <strong>{cutoff || 'the threshold'}</strong> receives treatment; all others do not.
                      <br />
                      <em>Example: scholarship automatically awarded to students with GPA ≥ 3.0.</em>
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    ...styles.designTypeOption,
                    ...(rdType === 'fuzzy' ? styles.designTypeOptionActive : {}),
                  }}
                >
                  <input
                    type="radio"
                    name="rdType"
                    value="fuzzy"
                    checked={rdType === 'fuzzy'}
                    onChange={() => setRdType('fuzzy')}
                    style={styles.radioInput}
                  />
                  <div style={{ width: '100%' }}>
                    <div style={styles.designTypeLabel}>
                      Fuzzy RDD
                      <span style={styles.designTypeBadgeYellow}>Requires treatment receipt column</span>
                    </div>
                    <div style={styles.designTypeDesc}>
                      The cutoff only probabilistically determines treatment. Some units above the cutoff may not receive it; some below may still receive it. The LATE is estimated via the Wald ratio (intent-to-treat ÷ first-stage compliance).
                      <br />
                      <em>Example: crossing the minimum drinking age raises the probability of drinking, but does not guarantee it.</em>
                    </div>
                    {rdType === 'fuzzy' && (
                      <div style={{ marginTop: '16px' }}>
                        <label style={styles.label}>
                          Treatment Receipt Variable <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <p style={styles.helperTextSmall}>
                          Select the binary column (0/1) that records whether each unit <em>actually received</em> treatment — not just whether they were assigned by the cutoff.
                        </p>
                        <SearchableDropdown
                          options={variables
                            .filter((v) => v.name !== runningVar && v.name !== outcomeVar)
                            .map((v) => ({ value: v.name, label: v.name }))}
                          value={treatmentVar}
                          onChange={(value) => setTreatmentVar(value)}
                          placeholder="Search and select treatment receipt variable..."
                          style={styles.select}
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Card 5: Advanced Options */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>5</div>
                <div style={styles.cardTitle}>Advanced Options</div>
                <div style={styles.optionalBadge}>Optional</div>
              </div>
              <p style={styles.helperText}>
                Customize bandwidth and polynomial order (defaults are recommended).
              </p>
              <button
                style={styles.toggleButton}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? '▼ Hide Advanced Options' : '▶ Show Advanced Options'}
              </button>

              {showAdvanced && (
                <div style={styles.advancedSection}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Bandwidth (optional)</label>
                    <div style={styles.bandwidthExplainer}>
                      <p style={styles.bandwidthExplainerText}>
                        <strong>What is bandwidth?</strong> Bandwidth defines the window of running-variable values around the cutoff that are included in the estimation. Only observations within <em>[cutoff − h, cutoff + h]</em> are used, where <em>h</em> is the bandwidth.
                      </p>
                      <div style={styles.bandwidthTradeoff}>
                        <div style={styles.bandwidthTradeoffItem}>
                          <span style={styles.bandwidthTradeoffLabel}>Narrower →</span>
                          <span style={styles.bandwidthTradeoffDesc}>Units near cutoff are more comparable, but fewer observations means higher variance.</span>
                        </div>
                        <div style={styles.bandwidthTradeoffItem}>
                          <span style={styles.bandwidthTradeoffLabel}>Wider →</span>
                          <span style={styles.bandwidthTradeoffDesc}>More observations reduce variance, but units farther from the cutoff may differ in other ways, introducing bias.</span>
                        </div>
                      </div>
                      <p style={styles.bandwidthRecommendation}>
                        💡 Leave empty to let the Imbens-Kalyanaraman algorithm automatically find the optimal bias-variance trade-off.
                      </p>
                    </div>
                    <input
                      type="number"
                      style={styles.textInput}
                      placeholder="Auto (recommended)"
                      value={bandwidth}
                      onChange={(e) => setBandwidth(e.target.value)}
                      step="any"
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Polynomial Order</label>
                    <p style={styles.helperTextSmall}>
                      Linear (1) is recommended. Quadratic (2) may overfit.
                    </p>
                    <select
                      style={styles.select}
                      value={polynomialOrder}
                      onChange={(e) =>
                        setPolynomialOrder(parseInt(e.target.value))
                      }
                    >
                      <option value={1}>Linear (recommended)</option>
                      <option value={2}>Quadratic</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Analysis Error */}
          {analysisError && (
            <div style={styles.errorBox}>
              <strong>⚠️ Analysis Error:</strong> {analysisError}
            </div>
          )}

          {/* Run Analysis Button */}
          <div style={styles.actionContainer}>
            <button
              style={{
                ...styles.runButton,
                ...((!canProceed || analyzing) && styles.runButtonDisabled),
              }}
              onClick={handleRunAnalysis}
              disabled={!canProceed || analyzing}
            >
              {analyzing ? 'Running Analysis...' : 'Run RD Analysis'}
            </button>
          </div>
            </div>

            {/* AI Variable Suggestions Sidebar */}
            {schemaInfo && (
              <div
                style={{
                  ...styles.aiSidebar,
                  width: `${aiSidebarWidth}px`,
                  flex: `0 0 ${aiSidebarWidth}px`,
                  position: 'sticky' as const,
                  top: '90px',
                  overflow: 'visible' as const,
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
                    maxHeight: 'calc(100vh - 200px)',
                    overflowY: 'auto' as const,
                    overflowX: 'hidden' as const,
                    boxSizing: 'border-box' as const,
                  }}
                >
                  <RDVariableSuggestions
                    schemaInfo={schemaInfo}
                    causalQuestion={aiHints.causalQuestion}
                    treatmentVariable={aiHints.treatmentVariable}
                    outcomeVariable={aiHints.outcomeVariable}
                    onApplySuggestions={handleApplySuggestions}
                  />
                </div>
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
        onNext={handleRunAnalysis}
        canGoNext={canProceed && !analyzing}
        onStepClick={(path) => navigateToStep(path)}
      />
    </div>
  );
};

export default RDSetup;

const styles = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '120px',
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
    transition: 'all 0.3s ease',
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
  subtitle: {
    fontSize: '18px',
    color: '#666',
    margin: 0,
  },
  mainContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0 20px',
  },
  contentWrapper: {
    display: 'flex',
    gap: '20px',
    alignItems: 'flex-start',
    position: 'relative' as const,
    overflow: 'visible' as const,
  },
  leftContent: {
    flex: '1',
    minWidth: 0,
  },
  aiSidebar: {
    flexShrink: 0,
    position: 'relative' as const,
    marginRight: '0',
    zIndex: 1,
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
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
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
    fontWeight: '500',
  },
  optionalBadge: {
    backgroundColor: '#6c757d',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
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
    margin: '5px 0 10px 0',
    lineHeight: '1.4',
  },
  bandwidthExplainer: {
    backgroundColor: '#f0f7ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    padding: '12px 14px',
    margin: '6px 0 12px 0',
  },
  bandwidthExplainerText: {
    fontSize: '13px',
    color: '#1e3a5f',
    margin: '0 0 10px 0',
    lineHeight: '1.55',
  },
  bandwidthTradeoff: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    marginBottom: '10px',
  },
  bandwidthTradeoffItem: {
    display: 'flex',
    gap: '6px',
    fontSize: '12.5px',
    lineHeight: '1.45',
  },
  bandwidthTradeoffLabel: {
    fontWeight: '700' as const,
    color: '#043873',
    flexShrink: 0,
    minWidth: '72px',
  },
  bandwidthTradeoffDesc: {
    color: '#475569',
  },
  bandwidthRecommendation: {
    fontSize: '12.5px',
    color: '#1e40af',
    margin: 0,
    lineHeight: '1.45',
  },
  select: {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  textInput: {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: 'white',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  },
  toggleButton: {
    background: 'none',
    border: '1px solid #043873',
    color: '#043873',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    marginTop: '10px',
  },
  advancedSection: {
    marginTop: '20px',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px',
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
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  runButtonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginTop: '10px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '15px',
    color: '#333',
    cursor: 'pointer',
  },
  radioInput: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    flexShrink: 0,
    marginTop: '3px',
  },
  designTypeOption: {
    display: 'flex',
    gap: '14px',
    alignItems: 'flex-start',
    padding: '16px 18px',
    borderRadius: '10px',
    border: '2px solid #e0e0e0',
    cursor: 'pointer',
    backgroundColor: '#fafafa',
    transition: 'all 0.15s ease',
  },
  designTypeOptionActive: {
    borderColor: '#043873',
    backgroundColor: '#f0f7ff',
  },
  designTypeLabel: {
    fontSize: '16px',
    fontWeight: '600' as const,
    color: '#333',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '6px',
  },
  designTypeDesc: {
    fontSize: '13px',
    color: '#555',
    lineHeight: 1.6,
  },
  designTypeBadgeGreen: {
    fontSize: '11px',
    fontWeight: '600' as const,
    color: '#1b5e20',
    backgroundColor: '#e8f5e9',
    padding: '2px 8px',
    borderRadius: '12px',
  },
  designTypeBadgeYellow: {
    fontSize: '11px',
    fontWeight: '600' as const,
    color: '#856404',
    backgroundColor: '#fff3cd',
    padding: '2px 8px',
    borderRadius: '12px',
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

