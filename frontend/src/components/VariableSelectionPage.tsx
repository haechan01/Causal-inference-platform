import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import axios from 'axios';
import { aiService } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import SearchableDropdown from './SearchableDropdown';
import AIVariableSuggestions from './AIVariableSuggestions';
import HelpTooltip from './HelpTooltip';
import AnalysisValidationModal from './AnalysisValidationModal';
import { projectStateService } from '../services/projectStateService';

interface Variable {
  name: string;
  type: string;
  unique_values?: string[];
  unique_count?: number;
}

interface VariableSelection {
  outcome: string;
  treatment: string;
  treatment_value: string;
  time: string;
  treatment_start: string;
  start_period: string;
  end_period: string;
  unit: string;
  controls: string[];
  treatment_units: string[];
  control_units: string[];
}

const VariableSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentStep, steps, goToPreviousStep } = useProgressStep();
  const { accessToken } = useAuth();
  const location = useLocation();
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);

  // AI & Validation State
  const [schemaInfo, setSchemaInfo] = useState<any>(null);
  const [dataSummary, setDataSummary] = useState<any>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationParameters, setValidationParameters] = useState<any>(null);

  // AI Sidebar Resize State
  const [aiSidebarWidth, setAiSidebarWidth] = useState(420); // Default width in pixels
  const [isResizing, setIsResizing] = useState(false);
  const [showControlGuidance, setShowControlGuidance] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp?: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [recommendedQuestions, setRecommendedQuestions] = useState<string[]>([
    "Which variables should I control given my treatment and outcome variables?",
    "What are common pitfalls when selecting control variables for DiD?",
    "How do I know if I have enough time periods for DiD?"
  ]);
  const MAX_MESSAGE_LENGTH = 2000;
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const [selection, setSelection] = useState<VariableSelection>({
    outcome: '',
    treatment: '',
    treatment_value: '',
    time: '',
    treatment_start: '',
    start_period: '',
    end_period: '',
    unit: '',
    controls: [],
    treatment_units: [],
    control_units: []
  });

  // Load datasets and variables from the selected project
  useEffect(() => {
    const loadDatasetVariables = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get project ID and dataset ID from URL params or state
        let projectId = new URLSearchParams(location.search).get('projectId') ||
          (location.state as any)?.projectId;
        let datasetId = (location.state as any)?.datasetId;

        if (!projectId) {
          setError('No project selected. Please go back and select a project.');
          setLoading(false);
          return;
        }

        // Load saved project state first
        try {
          const project = await projectStateService.loadProject(parseInt(projectId as string), accessToken!);
          if (project.analysisConfig) {
            const config = project.analysisConfig;
            setSelection(prev => ({
              ...prev,
              outcome: config.outcome || '',
              treatment: config.treatment || '',
              treatment_value: config.treatmentValue || '',
              time: config.time || '',
              treatment_start: config.treatmentStart || '',
              start_period: config.startPeriod || '',
              end_period: config.endPeriod || '',
              unit: config.unit || '',
              controls: config.controls || [],
              treatment_units: config.treatmentUnits || [],
              control_units: config.controlUnits || []
            }));
          }
          // Get datasetId from project if not provided in navigation state
          if (!datasetId && project.datasets && project.datasets.length > 0) {
            datasetId = project.datasets[0].id;
          }
        } catch (err) {
          console.warn('Failed to load saved state:', err);
        }

        // Load datasets for the project
        const datasetsResponse = await axios.get(`/projects/${projectId}/datasets`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        const datasets = datasetsResponse.data.datasets;

        if (datasets.length === 0) {
          setError('No datasets found for this project. Please upload a dataset first.');
          setLoading(false);
          return;
        }

        // Find selected dataset or use first one
        const dataset = datasetId
          ? datasets.find((d: any) => d.id === datasetId) || datasets[0]
          : datasets[0];

        console.log('Selected dataset:', dataset);
        setSelectedDataset(dataset);

        // Load dataset schema/variables
        const schemaResponse = await axios.get(`/datasets/${dataset.id}/schema`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        const schemaData = schemaResponse.data;
        setSchemaInfo(schemaData);

        // Transform schema data to our variable format
        const variablesFromSchema = schemaData.columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          unique_values: col.unique_values || [],
          unique_count: col.unique_count
        }));

        setVariables(variablesFromSchema);

        // Also fetch preview to get data summary for validation
        try {
          const previewResponse = await axios.get(`/datasets/${dataset.id}/preview`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          setDataSummary(previewResponse.data.summary);
        } catch (err) {
          console.warn("Failed to fetch data summary:", err);
        }

      } catch (error: any) {
        console.error('Error loading dataset variables:', error);
        setError(error.response?.data?.error || 'Failed to load dataset variables');
      } finally {
        setLoading(false);
      }
    };

    if (accessToken) {
      loadDatasetVariables();
    }
  }, [accessToken, location]);

  const handleVariableChange = (field: keyof VariableSelection, value: string | string[]) => {
    setSelection(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleApplySuggestions = (suggestions: any) => {
    setSelection(prev => ({
      ...prev,
      ...suggestions
    }));
  };

  const isCardComplete = (cardNumber: number): boolean => {
    switch (cardNumber) {
      case 1: return !!selection.outcome;
      case 2: return !!selection.treatment && !!selection.treatment_value;
      case 3: return !!selection.time && !!selection.treatment_start && !!selection.start_period && !!selection.end_period;
      case 4: return !!selection.unit;
      case 5: return !!selection.treatment_units.length && !!selection.control_units.length;
      case 6: return true; // Optional control variables card
      default: return false;
    }
  };

  const canProceed = isCardComplete(1) && isCardComplete(2) && isCardComplete(3) && isCardComplete(4) && isCardComplete(5);

  // Resize handlers for AI sidebar
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const container = document.querySelector('[data-variable-selection-layout]') as HTMLElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      // Calculate width from the right edge of the container to the mouse position
      const newWidth = containerRect.right - e.clientX;

      // Constrain width between 300px and 800px
      const minWidth = 300;
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

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  // Auto-scroll chat to bottom when messages change
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Chat handlers
  const handleSendMessage = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;

    if (message.length > MAX_MESSAGE_LENGTH) {
      setChatError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`);
      return;
    }

    setChatError(null);
    setChatLoading(true);

    // Add user message to chat
    const userMessage = { role: 'user' as const, content: message, timestamp: new Date().toISOString() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');

    try {
      // Prepare conversation history (exclude timestamps for API)
      const conversationHistory = chatMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Prepare analysis context with current selections and DiD method
      const analysisContext = {
        method: 'Difference-in-Differences',
        parameters: {
          outcome: selection.outcome || null,
          treatment: selection.treatment || null,
          treatment_value: selection.treatment_value || null,
          time: selection.time || null,
          treatment_start: selection.treatment_start || null,
          start_period: selection.start_period || null,
          end_period: selection.end_period || null,
          unit: selection.unit || null,
          controls: selection.controls,
          treatment_units: selection.treatment_units,
          control_units: selection.control_units
        },
        did_guidelines: `CRITICAL INSTRUCTIONS for helping with Difference-in-Differences analysis:

VARIABLE USAGE:
- The user has selected these EXACT variables from their dataset in the 'parameters' object above
- TREATMENT variable: ${selection.treatment ? `"${selection.treatment}"` : 'NOT YET SELECTED'}
- OUTCOME variable: ${selection.outcome ? `"${selection.outcome}"` : 'NOT YET SELECTED'}
- TIME variable: ${selection.time ? `"${selection.time}"` : 'NOT YET SELECTED'}
- UNIT variable: ${selection.unit ? `"${selection.unit}"` : 'NOT YET SELECTED'}
- NEVER make assumptions about what these variable names mean or represent
- ALWAYS refer to variables by their exact selected names shown above
- If you need to understand what a variable represents to answer a question, ASK THE USER directly
- Example: "Can you tell me what the '${selection.outcome || 'outcome'}' variable represents in your study?"

CONTROL VARIABLE GUIDELINES:
- DiD automatically controls for time-invariant differences between groups through group fixed effects
- DiD automatically controls for common time shocks through time fixed effects  
- Users should control for time-varying confounders that differ between treatment and control groups
- Warn against "bad controls" - variables affected by treatment itself
- Help users think about variables that change over time AND differ across treatment/control groups

WHEN VARIABLES ARE NOT SELECTED:
- If treatment or outcome is not selected, acknowledge this and ask the user to select them first
- Example: "I see you haven't selected a treatment variable yet. Please select it from the form above so I can provide specific guidance."

ALWAYS BE PRECISE: Use the exact variable names from the parameters, never substitute with your own assumptions.`
      };

      // Prepare dataset info
      const datasetInfo = schemaInfo ? {
        name: selectedDataset?.name || 'Dataset',
        columns: schemaInfo.columns,
        summary: dataSummary
      } : undefined;

      // DEBUG: Log what we're sending to AI
      console.log('=== AI CHAT DEBUG ===');
      console.log('User message:', message);
      console.log('Analysis Context:', JSON.stringify(analysisContext, null, 2));
      console.log('Dataset Info:', datasetInfo ? `${datasetInfo.name} with ${datasetInfo.columns?.length} columns` : 'undefined');
      console.log('====================');

      // Call chat API with aiService
      const response = await aiService.chat(
        message,
        conversationHistory,
        analysisContext,
        datasetInfo
      );

      // Add assistant response to chat
      const assistantMessage = {
        role: 'assistant' as const,
        content: response.response,
        timestamp: response.timestamp
      };
      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Chat error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to send message';
      setChatError(errorMessage);

      // Remove user message if error occurred
      setChatMessages(prev => prev.slice(0, -1));
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

  const handleNextClick = () => {
    if (canProceed && selectedDataset) {
      // Calculate structure info for validation
      const unitVar = variables.find(v => v.name === selection.unit);
      const timeVar = variables.find(v => v.name === selection.time);

      const structureInfo = {
        unit_column: selection.unit,
        time_column: selection.time,
        unit_count: unitVar?.unique_count,
        time_count: timeVar?.unique_count,
        expected_rows: (unitVar?.unique_count && timeVar?.unique_count)
          ? unitVar.unique_count * timeVar.unique_count
          : null
      };

      // Prepare parameters for validation
      const params = {
        outcome: selection.outcome,
        treatment: selection.treatment,
        treatment_value: selection.treatment_value,
        time: selection.time,
        treatment_start: selection.treatment_start,
        start_period: selection.start_period,
        end_period: selection.end_period,
        unit: selection.unit,
        controls: selection.controls,
        treatment_units: selection.treatment_units,
        control_units: selection.control_units
      };

      setValidationParameters(params);

      // Enrich data summary with structure info
      setDataSummary((prev: any) => ({
        ...prev,
        structure_info: structureInfo
      }));

      setShowValidationModal(true);
    }
  };

  const handleRunAnalysis = async (): Promise<void> => {
    // Use current selectedDataset or fallback
    const datasetToUse = selectedDataset;
    if (!datasetToUse) {
      console.error('No dataset selected for analysis');
      setShowValidationModal(false);
      setError('No dataset selected. Please refresh and try again.');
      throw new Error('No dataset selected');
    }

    // Clear any cached results before making fresh API call
    localStorage.removeItem('didAnalysisResults');

    // Get project ID
    const projectId = new URLSearchParams(location.search).get('projectId') ||
      (location.state as any)?.projectId;

    // Run DiD analysis
    const analysisResponse = await axios.post(`/datasets/${datasetToUse.id}/analyze/did`, {
      outcome: selection.outcome,
      treatment: selection.treatment,
      treatment_value: selection.treatment_value,
      time: selection.time,
      treatment_start: selection.treatment_start,
      start_period: selection.start_period,
      end_period: selection.end_period,
      unit: selection.unit,
      controls: selection.controls,
      treatment_units: selection.treatment_units,
      control_units: selection.control_units
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // Check if response.data is a string that needs parsing
    let responseData = analysisResponse.data;
    if (typeof responseData === 'string') {
      try {
        responseData = JSON.parse(responseData);
      } catch (parseError) {
        throw new Error('Failed to parse analysis response');
      }
    }

    // Store results in localStorage for the results page
    localStorage.setItem('didAnalysisResults', JSON.stringify(responseData));

    // Save project state with analysis config and results
    if (projectId && accessToken) {
      try {
        await projectStateService.saveState(parseInt(projectId), {
          currentStep: 'results',
          analysisConfig: {
            outcome: selection.outcome,
            treatment: selection.treatment,
            treatmentValue: selection.treatment_value,
            time: selection.time,
            treatmentStart: selection.treatment_start,
            startPeriod: selection.start_period,
            endPeriod: selection.end_period,
            unit: selection.unit,
            controls: selection.controls,
            treatmentUnits: selection.treatment_units,
            controlUnits: selection.control_units
          },
          lastResults: responseData
        }, accessToken);
      } catch (saveError) {
        console.warn('Failed to save project state:', saveError);
      }
    }

    // Close modal and navigate to results page with state
    setShowValidationModal(false);
    const datasetIdToPass = (location.state as any)?.datasetId || datasetToUse.id;
    navigate('/results', {
      state: {
        projectId: parseInt(projectId as string),
        datasetId: datasetIdToPass
      }
    });
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
          <h1 style={styles.title}>Configure Your Analysis</h1>
          <p style={styles.subtitle}>Select the variables for your Difference-in-Differences analysis</p>
        </div>

        <div style={styles.mainContent} data-variable-selection-layout>
          <div style={styles.contentWrapper}>
            <div style={styles.leftContent}>
              <div style={styles.cardsContainer}>
                {/* Card 1: Outcome Variable */}
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardNumber}>1</div>
                    <div style={styles.cardTitle}>
                      <HelpTooltip concept="outcome variable in causal inference">
                        Select Your Outcome Variable
                      </HelpTooltip>
                    </div>
                    <div style={styles.requiredBadge}>Required</div>
                  </div>
                  <p style={styles.helperText}>
                    What are you trying to measure the effect on? Choose the column that represents your main outcome.
                  </p>
                  <SearchableDropdown
                    options={variables
                      .filter(v => v.type === 'numeric' || v.type === 'categorical')
                      .map(variable => ({
                        value: variable.name,
                        label: variable.name
                      }))}
                    value={selection.outcome}
                    onChange={(value) => handleVariableChange('outcome', value)}
                    placeholder="Search and select outcome column..."
                    style={styles.select}
                  />
                </div>

                {/* Card 2: Treatment Variable */}
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardNumber}>2</div>
                    <div style={styles.cardTitle}>
                      <HelpTooltip concept="treatment variable and control group">
                        Define Your Treatment
                      </HelpTooltip>
                    </div>
                    <div style={styles.requiredBadge}>Required</div>
                  </div>
                  <p style={styles.helperText}>
                    How do you identify your treated and control groups? Select the column where units are marked as belonging to the treatment group or the control group.
                  </p>
                  <SearchableDropdown
                    options={variables
                      .filter(v => v.type === 'boolean' || v.type === 'categorical' || v.type === 'numeric')
                      .map(variable => ({
                        value: variable.name,
                        label: variable.name
                      }))}
                    value={selection.treatment}
                    onChange={(value) => {
                      handleVariableChange('treatment', value);
                      handleVariableChange('treatment_value', ''); // Reset treatment value
                    }}
                    placeholder="Search and select treatment column..."
                    style={styles.select}
                  />

                  {selection.treatment && (
                    <div style={styles.conditionalSection}>
                      <p style={styles.conditionalText}>
                        Enter the specific value that represents the treated group in the "{selection.treatment}" column.
                        {variables.find(v => v.name === selection.treatment)?.unique_values &&
                          ` (Available values: ${variables.find(v => v.name === selection.treatment)?.unique_values?.join(', ')})`
                        }
                      </p>
                      <input
                        type="text"
                        style={styles.textInput}
                        placeholder="Enter treatment value..."
                        value={selection.treatment_value}
                        onChange={(e) => handleVariableChange('treatment_value', e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Card 3: Time Variable */}
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardNumber}>3</div>
                    <div style={styles.cardTitle}>
                      <HelpTooltip concept="time variable in panel data">
                        Define Your Time Variable
                      </HelpTooltip>
                    </div>
                    <div style={styles.requiredBadge}>Required</div>
                  </div>
                  <p style={styles.helperText}>
                    Which column represents the time? Select the column that shows when each observation was recorded.
                  </p>
                  <SearchableDropdown
                    options={variables
                      .filter(v => v.type === 'numeric' || v.type === 'date')
                      .map(variable => ({
                        value: variable.name,
                        label: variable.name
                      }))}
                    value={selection.time}
                    onChange={(value) => {
                      handleVariableChange('time', value);
                      handleVariableChange('treatment_start', '');
                    }}
                    placeholder="Search and select time column..."
                    style={styles.select}
                  />

                  {selection.time && (
                    <div style={styles.conditionalSection}>
                      <p style={styles.conditionalText}>When did the treatment start?</p>
                      {variables.find(v => v.name === selection.time)?.type === 'numeric' ? (
                        <input
                          type="text"
                          value={selection.treatment_start}
                          onChange={(e) => handleVariableChange('treatment_start', e.target.value)}
                          placeholder="Enter the treatment start year (e.g., 2020)"
                          style={styles.textInput}
                        />
                      ) : (
                        <SearchableDropdown
                          options={variables.find(v => v.name === selection.time)?.unique_values?.map(value => ({
                            value: value,
                            label: value
                          })) || []}
                          value={selection.treatment_start}
                          onChange={(value) => handleVariableChange('treatment_start', value)}
                          placeholder="Search and select treatment start date..."
                          style={styles.select}
                        />
                      )}

                      <div style={styles.periodInputs}>
                        <p style={styles.conditionalText}>Define the analysis period:</p>
                        <div style={styles.periodInputGroup}>
                          <label style={styles.periodLabel}>Start Period:</label>
                          {variables.find(v => v.name === selection.time)?.type === 'numeric' ? (
                            <input
                              type="number"
                              style={styles.periodInput}
                              placeholder="e.g., 2013"
                              value={selection.start_period}
                              onChange={(e) => handleVariableChange('start_period', e.target.value)}
                            />
                          ) : (
                            <input
                              type="text"
                              style={styles.periodInput}
                              placeholder="e.g., 2013"
                              value={selection.start_period}
                              onChange={(e) => handleVariableChange('start_period', e.target.value)}
                            />
                          )}
                        </div>

                        <div style={styles.periodInputGroup}>
                          <label style={styles.periodLabel}>End Period:</label>
                          {variables.find(v => v.name === selection.time)?.type === 'numeric' ? (
                            <input
                              type="number"
                              style={styles.periodInput}
                              placeholder="e.g., 2023"
                              value={selection.end_period}
                              onChange={(e) => handleVariableChange('end_period', e.target.value)}
                            />
                          ) : (
                            <input
                              type="text"
                              style={styles.periodInput}
                              placeholder="e.g., 2023"
                              value={selection.end_period}
                              onChange={(e) => handleVariableChange('end_period', e.target.value)}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>


                {/* Card 4: Select Treatment and Control Units */}
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardNumber}>4</div>
                    <div style={styles.cardTitle}>
                      <HelpTooltip concept="unit of analysis">
                        Select Treatment and Control Groups
                      </HelpTooltip>
                    </div>
                    <div style={styles.optionalBadge}>Optional</div>
                  </div>
                  <p style={styles.helperText}>
                    Which column identifies your individuals or groups? Select the column that uniquely identifies each unit being tracked over time.
                  </p>
                  <SearchableDropdown
                    options={variables
                      .filter(v => v.type === 'string' || v.type === 'numeric' || v.type === 'categorical')
                      .map(variable => ({
                        value: variable.name,
                        label: variable.name
                      }))}
                    value={selection.unit}
                    onChange={(value) => handleVariableChange('unit', value)}
                    placeholder="Search and select unit column..."
                    style={styles.select}
                  />
                  <p style={styles.helperText}>
                    Choose which specific {selection.unit} values should be in your treatment group and which should be in your control group.
                  </p>

                  {/* Get unique values for the unit variable */}
                  {(() => {
                    const unitVariable = variables.find(v => v.name === selection.unit);
                    const unitValues = unitVariable?.unique_values || [];
                    return (
                      <div style={styles.unitSelectionContainer}>
                        {/* Treatment Units */}
                        <div style={styles.unitGroup}>
                          <h4 style={styles.unitGroupTitle}>Treatment Group Units</h4>
                          <p style={styles.unitGroupDescription}>
                            Select which {selection.unit} values should receive the treatment:
                          </p>
                          <div style={styles.searchableDropdownContainer}>
                            <SearchableDropdown
                              options={unitValues.map(value => ({
                                value: value,
                                label: value
                              }))}
                              value=""
                              onChange={(value) => {
                                // Add the selected value to the treatment units if it's not already there
                                if (value && !selection.treatment_units.includes(value)) {
                                  setSelection(prev => ({
                                    ...prev,
                                    treatment_units: [...prev.treatment_units, value],
                                    control_units: prev.control_units.filter(u => u !== value)
                                  }));
                                }
                              }}
                              placeholder="Search and select treatment units..."
                              style={styles.select}
                            />
                            {/* Show selected treatment units */}
                            {selection.treatment_units.length > 0 && (
                              <div style={styles.selectedUnits}>
                                <p style={styles.selectedUnitsLabel}>Selected Treatment Units:</p>
                                <div style={styles.selectedUnitsList}>
                                  {selection.treatment_units.map(unit => (
                                    <span key={unit} style={styles.selectedUnitTag}>
                                      {unit}
                                      <button
                                        type="button"
                                        style={styles.removeUnitButton}
                                        onClick={() => {
                                          setSelection(prev => ({
                                            ...prev,
                                            treatment_units: prev.treatment_units.filter(u => u !== unit)
                                          }));
                                        }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Control Units */}
                        <div style={styles.unitGroup}>
                          <h4 style={styles.unitGroupTitle}>Control Group Units</h4>
                          <p style={styles.unitGroupDescription}>
                            Select which {selection.unit} values should be in the control group:
                          </p>
                          <div style={styles.searchableDropdownContainer}>
                            <SearchableDropdown
                              options={unitValues.map(value => ({
                                value: value,
                                label: value
                              }))}
                              value=""
                              onChange={(value) => {
                                // Add the selected value to the control units if it's not already there
                                if (value && !selection.control_units.includes(value)) {
                                  setSelection(prev => ({
                                    ...prev,
                                    control_units: [...prev.control_units, value],
                                    treatment_units: prev.treatment_units.filter(u => u !== value)
                                  }));
                                }
                              }}
                              placeholder="Search and select control units..."
                              style={styles.select}
                            />
                            {/* Show selected control units */}
                            {selection.control_units.length > 0 && (
                              <div style={styles.selectedUnits}>
                                <p style={styles.selectedUnitsLabel}>Selected Control Units:</p>
                                <div style={styles.selectedUnitsList}>
                                  {selection.control_units.map(unit => (
                                    <span key={unit} style={styles.selectedUnitTag}>
                                      {unit}
                                      <button
                                        type="button"
                                        style={styles.removeUnitButton}
                                        onClick={() => {
                                          setSelection(prev => ({
                                            ...prev,
                                            control_units: prev.control_units.filter(u => u !== unit)
                                          }));
                                        }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Card 5: Control Variables */}
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardNumber}>5</div>
                    <div style={styles.cardTitle}>
                      <HelpTooltip concept="control variables">
                        Select Control Variables
                      </HelpTooltip>
                    </div>
                    <div style={styles.optionalBadge}>Optional</div>
                  </div>
                  <p style={{ ...styles.helperText, marginBottom: '12px', color: '#475569' }}>
                    Control for time-varying confounders that affect both treatment and outcome. Need help deciding?
                  </p>

                  {/* AI Recommendation Prompt */}
                  <div style={{
                    backgroundColor: '#f0f9ff',
                    border: '1px solid #4F9CF9',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    fontSize: '13px',
                    color: '#1e40af',
                    lineHeight: '1.6'
                  }}>
                    💡 <strong>Ask AI for help:</strong> {selection.outcome && selection.treatment ? (
                      <>"What control variables should I include when studying the effect of <strong>{selection.treatment}</strong> on <strong>{selection.outcome}</strong>?"</>
                    ) : (
                      "Select your treatment and outcome variables above, then ask the AI for control variable recommendations."
                    )}
                  </div>

                  {/* Collapsible Guidance Section */}
                  <button
                    style={styles.detailsToggleBtn}
                    onClick={() => setShowControlGuidance(!showControlGuidance)}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0f7ff';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span>What variables should I control in DiD?</span>
                    <span>{showControlGuidance ? '▲' : '▼'}</span>
                  </button>

                  {showControlGuidance && (
                    <div style={styles.statisticalDetailsInline}>
                      <div style={{ marginBottom: '15px' }}>
                        <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                          ℹ️ What DID Already Handles:
                        </p>
                        <p style={{ fontSize: '13px', color: '#475569', marginBottom: '0', lineHeight: '1.6' }}>
                          The DID design with group and time fixed effects automatically absorbs <strong>time-invariant differences</strong> between groups (geography, baseline characteristics) and <strong>common time shocks</strong> (macroeconomic fluctuations, seasonal patterns). You don't need to explicitly control for these.
                        </p>
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                          ⚠️ What You Should Consider Controlling:
                        </p>
                        <p style={{ fontSize: '13px', color: '#475569', marginBottom: '8px', lineHeight: '1.6' }}>
                          Control for <strong>time-varying confounders</strong> that differentially affect treatment and control groups. These are variables that:
                        </p>
                        <ul style={{ fontSize: '13px', color: '#475569', marginLeft: '20px', marginBottom: '0', lineHeight: '1.6' }}>
                          <li>Change over time differently across groups</li>
                          <li>Correlate with both treatment status and the outcome trajectory</li>
                          <li>Examples: regional economic indicators, concurrent policies, demographic shifts, compositional variables</li>
                        </ul>
                      </div>

                      <div>
                        <p style={{ fontSize: '14px', fontWeight: '600', color: '#dc2626', marginBottom: '8px' }}>
                          🚫 Avoid "Bad Controls":
                        </p>
                        <p style={{ fontSize: '13px', color: '#475569', marginBottom: '0', lineHeight: '1.6' }}>
                          <strong>Do not control for variables affected by the treatment itself</strong>, as this blocks part of the causal pathway and biases your estimate. For example, if studying a job training program's effect on wages, don't control for employment status if the program also affects employment.
                        </p>
                      </div>
                    </div>
                  )}
                  <div style={styles.multiSelectContainer}>
                    {variables.filter(v => v.name !== selection.outcome &&
                      v.name !== selection.treatment &&
                      v.name !== selection.time &&
                      v.name !== selection.unit).map(variable => (
                        <label key={variable.name} style={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={selection.controls.includes(variable.name)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleVariableChange('controls', [...selection.controls, variable.name]);
                              } else {
                                handleVariableChange('controls', selection.controls.filter(v => v !== variable.name));
                              }
                            }}
                            style={styles.checkbox}
                          />
                          <span style={styles.checkboxText}>{variable.name}</span>
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Suggestions Sidebar - Sticky on Right with Resize */}
            {schemaInfo && (
              <div style={{
                ...styles.aiSidebar,
                width: `${aiSidebarWidth}px`,
                flex: `0 0 ${aiSidebarWidth}px`,
                position: 'sticky' as const,
                top: '90px',
                overflow: 'visible' as const
              }}>
                {/* Resize Handle - positioned at the left edge of the AI section */}
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleResizeStart(e);
                  }}
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
                    pointerEvents: 'auto' as const,
                    userSelect: 'none' as const,
                    WebkitUserSelect: 'none' as const
                  }}
                  title="Drag to resize"
                />
                <div style={{
                  maxHeight: 'calc(100vh - 200px)',
                  overflowY: 'auto' as const,
                  overflowX: 'hidden' as const,
                  boxSizing: 'border-box' as const,
                  position: 'relative' as const
                }}>
                  <div style={styles.aiSection}>
                    <AIVariableSuggestions
                      schemaInfo={schemaInfo}
                      onApplySuggestions={handleApplySuggestions}
                    />

                    {/* AI Chat Section */}
                    <div style={{
                      marginTop: '24px',
                      borderTop: '2px solid #e9ecef',
                      paddingTop: '20px'
                    }}>
                      <h3 style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: '#043873',
                        margin: '0 0 8px 0'
                      }}>
                        💬 Ask AI
                      </h3>
                      <p style={{
                        fontSize: '13px',
                        color: '#475569',
                        marginBottom: '12px',
                        lineHeight: '1.6',
                        backgroundColor: '#f0f9ff',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #bfdbfe'
                      }}>
                        💡 <strong>Tip:</strong> Provide details about your causal question, treatment, outcome, and treatment/control groups for better guidance on control variables and DiD design.
                      </p>

                      {/* Chat Messages */}
                      <div style={{
                        maxHeight: '400px',
                        overflowY: 'auto' as const,
                        marginBottom: '16px',
                        padding: '12px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '8px',
                        border: '1px solid #e9ecef',
                        minHeight: '200px'
                      }}>
                        {chatMessages.length === 0 ? (
                          <div style={{
                            textAlign: 'center' as const,
                            color: '#999',
                            padding: '40px 20px',
                            fontSize: '14px'
                          }}>
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
                                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
                              }}
                            >
                              <div style={{
                                maxWidth: '85%',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                backgroundColor: msg.role === 'user' ? '#4F9CF9' : '#ffffff',
                                color: msg.role === 'user' ? '#ffffff' : '#333',
                                fontSize: '14px',
                                lineHeight: '1.5',
                                boxShadow: msg.role === 'user' ? 'none' : '0 1px 3px rgba(0,0,0,0.1)',
                                border: msg.role === 'user' ? 'none' : '1px solid #e9ecef',
                                whiteSpace: 'pre-wrap' as const,
                                wordBreak: 'break-word' as const
                              }}>
                                {msg.content}
                              </div>
                            </div>
                          ))
                        )}
                        {chatLoading && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            marginBottom: '16px'
                          }}>
                            <div style={{
                              padding: '10px 14px',
                              borderRadius: '12px',
                              backgroundColor: '#ffffff',
                              border: '1px solid #e9ecef',
                              fontSize: '14px',
                              color: '#666',
                              display: 'flex',
                              alignItems: 'center'
                            }}>
                              <div style={{
                                width: '16px',
                                height: '16px',
                                border: '2px solid #f3f3f3',
                                borderTop: '2px solid #4F9CF9',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                marginRight: '8px'
                              }}></div>
                              <span>AI is thinking...</span>
                            </div>
                          </div>
                        )}
                        <div ref={chatMessagesEndRef} />
                      </div>

                      {/* Chat Error */}
                      {chatError && (
                        <div style={{
                          padding: '10px',
                          marginBottom: '12px',
                          backgroundColor: '#f8d7da',
                          color: '#721c24',
                          borderRadius: '6px',
                          fontSize: '13px',
                          border: '1px solid #f5c6cb'
                        }}>
                          ⚠️ {chatError}
                        </div>
                      )}

                      {/* Chat Input */}
                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-end'
                      }}>
                        <textarea
                          value={chatInput}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value.length <= MAX_MESSAGE_LENGTH) {
                              setChatInput(value);
                              setChatError(null);
                            }
                          }}
                          onKeyPress={handleChatInputKeyPress}
                          placeholder="Ask about control variables, DiD assumptions, or your analysis design..."
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
                            boxSizing: 'border-box' as const
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#4F9CF9';
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#dee2e6';
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
                            fontWeight: '600',
                            transition: 'background-color 0.2s',
                            height: '60px',
                            minWidth: '80px'
                          }}
                          onMouseEnter={(e) => {
                            if (chatInput.trim() && !chatLoading && chatInput.length <= MAX_MESSAGE_LENGTH) {
                              e.currentTarget.style.backgroundColor = '#3d7dd6';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (chatInput.trim() && !chatLoading && chatInput.length <= MAX_MESSAGE_LENGTH) {
                              e.currentTarget.style.backgroundColor = '#4F9CF9';
                            }
                          }}
                        >
                          {chatLoading ? '...' : 'Send'}
                        </button>
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#999',
                        marginTop: '6px',
                        textAlign: 'right' as const
                      }}>
                        {chatInput.length}/{MAX_MESSAGE_LENGTH} characters
                      </div>

                      {/* Recommended Questions */}
                      {recommendedQuestions.length > 0 && (
                        <div style={{
                          marginTop: '16px',
                          paddingTop: '16px',
                          borderTop: '1px solid #e9ecef'
                        }}>
                          <div style={{
                            fontSize: '13px',
                            color: '#666',
                            marginBottom: '10px',
                            fontWeight: '500'
                          }}>
                            💡 Suggested questions:
                          </div>
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column' as const,
                            gap: '8px'
                          }}>
                            {recommendedQuestions.map((question, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  setChatInput(question);
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
                                  transition: 'all 0.2s',
                                  opacity: chatLoading ? 0.6 : 1
                                }}
                                onMouseEnter={(e) => {
                                  if (!chatLoading) {
                                    e.currentTarget.style.backgroundColor = '#e7f3ff';
                                    e.currentTarget.style.borderColor = '#4F9CF9';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!chatLoading) {
                                    e.currentTarget.style.backgroundColor = '#f8f9fa';
                                    e.currentTarget.style.borderColor = '#dee2e6';
                                  }
                                }}
                              >
                                {question}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Validation Modal */}
      <AnalysisValidationModal
        isOpen={showValidationModal}
        parameters={validationParameters}
        dataSummary={dataSummary}
        onProceed={handleRunAnalysis}
        onCancel={() => setShowValidationModal(false)}
      />

      {/* Bottom Progress Bar */}
      <BottomProgressBar
        currentStep={currentStep}
        steps={steps}
        onPrev={goToPreviousStep}
        onNext={handleNextClick}
        canGoNext={canProceed}
        onStepClick={(path) => {
          const projectId = new URLSearchParams(location.search).get('projectId') ||
            (location.state as any)?.projectId;
          const datasetId = (location.state as any)?.datasetId || selectedDataset?.id;
          navigate(path, { state: { projectId, datasetId } });
        }}
      />
    </div>
  );
};

export default VariableSelectionPage;

const styles = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '80px',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5'
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px'
  },
  loadingText: {
    fontSize: '18px',
    color: '#666',
    margin: 0
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5',
    padding: '40px 20px',
    textAlign: 'center' as const
  },
  errorIcon: {
    fontSize: '64px',
    marginBottom: '20px'
  },
  errorTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#dc3545',
    margin: '0 0 15px 0'
  },
  errorMessage: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 30px 0',
    maxWidth: '500px',
    lineHeight: '1.5'
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
    '&:hover': {
      backgroundColor: '#0a4a8a'
    }
  },
  header: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    maxWidth: '1000px',
    margin: '0 auto'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0'
  },
  subtitle: {
    fontSize: '18px',
    color: '#666',
    margin: 0
  },
  mainContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0 20px'
  },
  contentWrapper: {
    display: 'flex',
    gap: '20px',
    alignItems: 'flex-start',
    position: 'relative' as const,
    overflow: 'visible' as const
  },
  leftContent: {
    flex: '1',
    minWidth: 0
  },
  aiSidebar: {
    flexShrink: 0,
    position: 'relative' as const,
    marginRight: '0',
    zIndex: 1
  },
  cardsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '25px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e0e0e0'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    marginBottom: '15px'
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
    fontWeight: 'bold'
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    flex: 1
  },
  requiredBadge: {
    backgroundColor: '#dc3545',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500'
  },
  optionalBadge: {
    backgroundColor: '#6c757d',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500'
  },
  helperText: {
    fontSize: '14px',
    color: '#334155',
    margin: '0 0 15px 0',
    lineHeight: '1.5'
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
    '&:focus': {
      borderColor: '#043873',
      outline: 'none'
    }
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
    '&:focus': {
      borderColor: '#043873',
      outline: 'none',
      boxShadow: '0 0 0 3px rgba(4, 56, 115, 0.1)'
    }
  },
  periodInputs: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef'
  },
  periodInputGroup: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '12px',
    gap: '12px'
  },
  periodLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#495057',
    minWidth: '120px'
  },
  periodInput: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px'
  },
  conditionalSection: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef'
  },
  conditionalText: {
    fontSize: '14px',
    color: '#495057',
    margin: '0 0 10px 0',
    fontWeight: '500'
  },
  multiSelectContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '10px'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '6px',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: '#f8f9fa'
    }
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
    accentColor: '#043873'
  },
  checkboxText: {
    fontSize: '14px',
    color: '#333'
  },
  unitSelectionContainer: {
    display: 'flex',
    gap: '30px',
    marginTop: '20px'
  },
  unitGroup: {
    flex: 1,
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef'
  },
  unitGroupTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 10px 0'
  },
  unitGroupDescription: {
    fontSize: '14px',
    color: '#495057',
    margin: '0 0 15px 0',
    lineHeight: '1.4'
  },
  searchableDropdownContainer: {
    marginBottom: '15px'
  },
  selectedUnits: {
    marginTop: '15px',
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    border: '1px solid #e9ecef'
  },
  selectedUnitsLabel: {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#495057',
    margin: '0 0 8px 0'
  },
  selectedUnitsList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px'
  },
  selectedUnitTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: '#043873',
    color: 'white',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500'
  },
  removeUnitButton: {
    background: 'none',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    padding: '0',
    marginLeft: '4px',
    '&:hover': {
      color: '#ff6b6b'
    }
  },
  detailsToggleBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #4F9CF9',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#4F9CF9',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '0px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  statisticalDetailsInline: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '16px 20px',
    marginBottom: '16px',
    borderTop: '1px solid #e9ecef'
  },
  aiSection: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    border: '1px solid #e0e0e0',
    width: '100%',
    boxSizing: 'border-box' as const
  }
};
