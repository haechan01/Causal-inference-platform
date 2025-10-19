import React, { useState, useCallback } from 'react';
import axios from 'axios';

interface UploadDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (uploadedFile: any) => void;
  projectId: number;
}

const UploadDataModal: React.FC<UploadDataModalProps> = ({ 
  isOpen, 
  onClose, 
  onUploadSuccess, 
  projectId 
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [projectId]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [projectId]);

  const handleFileUpload = async (file: File) => {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size too large. Maximum size is 10MB');
      return;
    }

    setError(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`/projects/${projectId}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      onUploadSuccess(response.data);
      onClose();
    } catch (error: any) {
      setError(error.response?.data?.error || error.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    setError(null);
    setUploading(false);
    setUploadProgress(0);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Upload Data</h2>
          <button style={styles.closeButton} onClick={handleClose}>
            ×
          </button>
        </div>

        <div style={styles.modalContent}>
          <div
            style={{
              ...styles.dropZone,
              ...(isDragOver ? styles.dropZoneActive : {}),
              ...(uploading ? styles.dropZoneDisabled : {})
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div style={styles.uploadingContent}>
                <div style={styles.spinner}></div>
                <p style={styles.uploadingText}>Uploading... {uploadProgress}%</p>
              </div>
            ) : (
              <div style={styles.dropZoneContent}>
                <div style={styles.dropIcon}>📁</div>
                <p style={styles.dropText}>
                  Drag and drop your CSV file here, or click to select
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  style={styles.fileInput}
                  disabled={uploading}
                />
                <p style={styles.fileInfo}>
                  Only CSV files up to 10MB are allowed
                </p>
              </div>
            )}
          </div>

          {error && (
            <div style={styles.errorMessage}>
              ❌ {error}
            </div>
          )}
        </div>

        <div style={styles.modalFooter}>
          <button
            onClick={handleClose}
            style={styles.cancelButton}
            disabled={uploading}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e0e0e0'
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    margin: 0
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#666',
    padding: '0',
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalContent: {
    padding: '20px'
  },
  dropZone: {
    border: '2px dashed #ccc',
    borderRadius: '8px',
    padding: '40px 20px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    position: 'relative' as const
  },
  dropZoneActive: {
    borderColor: '#043873',
    backgroundColor: '#f0f8ff'
  },
  dropZoneDisabled: {
    cursor: 'not-allowed',
    opacity: 0.6
  },
  dropZoneContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '10px'
  },
  dropIcon: {
    fontSize: '48px',
    marginBottom: '10px'
  },
  dropText: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 10px 0'
  },
  fileInput: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer'
  },
  fileInfo: {
    fontSize: '12px',
    color: '#999',
    margin: 0
  },
  uploadingContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '15px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  uploadingText: {
    fontSize: '16px',
    color: '#043873',
    margin: 0
  },
  errorMessage: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '10px',
    borderRadius: '6px',
    marginTop: '15px',
    fontSize: '14px'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '20px',
    borderTop: '1px solid #e0e0e0'
  },
  cancelButton: {
    backgroundColor: 'transparent',
    color: '#666',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  }
};

export default UploadDataModal;
