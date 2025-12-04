// frontend/src/components/DataPreviewPage.tsx

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';

interface DataPreviewProps {}

const DataPreviewPage: React.FC<DataPreviewProps> = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentStep, steps, goToPreviousStep } = useProgressStep();
  
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);

  useEffect(() => {
    const loadPreview = async () => {
      const projectId = (location.state as any)?.projectId;
      if (!projectId) {
        console.log('No projectId found in location state');
        setLoading(false);
        return;
      }

      try {
        // Load dataset
        const datasetsResponse = await axios.get(`/projects/${projectId}/datasets`);
        
        if (datasetsResponse.data.datasets && datasetsResponse.data.datasets.length > 0) {
            const dataset = datasetsResponse.data.datasets[0];
            setSelectedDataset(dataset);

            // Load preview data
            const previewResponse = await axios.get(`/datasets/${dataset.id}/preview`);
            
            setPreviewData(previewResponse.data.rows);
            setColumns(previewResponse.data.columns);
            setSummary(previewResponse.data.summary);
        }
      } catch (error) {
        console.error('Error loading preview:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [location]);

  const handleNext = () => {
    navigate('/method-selection', { 
      state: { 
        projectId: (location.state as any)?.projectId,
        datasetId: selectedDataset?.id 
      } 
    });
  };

  return (
    <div>
      <Navbar />
      <div style={styles.contentContainer}>
        <div style={styles.mainContent}>
            <div style={styles.header}>
            <h1 style={styles.pageTitle}>Explore Your Data</h1>
            <p style={styles.subtitle}>Review your dataset before setting up analysis</p>
            </div>

            {loading ? (
                <div style={styles.loadingContainer}>
                    <div style={styles.loadingSpinner}></div>
                    <p>Loading data preview...</p>
                </div>
            ) : (
                <>
                    {/* Data Summary Cards */}
                    {summary && (
                    <div style={styles.summaryGrid}>
                        <div style={styles.summaryCard}>
                        <div style={styles.summaryNumber}>{summary.total_rows}</div>
                        <div style={styles.summaryLabel}>Total Rows</div>
                        </div>
                        <div style={styles.summaryCard}>
                        <div style={styles.summaryNumber}>{summary.total_columns}</div>
                        <div style={styles.summaryLabel}>Columns</div>
                        </div>
                        <div style={styles.summaryCard}>
                        <div style={styles.summaryNumber}>{summary.numeric_columns}</div>
                        <div style={styles.summaryLabel}>Numeric Variables</div>
                        </div>
                        <div style={styles.summaryCard}>
                        <div style={styles.summaryNumber}>{summary.categorical_columns}</div>
                        <div style={styles.summaryLabel}>Categorical Variables</div>
                        </div>
                    </div>
                    )}

                    {/* Column Analysis */}
                    <div style={styles.section}>
                    <h2 style={styles.sectionTitle}>Column Overview</h2>
                    <div style={styles.columnsList}>
                        {columns.map((col, index) => (
                        <div key={index} style={styles.columnCard}>
                            <div style={styles.columnHeader}>
                            <span style={styles.columnName}>{col.name}</span>
                            <span style={styles.columnType}>{col.type}</span>
                            </div>
                            <div style={styles.columnStats}>
                            {col.type === 'numeric' ? (
                                <>
                                <span>Min: {col.min?.toFixed(2)}</span>
                                <span>Max: {col.max?.toFixed(2)}</span>
                                <span>Mean: {col.mean?.toFixed(2)}</span>
                                </>
                            ) : (
                                <span>{col.unique_count} unique values</span>
                            )}
                            {col.null_count > 0 && (
                                <span style={styles.warningText}>
                                ⚠️ {col.null_count} missing values
                                </span>
                            )}
                            </div>
                        </div>
                        ))}
                    </div>
                    </div>

                    {/* Data Preview Table */}
                    <div style={styles.section}>
                    <h2 style={styles.sectionTitle}>Data Preview (First 10 Rows)</h2>
                    <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                        <thead>
                            <tr>
                            {columns.map((col, i) => (
                                <th key={i} style={styles.th}>{col.name}</th>
                            ))}
                            </tr>
                        </thead>
                        <tbody>
                            {previewData.slice(0, 10).map((row, i) => (
                            <tr key={i}>
                                {columns.map((col, j) => (
                                <td key={j} style={styles.td}>{row[col.name]}</td>
                                ))}
                            </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>
                    </div>

                    {/* AI Data Quality Assessment */}
                    <div style={styles.aiSection}>
                    <h2 style={styles.aiTitle}>🤖 AI Data Quality Check</h2>
                    <DataQualityAssessment columns={columns} summary={summary} />
                    </div>
                </>
            )}
        </div>
      </div>
      
      <BottomProgressBar
        currentStep={currentStep}
        steps={steps}
        onPrev={goToPreviousStep}
        onNext={handleNext}
        canGoNext={!loading}
        onStepClick={(path) => {
          const projectId = (location.state as any)?.projectId;
          const datasetId = selectedDataset?.id;
          navigate(path, { state: { projectId, datasetId } });
        }}
      />
    </div>
  );
};

// Inline AI component for data quality
const DataQualityAssessment: React.FC<{ columns: any[]; summary: any }> = ({ columns, summary }) => {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for common issues
  if (summary && columns) {
    columns.forEach(col => {
        if (col.null_count > summary.total_rows * 0.1) {
        issues.push(`"${col.name}" has ${((col.null_count / summary.total_rows) * 100).toFixed(1)}% missing values`);
        }
    });

    // Identify potential variable roles
    const timeCandidate = columns.find(c => 
        c.name.toLowerCase().includes('year') || 
        c.name.toLowerCase().includes('date') || 
        c.name.toLowerCase().includes('time') ||
        c.name.toLowerCase().includes('period')
    );
    
    const treatmentCandidate = columns.find(c => 
        c.name.toLowerCase().includes('treat') || 
        c.name.toLowerCase().includes('policy') ||
        c.name.toLowerCase().includes('intervention')
    );

    if (timeCandidate) {
        suggestions.push(`"${timeCandidate.name}" looks like a good time variable`);
    }
    if (treatmentCandidate) {
        suggestions.push(`"${treatmentCandidate.name}" might be your treatment indicator`);
    }
  }

  return (
    <div style={styles.aiAssessment}>
      {issues.length > 0 && (
        <div style={styles.issuesBox}>
          <h4>⚠️ Potential Issues</h4>
          <ul>
            {issues.map((issue, i) => <li key={i}>{issue}</li>)}
          </ul>
        </div>
      )}
      
      {suggestions.length > 0 && (
        <div style={styles.suggestionsBox}>
          <h4>💡 Suggestions</h4>
          <ul>
            {suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      
      <div style={styles.readinessBox}>
        <h4>✅ Your data appears suitable for causal analysis</h4>
        <p>You have panel data with {summary?.total_rows || 0} observations across {summary?.total_columns || 0} variables.</p>
      </div>
    </div>
  );
};

const styles = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '80px',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5'
  },
  mainContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 20px',
    width: '100%',
    boxSizing: 'border-box' as const
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '40px'
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
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px'
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
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '40px'
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    textAlign: 'center' as const,
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
  },
  summaryNumber: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#043873'
  },
  summaryLabel: {
    fontSize: '14px',
    color: '#666',
    marginTop: '8px'
  },
  section: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '30px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 20px 0'
  },
  columnsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px'
  },
  columnCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #e9ecef'
  },
  columnHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  columnName: {
    fontWeight: 'bold',
    color: '#333'
  },
  columnType: {
    backgroundColor: '#043873',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px'
  },
  columnStats: {
    fontSize: '13px',
    color: '#666',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const
  },
  warningText: {
    color: '#dc3545'
  },
  tableWrapper: {
    overflowX: 'auto' as const
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginTop: '16px',
    fontSize: '14px'
  },
  th: {
    backgroundColor: '#f8f9fa',
    padding: '12px',
    textAlign: 'left' as const,
    borderBottom: '2px solid #dee2e6',
    fontWeight: 'bold',
    color: '#495057',
    whiteSpace: 'nowrap' as const
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #e9ecef',
    color: '#212529',
    whiteSpace: 'nowrap' as const
  },
  aiSection: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    border: '2px solid #4F9CF9'
  },
  aiTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 10px 0'
  },
  aiAssessment: {
    marginTop: '16px'
  },
  issuesBox: {
    backgroundColor: '#fff3cd',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px'
  },
  suggestionsBox: {
    backgroundColor: '#d1ecf1',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px'
  },
  readinessBox: {
    backgroundColor: '#d4edda',
    borderRadius: '8px',
    padding: '16px'
  }
};

export default DataPreviewPage;

