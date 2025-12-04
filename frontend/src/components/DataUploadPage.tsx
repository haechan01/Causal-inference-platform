// src/components/DataUploadPage.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import { aiService, DataQualityAssessment } from '../services/aiService';
import axios from 'axios';

interface ColumnInfo {
  name: string;
  type: string;
  null_count: number;
  unique_count: number;
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
  unique_values?: string[];
}

interface PreviewData {
  columns: ColumnInfo[];
  summary: {
    total_rows: number;
    total_columns: number;
    numeric_columns: number;
    categorical_columns: number;
    missing_cells: number;
    missing_percentage: number;
  };
  rows: Record<string, any>[];
}

interface UploadedDataset {
  id: number;
  name: string;
  file_name: string;
  created_at: string;
}

const DataUploadPage: React.FC = () => {
  const { currentStep, steps, goToPreviousStep } = useProgressStep();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // Preview state
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  // Uploaded dataset state
  const [uploadedDataset, setUploadedDataset] = useState<UploadedDataset | null>(null);
  
  // User's existing datasets
  const [existingDatasets, setExistingDatasets] = useState<UploadedDataset[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [selectedExistingDataset, setSelectedExistingDataset] = useState<number | null>(null);
  
  // AI Quality Check state
  const [qualityAssessment, setQualityAssessment] = useState<DataQualityAssessment | null>(null);
  const [loadingQuality, setLoadingQuality] = useState(false);
  const [qualityError, setQualityError] = useState<string | null>(null);

  // Load existing datasets
  useEffect(() => {
    const loadDatasets = async () => {
      try {
        const response = await axios.get('/projects/user/datasets', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        setExistingDatasets(response.data.datasets || []);
      } catch (error) {
        console.error('Failed to load datasets:', error);
      } finally {
        setLoadingDatasets(false);
      }
    };
    
    if (accessToken) {
      loadDatasets();
    }
  }, [accessToken]);

  // Generate preview from file
  const generateLocalPreview = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          setUploadError('File must contain at least a header row and one data row');
          return;
        }
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const dataRows = lines.slice(1, Math.min(101, lines.length)).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const row: Record<string, any> = {};
          headers.forEach((h, i) => {
            row[h] = values[i] || '';
          });
          return row;
        });
        
        // Analyze columns
        const columns: ColumnInfo[] = headers.map(header => {
          const values = dataRows.map(row => row[header]);
          const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
          const isNumeric = nonEmpty.every(v => !isNaN(parseFloat(v)));
          
          const info: ColumnInfo = {
            name: header,
            type: isNumeric ? 'numeric' : 'categorical',
            null_count: values.length - nonEmpty.length,
            unique_count: new Set(nonEmpty).size
          };
          
          if (isNumeric && nonEmpty.length > 0) {
            const nums = nonEmpty.map(v => parseFloat(v));
            info.min = Math.min(...nums);
            info.max = Math.max(...nums);
            info.mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          } else if (!isNumeric) {
            const unique = Array.from(new Set(nonEmpty));
            if (unique.length <= 10) {
              info.unique_values = unique as string[];
            }
          }
          
          return info;
        });
        
        setPreviewData({
          columns,
          summary: {
            total_rows: lines.length - 1,
            total_columns: headers.length,
            numeric_columns: columns.filter(c => c.type === 'numeric').length,
            categorical_columns: columns.filter(c => c.type === 'categorical').length,
            missing_cells: columns.reduce((sum, c) => sum + c.null_count, 0),
            missing_percentage: (columns.reduce((sum, c) => sum + c.null_count, 0) / ((lines.length - 1) * headers.length)) * 100
          },
          rows: dataRows.slice(0, 100)
        });
      } catch (error) {
        console.error('Error parsing CSV:', error);
        setUploadError('Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Only CSV files are allowed');
      return;
    }
    
    if (selectedFile.size > 10 * 1024 * 1024) {
      setUploadError('File size too large. Maximum size is 10MB');
      return;
    }
    
    setFile(selectedFile);
    setUploadError(null);
    setUploadedDataset(null);
    setSelectedExistingDataset(null);
    
    // Default dataset name to filename without extension
    if (!datasetName) {
      setDatasetName(selectedFile.name.replace('.csv', ''));
    }
    
    // Generate local preview
    generateLocalPreview(selectedFile);
  }, [datasetName, generateLocalPreview]);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  // Upload file to server
  const handleUpload = async () => {
    if (!file || !datasetName.trim()) {
      setUploadError('Please select a file and provide a dataset name');
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', datasetName.trim());
      
      const response = await axios.post('/projects/user/datasets/upload', formData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          setUploadProgress(progress);
        }
      });
      
      setUploadedDataset(response.data.dataset);
      setUploadProgress(100);
      
      // Refresh the datasets list
      const datasetsResponse = await axios.get('/projects/user/datasets', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setExistingDatasets(datasetsResponse.data.datasets || []);
      
    } catch (error: any) {
      console.error('Upload failed:', error);
      setUploadError(error.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Select existing dataset
  const handleSelectExistingDataset = async (datasetId: number) => {
    setSelectedExistingDataset(datasetId);
    setFile(null);
    setUploadedDataset(null);
    setLoadingPreview(true);
    
    try {
      const response = await axios.get(`/datasets/${datasetId}/preview`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setPreviewData(response.data);
    } catch (error) {
      console.error('Failed to load preview:', error);
      setUploadError('Failed to load dataset preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Delete dataset
  const handleDeleteDataset = async (e: React.MouseEvent, datasetId: number) => {
    e.stopPropagation();
    
    if (!window.confirm('Are you sure you want to delete this dataset? This action cannot be undone.')) {
      return;
    }
    
    try {
      await axios.delete(`/projects/user/datasets/${datasetId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      // Remove from local state
      setExistingDatasets(existingDatasets.filter(d => d.id !== datasetId));
      
      // Clear selection if deleted dataset was selected
      if (selectedExistingDataset === datasetId) {
        setSelectedExistingDataset(null);
        setPreviewData(null);
      }
    } catch (error) {
      console.error('Failed to delete dataset:', error);
      setUploadError('Failed to delete dataset');
    }
  };

  // Run AI data quality check
  const runQualityCheck = async () => {
    if (!previewData) return;
    
    setLoadingQuality(true);
    setQualityError(null);
    
    try {
      const assessment = await aiService.assessDataQuality(
        previewData.columns,
        previewData.summary
      );
      setQualityAssessment(assessment);
    } catch (error: any) {
      console.error('Quality check failed:', error);
      setQualityError(error.response?.data?.error || 'Failed to run quality check');
    } finally {
      setLoadingQuality(false);
    }
  };

  // Handle next button
  const handleNext = () => {
    const datasetId = uploadedDataset?.id || selectedExistingDataset;
    if (datasetId) {
      navigate('/projects', { 
        state: { selectedDatasetId: datasetId }
      });
    }
  };

  const canProceed = uploadedDataset || selectedExistingDataset;

  return (
    <div>
      <Navbar />
      <div style={styles.contentContainer}>
        <div style={styles.header}>
          <h1 style={styles.pageTitle}>📊 Upload Your Data</h1>
          <p style={styles.subtitle}>
            Upload a CSV file and give it a name to get started with your analysis.
          </p>
        </div>

        <div style={styles.mainContent}>
          {/* Left Section: Upload or Select */}
          <div style={styles.leftSection}>
            {/* Upload New Dataset */}
            <div style={styles.uploadCard}>
              <h3 style={styles.sectionTitle}>Upload New Dataset</h3>
              
              {/* Dataset Name Input */}
              <div style={styles.nameInputContainer}>
                <label style={styles.label}>Dataset Name</label>
                <input
                  type="text"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  placeholder="e.g., Sales Data Q4 2024"
                  style={styles.nameInput}
                  disabled={uploading}
                />
              </div>
              
              {/* Drop Zone */}
              <div
                style={{
                  ...styles.dropZone,
                  ...(isDragOver ? styles.dropZoneActive : {}),
                  ...(file ? styles.dropZoneWithFile : {})
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept=".csv"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  style={{ display: 'none' }}
                />
                
                {file ? (
                  <div style={styles.fileInfo}>
                    <div style={styles.fileIcon}>📄</div>
                    <div style={styles.fileName}>{file.name}</div>
                    <div style={styles.fileSize}>
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                    <button
                      style={styles.changeFileButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setPreviewData(null);
                      }}
                    >
                      Change File
                    </button>
                  </div>
                ) : (
                  <div style={styles.dropZoneContent}>
                    <div style={styles.uploadIcon}>📁</div>
                    <p style={styles.dropZoneText}>
                      Drag & drop your CSV file here
                    </p>
                    <p style={styles.dropZoneSubtext}>
                      or click to browse
                    </p>
                    <span style={styles.fileSizeLimit}>Max file size: 10MB</span>
                  </div>
                )}
              </div>
              
              {/* Upload Progress */}
              {uploading && (
                <div style={styles.progressContainer}>
                  <div style={styles.progressBar}>
                    <div 
                      style={{
                        ...styles.progressFill,
                        width: `${uploadProgress}%`
                      }}
                    />
                  </div>
                  <span style={styles.progressText}>{uploadProgress}%</span>
                </div>
              )}
              
              {/* Error Message */}
              {uploadError && (
                <div style={styles.errorMessage}>
                  ⚠️ {uploadError}
                </div>
              )}
              
              {/* Success Message */}
              {uploadedDataset && (
                <div style={styles.successMessage}>
                  ✅ Dataset "{uploadedDataset.name}" uploaded successfully!
                </div>
              )}
              
              {/* Upload Button */}
              {file && !uploadedDataset && (
                <button
                  style={{
                    ...styles.uploadButton,
                    ...(uploading || !datasetName.trim() ? styles.uploadButtonDisabled : {})
                  }}
                  onClick={handleUpload}
                  disabled={uploading || !datasetName.trim()}
                >
                  {uploading ? 'Uploading...' : 'Upload Dataset'}
                </button>
              )}
            </div>

            {/* Existing Datasets */}
            {existingDatasets.length > 0 && (
              <div style={styles.existingDatasetsCard}>
                <h3 style={styles.sectionTitle}>Or Select Existing Dataset</h3>
                <div style={styles.datasetsList}>
                  {loadingDatasets ? (
                    <p style={styles.loadingText}>Loading datasets...</p>
                  ) : (
                    existingDatasets.map(dataset => (
                      <div
                        key={dataset.id}
                        style={{
                          ...styles.datasetItem,
                          ...(selectedExistingDataset === dataset.id ? styles.datasetItemSelected : {})
                        }}
                        onClick={() => handleSelectExistingDataset(dataset.id)}
                      >
                        <div style={styles.datasetIcon}>📊</div>
                        <div style={styles.datasetInfo}>
                          <div style={styles.datasetName}>{dataset.name}</div>
                          <div style={styles.datasetMeta}>
                            {dataset.file_name} • {new Date(dataset.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        {selectedExistingDataset === dataset.id && (
                          <div style={styles.checkmark}>✓</div>
                        )}
                        <button
                          onClick={(e) => handleDeleteDataset(e, dataset.id)}
                          style={styles.deleteDatasetButton}
                          title="Delete dataset"
                        >
                          🗑️
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Section: Preview */}
          <div style={styles.rightSection}>
            <div style={styles.previewCard}>
              <h3 style={styles.sectionTitle}>Data Preview</h3>
              
              {loadingPreview ? (
                <div style={styles.previewPlaceholder}>
                  <div style={styles.loadingSpinner}></div>
                  <p>Loading preview...</p>
                </div>
              ) : previewData ? (
                <div style={styles.previewContent}>
                  {/* Summary Stats */}
                  <div style={styles.summaryGrid}>
                    <div style={styles.statCard}>
                      <div style={styles.statValue}>{previewData.summary.total_rows.toLocaleString()}</div>
                      <div style={styles.statLabel}>Rows</div>
                    </div>
                    <div style={styles.statCard}>
                      <div style={styles.statValue}>{previewData.summary.total_columns}</div>
                      <div style={styles.statLabel}>Columns</div>
                    </div>
                    <div style={styles.statCard}>
                      <div style={styles.statValue}>{previewData.summary.numeric_columns}</div>
                      <div style={styles.statLabel}>Numeric</div>
                    </div>
                    <div style={styles.statCard}>
                      <div style={styles.statValue}>{previewData.summary.categorical_columns}</div>
                      <div style={styles.statLabel}>Categorical</div>
                    </div>
                  </div>
                  
                  {/* Columns List */}
                  <div style={styles.columnsSection}>
                    <h4 style={styles.columnsTitle}>Columns</h4>
                    <div style={styles.columnsList}>
                      {previewData.columns.map((col, idx) => (
                        <div key={idx} style={styles.columnItem}>
                          <span style={styles.columnName}>{col.name}</span>
                          <span style={{
                            ...styles.columnType,
                            ...(col.type === 'numeric' ? styles.numericType : styles.categoricalType)
                          }}>
                            {col.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Data Table Preview */}
                  <div style={styles.tableContainer}>
                    <h4 style={styles.columnsTitle}>Sample Data (First 10 rows)</h4>
                    <div style={styles.tableWrapper}>
                      <table style={styles.dataTable}>
                        <thead>
                          <tr>
                            {previewData.columns.map((col, idx) => (
                              <th key={idx} style={styles.tableHeader}>{col.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.rows.slice(0, 10).map((row, rowIdx) => (
                            <tr key={rowIdx}>
                              {previewData.columns.map((col, colIdx) => (
                                <td key={colIdx} style={styles.tableCell}>
                                  {row[col.name]?.toString() || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  {/* AI Data Quality Check */}
                  <div style={styles.qualitySection}>
                    <div style={styles.qualityHeader}>
                      <h4 style={styles.columnsTitle}>🤖 AI Data Quality Check</h4>
                      <button
                        style={{
                          ...styles.qualityButton,
                          ...(loadingQuality ? styles.qualityButtonDisabled : {})
                        }}
                        onClick={runQualityCheck}
                        disabled={loadingQuality}
                      >
                        {loadingQuality ? 'Analyzing...' : qualityAssessment ? 'Re-analyze' : 'Run Quality Check'}
                      </button>
                    </div>
                    
                    {qualityError && (
                      <div style={styles.qualityError}>⚠️ {qualityError}</div>
                    )}
                    
                    {qualityAssessment && (
                      <div style={styles.qualityResults}>
                        {/* Score and Status */}
                        <div style={styles.qualityScoreRow}>
                          <div style={{
                            ...styles.qualityScore,
                            backgroundColor: qualityAssessment.quality_level === 'good' ? '#22c55e' :
                                           qualityAssessment.quality_level === 'fair' ? '#f59e0b' : '#ef4444'
                          }}>
                            <span style={styles.scoreNumber}>{qualityAssessment.overall_score}</span>
                            <span style={styles.scoreLabel}>/ 100</span>
                          </div>
                          <div style={styles.qualityStatus}>
                            <div style={{
                              ...styles.readinessBadge,
                              backgroundColor: qualityAssessment.causal_analysis_readiness === 'ready' ? '#dcfce7' :
                                             qualityAssessment.causal_analysis_readiness === 'needs_work' ? '#fef3c7' : '#fee2e2',
                              color: qualityAssessment.causal_analysis_readiness === 'ready' ? '#166534' :
                                    qualityAssessment.causal_analysis_readiness === 'needs_work' ? '#92400e' : '#991b1b'
                            }}>
                              {qualityAssessment.causal_analysis_readiness === 'ready' ? '✓ Ready for Analysis' :
                               qualityAssessment.causal_analysis_readiness === 'needs_work' ? '⚠ Needs Work' : '✗ Not Suitable'}
                            </div>
                            <p style={styles.qualitySummary}>{qualityAssessment.summary}</p>
                          </div>
                        </div>
                        
                        {/* Issues */}
                        {qualityAssessment.issues.length > 0 && (
                          <div style={styles.qualityBlock}>
                            <h5 style={styles.qualityBlockTitle}>⚠️ Issues Found</h5>
                            {qualityAssessment.issues.map((issue, idx) => (
                              <div key={idx} style={{
                                ...styles.issueItem,
                                borderLeftColor: issue.severity === 'high' ? '#ef4444' :
                                               issue.severity === 'medium' ? '#f59e0b' : '#3b82f6'
                              }}>
                                <div style={styles.issueSeverity}>
                                  {issue.severity.toUpperCase()}
                                  {issue.column && <span style={styles.issueColumn}>• {issue.column}</span>}
                                </div>
                                <div style={styles.issueText}>{issue.issue}</div>
                                <div style={styles.issueRec}>💡 {issue.recommendation}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Strengths */}
                        {qualityAssessment.strengths.length > 0 && (
                          <div style={styles.qualityBlock}>
                            <h5 style={styles.qualityBlockTitle}>✓ Strengths</h5>
                            <ul style={styles.strengthsList}>
                              {qualityAssessment.strengths.map((s, idx) => (
                                <li key={idx}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Potential Variables */}
                        {qualityAssessment.potential_variables && Object.keys(qualityAssessment.potential_variables).length > 0 && (
                          <div style={styles.qualityBlock}>
                            <h5 style={styles.qualityBlockTitle}>📊 Suggested Variable Roles</h5>
                            <div style={styles.variableSuggestions}>
                              {qualityAssessment.potential_variables.outcome_candidates && qualityAssessment.potential_variables.outcome_candidates.length > 0 && (
                                <div style={styles.variableGroup}>
                                  <span style={styles.variableLabel}>Outcome:</span>
                                  {qualityAssessment.potential_variables.outcome_candidates.map((v, i) => (
                                    <span key={i} style={styles.variableChip}>{v}</span>
                                  ))}
                                </div>
                              )}
                              {qualityAssessment.potential_variables.treatment_candidates && qualityAssessment.potential_variables.treatment_candidates.length > 0 && (
                                <div style={styles.variableGroup}>
                                  <span style={styles.variableLabel}>Treatment:</span>
                                  {qualityAssessment.potential_variables.treatment_candidates.map((v, i) => (
                                    <span key={i} style={styles.variableChip}>{v}</span>
                                  ))}
                                </div>
                              )}
                              {qualityAssessment.potential_variables.time_candidates && qualityAssessment.potential_variables.time_candidates.length > 0 && (
                                <div style={styles.variableGroup}>
                                  <span style={styles.variableLabel}>Time:</span>
                                  {qualityAssessment.potential_variables.time_candidates.map((v, i) => (
                                    <span key={i} style={styles.variableChip}>{v}</span>
                                  ))}
                                </div>
                              )}
                              {qualityAssessment.potential_variables.group_candidates && qualityAssessment.potential_variables.group_candidates.length > 0 && (
                                <div style={styles.variableGroup}>
                                  <span style={styles.variableLabel}>Group:</span>
                                  {qualityAssessment.potential_variables.group_candidates.map((v, i) => (
                                    <span key={i} style={styles.variableChip}>{v}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!qualityAssessment && !loadingQuality && (
                      <p style={styles.qualityHint}>
                        Run the AI quality check to get insights about your data's readiness for causal analysis.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div style={styles.previewPlaceholder}>
                  <div style={styles.previewIcon}>👀</div>
                  <p style={styles.previewPlaceholderText}>
                    Upload or select a dataset to see a preview
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <BottomProgressBar
        currentStep={currentStep}
        steps={steps}
        onPrev={goToPreviousStep}
        onNext={handleNext}
        canGoNext={!!canProceed}
        onStepClick={(path) => navigate(path)}
      />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '100px',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f8fafc'
  },
  header: {
    textAlign: 'center',
    padding: '40px 20px 20px',
    maxWidth: '800px',
    margin: '0 auto'
  },
  pageTitle: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: '0 0 12px 0'
  },
  subtitle: {
    fontSize: '16px',
    color: '#64748b',
    margin: '0 0 20px 0',
    lineHeight: '1.6'
  },
  mainContent: {
    display: 'grid',
    gridTemplateColumns: '400px 1fr',
    gap: '30px',
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px 40px'
  },
  leftSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  rightSection: {
    minWidth: 0
  },
  uploadCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)'
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 20px 0'
  },
  nameInputContainer: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#475569',
    marginBottom: '8px'
  },
  nameInput: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box'
  },
  dropZone: {
    border: '2px dashed #cbd5e1',
    borderRadius: '12px',
    padding: '40px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: '#f8fafc'
  },
  dropZoneActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff'
  },
  dropZoneWithFile: {
    borderStyle: 'solid',
    borderColor: '#22c55e',
    backgroundColor: '#f0fdf4'
  },
  dropZoneContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  },
  uploadIcon: {
    fontSize: '48px',
    marginBottom: '8px'
  },
  dropZoneText: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#475569',
    margin: 0
  },
  dropZoneSubtext: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: 0
  },
  fileSizeLimit: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '8px'
  },
  fileInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  },
  fileIcon: {
    fontSize: '40px'
  },
  fileName: {
    fontSize: '15px',
    fontWeight: '500',
    color: '#1e293b'
  },
  fileSize: {
    fontSize: '13px',
    color: '#64748b'
  },
  changeFileButton: {
    marginTop: '8px',
    padding: '6px 12px',
    fontSize: '13px',
    color: '#3b82f6',
    backgroundColor: 'transparent',
    border: '1px solid #3b82f6',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '16px'
  },
  progressBar: {
    flex: 1,
    height: '8px',
    backgroundColor: '#e2e8f0',
    borderRadius: '4px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    transition: 'width 0.3s ease'
  },
  progressText: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#3b82f6',
    minWidth: '40px'
  },
  errorMessage: {
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    color: '#dc2626',
    fontSize: '14px'
  },
  successMessage: {
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '8px',
    color: '#16a34a',
    fontSize: '14px'
  },
  uploadButton: {
    width: '100%',
    marginTop: '20px',
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  uploadButtonDisabled: {
    backgroundColor: '#94a3b8',
    cursor: 'not-allowed'
  },
  existingDatasetsCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)'
  },
  datasetsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '300px',
    overflowY: 'auto'
  },
  loadingText: {
    color: '#64748b',
    fontSize: '14px',
    textAlign: 'center',
    padding: '20px'
  },
  datasetItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px',
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'transparent'
  },
  datasetItemSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6'
  },
  datasetIcon: {
    fontSize: '24px'
  },
  datasetInfo: {
    flex: 1,
    minWidth: 0
  },
  datasetName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1e293b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  datasetMeta: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '2px'
  },
  checkmark: {
    fontSize: '18px',
    color: '#3b82f6',
    fontWeight: 'bold'
  },
  deleteDatasetButton: {
    backgroundColor: '#fee2e2',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginLeft: '8px'
  },
  previewCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
    height: 'fit-content'
  },
  previewPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    color: '#94a3b8'
  },
  previewIcon: {
    fontSize: '64px',
    marginBottom: '16px',
    opacity: 0.5
  },
  previewPlaceholderText: {
    fontSize: '16px',
    margin: 0
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #e2e8f0',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px'
  },
  previewContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px'
  },
  statCard: {
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    padding: '16px',
    textAlign: 'center'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1e293b'
  },
  statLabel: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  columnsSection: {
    borderTop: '1px solid #e2e8f0',
    paddingTop: '20px'
  },
  columnsTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#475569',
    margin: '0 0 12px 0'
  },
  columnsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  columnItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#f1f5f9',
    borderRadius: '6px'
  },
  columnName: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#334155'
  },
  columnType: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: '500'
  },
  numericType: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8'
  },
  categoricalType: {
    backgroundColor: '#fef3c7',
    color: '#b45309'
  },
  tableContainer: {
    borderTop: '1px solid #e2e8f0',
    paddingTop: '20px'
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: '8px',
    border: '1px solid #e2e8f0'
  },
  dataTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
    padding: '12px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#475569',
    borderBottom: '1px solid #e2e8f0',
    whiteSpace: 'nowrap'
  },
  tableCell: {
    padding: '10px 12px',
    borderBottom: '1px solid #f1f5f9',
    color: '#334155',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  // AI Quality Check Styles
  qualitySection: {
    borderTop: '1px solid #e2e8f0',
    paddingTop: '24px',
    marginTop: '8px'
  },
  qualityHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  qualityButton: {
    backgroundColor: '#8b5cf6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  qualityButtonDisabled: {
    backgroundColor: '#a5b4fc',
    cursor: 'not-allowed'
  },
  qualityError: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px',
    color: '#dc2626',
    fontSize: '14px',
    marginBottom: '16px'
  },
  qualityResults: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px'
  },
  qualityScoreRow: {
    display: 'flex',
    gap: '20px',
    alignItems: 'flex-start'
  },
  qualityScore: {
    width: '80px',
    height: '80px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  scoreNumber: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: 'white'
  },
  scoreLabel: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.8)'
  },
  qualityStatus: {
    flex: 1
  },
  readinessBadge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: '16px',
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '8px'
  },
  qualitySummary: {
    fontSize: '14px',
    color: '#475569',
    lineHeight: '1.6',
    margin: 0
  },
  qualityBlock: {
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    padding: '16px'
  },
  qualityBlockTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#334155',
    margin: '0 0 12px 0'
  },
  issueItem: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
    borderLeft: '4px solid',
    borderLeftColor: '#ef4444'
  },
  issueSeverity: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#64748b',
    marginBottom: '4px',
    textTransform: 'uppercase' as const
  },
  issueColumn: {
    fontWeight: '500',
    marginLeft: '8px'
  },
  issueText: {
    fontSize: '14px',
    color: '#1e293b',
    marginBottom: '6px'
  },
  issueRec: {
    fontSize: '13px',
    color: '#64748b',
    fontStyle: 'italic'
  },
  strengthsList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '14px',
    color: '#334155',
    lineHeight: '1.8'
  },
  variableSuggestions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px'
  },
  variableGroup: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '8px'
  },
  variableLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#475569',
    minWidth: '80px'
  },
  variableChip: {
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500'
  },
  qualityHint: {
    fontSize: '14px',
    color: '#64748b',
    textAlign: 'center' as const,
    padding: '20px',
    margin: 0
  }
};

export default DataUploadPage;

