// src/components/DataManagement.tsx
import React, { useState } from 'react';
import FileUpload from './FileUpload';
import FileList from './FileList';

interface Dataset {
  id: number;
  project_id: number;
  file_name: string;
  s3_key: string;
  schema_info: any;
  file_size?: number; // Optional since it might not be in the database
}

interface DataManagementProps {
  onReadyForNext?: (isReady: boolean) => void;
}

const DataManagement: React.FC<DataManagementProps> = ({ onReadyForNext }) => {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<Dataset | null>(null);
  const [hasUploadedFiles, setHasUploadedFiles] = useState(false);

  // Handle project selection from FileUpload
  const handleProjectSelect = (projectId: number) => {
    setSelectedProject(projectId);
    setSelectedFile(null); // Clear selected file when project changes
  };

  // Handle file selection from FileList
  const handleFileSelect = (dataset: Dataset) => {
    setSelectedFile(dataset);
  };

  // Handle successful file upload
  const handleUploadSuccess = (uploadedFile: any) => {
    // File upload was successful, FileList will refresh automatically
    console.log('File uploaded successfully:', uploadedFile);
    setHasUploadedFiles(true);
  };

  // Handle file list updates (when files are loaded)
  const handleFileListUpdate = (fileCount: number) => {
    setHasUploadedFiles(fileCount > 0);
  };

  // Notify parent when ready for next step
  React.useEffect(() => {
    const isReady = selectedProject !== null && hasUploadedFiles;
    if (onReadyForNext) {
      onReadyForNext(isReady);
    }
  }, [selectedProject, hasUploadedFiles, onReadyForNext]);

  return (
    <div style={styles.container}>

      <div style={styles.content}>
        {/* File Upload Section */}
        <div style={styles.section}>
          <FileUpload
            onUploadSuccess={handleUploadSuccess}
            onProjectSelect={handleProjectSelect}
          />
        </div>

        {/* File List Section */}
        {selectedProject && (
          <div style={styles.section}>
            <FileList
              projectId={selectedProject}
              onFileSelect={handleFileSelect}
              onFileListUpdate={handleFileListUpdate}
            />
          </div>
        )}

        {/* Selected File Details */}
        {selectedFile && (
          <div style={styles.section}>
            <div style={styles.selectedFileCard}>
              <h3 style={styles.selectedFileTitle}>
                Selected File: {selectedFile.file_name}
              </h3>
              <div style={styles.selectedFileActions}>
                <button
                  style={styles.actionButton}
                  onClick={() => {
                    // TODO: Implement file preview
                    alert('File preview coming soon!');
                  }}
                >
                  👁️ Preview Data
                </button>
                <button
                  style={styles.actionButton}
                  onClick={() => {
                    // TODO: Implement analysis start
                    alert('Start analysis coming soon!');
                  }}
                >
                  🔬 Start Analysis
                </button>
                <button
                  style={styles.actionButton}
                  onClick={() => {
                    // TODO: Implement file download
                    alert('File download coming soon!');
                  }}
                >
                  ⬇️ Download
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// Styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px'
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '40px'
  },
  title: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '10px',
    marginTop: 0
  },
  subtitle: {
    fontSize: '18px',
    color: '#666',
    margin: 0
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '30px'
  },
  section: {
    width: '100%'
  },
  selectedFileCard: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    border: '2px solid #007bff'
  },
  selectedFileTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '15px',
    marginTop: 0
  },
  selectedFileActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap' as const
  },
  actionButton: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  guideCard: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '30px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
  },
  guideTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '25px',
    marginTop: 0,
    textAlign: 'center' as const
  },
  guideSteps: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px'
  },
  guideStep: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '20px',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef'
  },
  stepNumber: {
    width: '40px',
    height: '40px',
    backgroundColor: '#007bff',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 'bold',
    flexShrink: 0
  },
  stepContent: {
    flex: 1
  }
};

export default DataManagement;
