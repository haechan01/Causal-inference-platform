import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import { useAuth } from '../contexts/AuthContext';
import SearchableDropdown from './SearchableDropdown';
import { projectStateService } from '../services/projectStateService';

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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

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

        // Transform schema data to our variable format
        const variablesFromSchema = schemaData.columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          unique_count: col.unique_count,
        }));

        setVariables(variablesFromSchema);
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
  }, [accessToken, location, projectId, datasetId]);

  const canProceed = Boolean(
    runningVar && cutoff && outcomeVar && !isNaN(parseFloat(cutoff))
  );

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
      };

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
              },
              lastResults: response.data,
            },
            accessToken
          );
        } catch (saveError) {
          console.warn('Failed to save project state:', saveError);
        }
      }

      // Navigate to results page
      navigate('/rd-results', {
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
          <div style={styles.errorIcon}>⚠️</div>
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

        <div style={styles.mainContent}>
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

            {/* Card 4: Advanced Options */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>4</div>
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
                    <p style={styles.helperTextSmall}>
                      Leave empty to auto-calculate optimal bandwidth using Imbens-Kalyanaraman method.
                    </p>
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
    maxWidth: '800px',
    margin: '0 auto',
    padding: '0 20px',
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
  },
};

