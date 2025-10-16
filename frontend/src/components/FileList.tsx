// src/components/FileList.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface Dataset {
  id: number;
  project_id: number;
  file_name: string;
  s3_key: string;
  schema_info: any;
  file_size?: number; // Optional since it might not be in the database
}

interface FileListProps {
  projectId: number;
  onFileSelect?: (dataset: Dataset) => void;
  onFileListUpdate?: (fileCount: number) => void;
}

const FileList: React.FC<FileListProps> = ({ projectId, onFileSelect, onFileListUpdate }) => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<Dataset | null>(null);

  const { accessToken } = useAuth();

  // Load datasets from API
  const loadDatasets = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get(`/projects/${projectId}/datasets`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      setDatasets(response.data.datasets);
      // Notify parent about file count
      if (onFileListUpdate) {
        onFileListUpdate(response.data.datasets.length);
      }
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to load files');
      // Notify parent about no files on error
      if (onFileListUpdate) {
        onFileListUpdate(0);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, accessToken, onFileListUpdate]);

  // Load datasets when project changes
  useEffect(() => {
    if (projectId) {
      loadDatasets();
    }
  }, [projectId, loadDatasets]);

  // Handle file selection
  const handleFileSelect = (dataset: Dataset) => {
    setSelectedFile(dataset);
    if (onFileSelect) {
      onFileSelect(dataset);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format upload date (if available)
  // const formatDate = (dateString: string): string => {
  //   try {
  //     return new Date(dateString).toLocaleDateString();
  //   } catch {
  //     return 'Unknown';
  //   }
  // };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p>Loading files...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <p>❌ {error}</p>
          <button onClick={loadDatasets} style={styles.retryButton}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📁</div>
          <h3>No files uploaded yet</h3>
          <p>Upload your first CSV file to get started with analysis.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Uploaded Files ({datasets.length})</h3>
        <button onClick={loadDatasets} style={styles.refreshButton}>
          🔄 Refresh
        </button>
      </div>

      <div style={styles.fileList}>
        {datasets.map((dataset) => (
          <div
            key={dataset.id}
            style={{
              ...styles.fileItem,
              ...(selectedFile?.id === dataset.id ? styles.fileItemSelected : {})
            }}
            onClick={() => handleFileSelect(dataset)}
          >
            <div style={styles.fileIcon}>
              📊
            </div>
            
            <div style={styles.fileInfo}>
              <div style={styles.fileName}>
                {dataset.file_name}
              </div>
              <div style={styles.fileDetails}>
                <span style={styles.fileSize}>
                  {formatFileSize(dataset.file_size || 0)}
                </span>
                <span style={styles.fileSeparator}>•</span>
                <span style={styles.fileType}>CSV</span>
              </div>
            </div>

            <div style={styles.fileActions}>
              <button
                style={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Implement file preview or download
                  alert('File preview coming soon!');
                }}
                title="Preview file"
              >
                👁️
              </button>
              <button
                style={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Implement file analysis
                  alert('Start analysis coming soon!');
                }}
                title="Start analysis"
              >
                🔬
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedFile && (
        <div style={styles.fileDetailsPanel}>
          <h4 style={styles.detailsTitle}>File Details</h4>
          <div style={styles.detailsGrid}>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Name:</span>
              <span style={styles.detailValue}>{selectedFile.file_name}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Size:</span>
              <span style={styles.detailValue}>
                {formatFileSize(selectedFile.file_size || 0)}
              </span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Type:</span>
              <span style={styles.detailValue}>CSV</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>S3 Key:</span>
              <span style={styles.detailValue} title={selectedFile.s3_key}>
                {selectedFile.s3_key.split('/').pop()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Styles
const styles = {
  container: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#f8f9fa'
  },
  title: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    margin: 0
  },
  refreshButton: {
    backgroundColor: 'transparent',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  loading: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '40px',
    color: '#666'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #007bff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px'
  },
  error: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '40px',
    color: '#dc3545'
  },
  retryButton: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '10px 20px',
    cursor: 'pointer',
    marginTop: '10px'
  },
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '40px',
    color: '#666'
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '20px'
  },
  fileList: {
    maxHeight: '400px',
    overflowY: 'auto' as const
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '15px 20px',
    borderBottom: '1px solid #f0f0f0',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  fileItemSelected: {
    backgroundColor: '#e3f2fd',
    borderLeft: '4px solid #007bff'
  },
  fileIcon: {
    fontSize: '24px',
    marginRight: '15px'
  },
  fileInfo: {
    flex: 1,
    minWidth: 0
  },
  fileName: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#333',
    marginBottom: '4px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  fileDetails: {
    fontSize: '14px',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  fileSize: {
    fontWeight: '500'
  },
  fileSeparator: {
    color: '#ccc'
  },
  fileType: {
    backgroundColor: '#e9ecef',
    color: '#495057',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '12px',
    fontWeight: '500'
  },
  fileActions: {
    display: 'flex',
    gap: '8px'
  },
  actionButton: {
    backgroundColor: 'transparent',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '6px 8px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s'
  },
  fileDetailsPanel: {
    padding: '20px',
    borderTop: '1px solid #e0e0e0',
    backgroundColor: '#f8f9fa'
  },
  detailsTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '15px',
    marginTop: 0
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px'
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px'
  },
  detailLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#666',
    textTransform: 'uppercase' as const
  },
  detailValue: {
    fontSize: '14px',
    color: '#333',
    wordBreak: 'break-all' as const
  }
};

export default FileList;
