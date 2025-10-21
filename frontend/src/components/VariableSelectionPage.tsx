import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface Variable {
  name: string;
  type: string;
  unique_values?: string[];
}

interface VariableSelection {
  outcome: string;
  treatment: string;
  treatment_value: string;
  time: string;
  treatment_start: string;
  unit: string;
  controls: string[];
}

const VariableSelectionPage: React.FC = () => {
  const { currentStep, steps, goToPreviousStep, goToNextStep } = useProgressStep();
  const { accessToken } = useAuth();
  const location = useLocation();
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [selection, setSelection] = useState<VariableSelection>({
    outcome: '',
    treatment: '',
    treatment_value: '',
    time: '',
    treatment_start: '',
    unit: '',
    controls: []
  });

  // Load datasets and variables from the selected project
  useEffect(() => {
    const loadDatasetVariables = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get project ID from URL params or state
        const projectId = new URLSearchParams(location.search).get('projectId') || 
                         (location.state as any)?.projectId;
        
        if (!projectId) {
          setError('No project selected. Please go back and select a project.');
          setLoading(false);
          return;
        }

        // Load datasets for the project
        const datasetsResponse = await axios.get(`/projects/${projectId}/datasets`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        const datasets = datasetsResponse.data.datasets;
        
        console.log('Datasets response:', datasetsResponse.data);
        console.log('Datasets:', datasets);
        
        if (datasets.length === 0) {
          setError('No datasets found for this project. Please upload a dataset first.');
          setLoading(false);
          return;
        }

        // For now, use the first dataset. In the future, we could let users choose
        const dataset = datasets[0];
        console.log('Selected dataset:', dataset);
        setSelectedDataset(dataset);

        // Load dataset schema/variables
        // This would be a new API endpoint to get column information
        const schemaResponse = await axios.get(`/datasets/${dataset.id}/schema`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        const schemaData = schemaResponse.data;
        
        console.log('Schema response:', schemaData);
        console.log('Columns:', schemaData.columns);
        
        // Transform schema data to our variable format
        const variablesFromSchema = schemaData.columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          unique_values: col.unique_values || []
        }));

        console.log('Transformed variables:', variablesFromSchema);
        setVariables(variablesFromSchema);
        
      } catch (error: any) {
        console.error('Error loading dataset variables:', error);
        console.error('Error response:', error.response?.data);
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

  const isCardComplete = (cardNumber: number): boolean => {
    switch (cardNumber) {
      case 1: return !!selection.outcome;
      case 2: return !!selection.treatment && !!selection.treatment_value;
      case 3: return !!selection.time && !!selection.treatment_start;
      case 4: return !!selection.unit;
      case 5: return true; // Optional card
      default: return false;
    }
  };

  const canProceed = isCardComplete(1) && isCardComplete(2) && isCardComplete(3) && isCardComplete(4);

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

        <div style={styles.mainContent}>
          <div style={styles.cardsContainer}>
            {/* Card 1: Outcome Variable */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>1</div>
                <div style={styles.cardTitle}>Select Your Outcome Variable</div>
                <div style={styles.requiredBadge}>Required</div>
              </div>
              <p style={styles.helperText}>
                What are you trying to measure the effect on? Choose the column that represents your main outcome.
              </p>
              <select
                value={selection.outcome}
                onChange={(e) => handleVariableChange('outcome', e.target.value)}
                style={styles.select}
              >
                <option value="">Select outcome column...</option>
                {variables.filter(v => v.type === 'numeric').map(variable => (
                  <option key={variable.name} value={variable.name}>
                    {variable.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Card 2: Treatment Variable */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>2</div>
                <div style={styles.cardTitle}>Define Your Treatment</div>
                <div style={styles.requiredBadge}>Required</div>
              </div>
              <p style={styles.helperText}>
                How do you identify your treated and control groups? Select the column where units are marked as belonging to the treatment group or the control group.
              </p>
              <select
                value={selection.treatment}
                onChange={(e) => {
                  handleVariableChange('treatment', e.target.value);
                  handleVariableChange('treatment_value', ''); // Reset treatment value
                }}
                style={styles.select}
              >
                <option value="">Select treatment column...</option>
                {variables.filter(v => v.type === 'boolean' || v.type === 'categorical').map(variable => (
                  <option key={variable.name} value={variable.name}>
                    {variable.name}
                  </option>
                ))}
              </select>
              
              {selection.treatment && variables.find(v => v.name === selection.treatment)?.unique_values && (
                <div style={styles.conditionalSection}>
                  <p style={styles.conditionalText}>
                    We see {variables.find(v => v.name === selection.treatment)?.unique_values?.join(' and ')}. 
                    Which value means 'Treated'?
                  </p>
                  <select
                    value={selection.treatment_value}
                    onChange={(e) => handleVariableChange('treatment_value', e.target.value)}
                    style={styles.select}
                  >
                    <option value="">Select treated value...</option>
                    {variables.find(v => v.name === selection.treatment)?.unique_values?.map(value => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Card 3: Time Variable */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>3</div>
                <div style={styles.cardTitle}>Define Your Time Variable</div>
                <div style={styles.requiredBadge}>Required</div>
              </div>
              <p style={styles.helperText}>
                Which column represents the time? Select the column that shows when each observation was recorded.
              </p>
              <select
                value={selection.time}
                onChange={(e) => {
                  handleVariableChange('time', e.target.value);
                  handleVariableChange('treatment_start', '');
                }}
                style={styles.select}
              >
                <option value="">Select time column...</option>
                {variables.filter(v => v.type === 'numeric' || v.type === 'date').map(variable => (
                  <option key={variable.name} value={variable.name}>
                    {variable.name}
                  </option>
                ))}
              </select>
              
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
                    <select
                      value={selection.treatment_start}
                      onChange={(e) => handleVariableChange('treatment_start', e.target.value)}
                      style={styles.select}
                    >
                      <option value="">Select treatment start date...</option>
                      {variables.find(v => v.name === selection.time)?.unique_values?.map(value => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Card 4: Unit Identifier */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>4</div>
                <div style={styles.cardTitle}>Define Your Unit Identifier</div>
                <div style={styles.requiredBadge}>Required</div>
              </div>
              <p style={styles.helperText}>
                Which column identifies your individuals or groups? Select the column that uniquely identifies each unit being tracked over time.
              </p>
              <select
                value={selection.unit}
                onChange={(e) => handleVariableChange('unit', e.target.value)}
                style={styles.select}
              >
                <option value="">Select unit column...</option>
                {variables.filter(v => v.type === 'string' || v.type === 'numeric').map(variable => (
                  <option key={variable.name} value={variable.name}>
                    {variable.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Card 5: Control Variables */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardNumber}>5</div>
                <div style={styles.cardTitle}>Select Control Variables</div>
                <div style={styles.optionalBadge}>Optional</div>
              </div>
              <p style={styles.helperText}>
                Are there other variables you need to control for? Select any columns that might also influence your outcome.
              </p>
              <div style={styles.multiSelectContainer}>
                {variables.filter(v => v.name !== selection.outcome && v.name !== selection.treatment && v.name !== selection.time && v.name !== selection.unit).map(variable => (
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
      </div>

      {/* Bottom Progress Bar */}
      <BottomProgressBar
        currentStep={currentStep}
        steps={steps}
        onPrev={goToPreviousStep}
        onNext={goToNextStep}
        canGoNext={canProceed}
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
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '0 20px'
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
    color: '#666',
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
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
    marginBottom: '5px'
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
  }
};
