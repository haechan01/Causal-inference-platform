import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface Dataset {
  id: number;
  name: string;
  file_name: string;
  created_at: string;
}

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (title: string, description: string, datasetId?: number) => void;
  preSelectedDatasetId?: number | null;
}

const NewProjectModal: React.FC<NewProjectModalProps> = ({ 
  isOpen, 
  onClose, 
  onCreateProject,
  preSelectedDatasetId 
}) => {
  const { accessToken } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);

  const loadDatasets = useCallback(async () => {
    setLoadingDatasets(true);
    try {
      const response = await axios.get('/projects/user/datasets', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setDatasets(response.data.datasets || []);
    } catch (error) {
      console.error('Failed to load datasets:', error);
    } finally {
      setLoadingDatasets(false);
    }
  }, [accessToken]);

  // Load user's datasets when modal opens
  useEffect(() => {
    if (isOpen && accessToken) {
      loadDatasets();
    }
  }, [isOpen, accessToken, loadDatasets]);

  // Set pre-selected dataset when provided
  useEffect(() => {
    if (preSelectedDatasetId) {
      setSelectedDatasetId(preSelectedDatasetId);
    }
  }, [preSelectedDatasetId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreateProject(
        formData.title.trim(), 
        formData.description.trim(),
        selectedDatasetId || undefined
      );
      setFormData({ title: '', description: '' });
      setSelectedDatasetId(null);
      onClose();
    } catch (error) {
      console.error('Error creating project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({ title: '', description: '' });
    setSelectedDatasetId(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Create New Project</h2>
          <button style={styles.closeButton} onClick={handleClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Project Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter project title"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe your project and what you want to analyze"
              style={styles.textarea}
              rows={3}
              required
            />
          </div>

          {/* Dataset Selection */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Select Dataset {preSelectedDatasetId ? <span style={styles.required}>*</span> : <span style={styles.optional}>(optional)</span>}
            </label>
            <p style={styles.helperText}>
              {preSelectedDatasetId 
                ? "Your uploaded dataset is selected. You can choose a different one if needed."
                : "Link a dataset to this project for analysis"
              }
            </p>
            
            {loadingDatasets ? (
              <div style={styles.loadingContainer}>
                <span style={styles.loadingText}>Loading datasets...</span>
              </div>
            ) : datasets.length === 0 ? (
              <div style={styles.noDatasets}>
                <span style={styles.noDataIcon}>📊</span>
                <p>No datasets available. Upload data first!</p>
              </div>
            ) : (
              <div style={styles.datasetsList}>
                {datasets.map(dataset => (
                  <div
                    key={dataset.id}
                    style={{
                      ...styles.datasetItem,
                      ...(selectedDatasetId === dataset.id ? styles.datasetItemSelected : {})
                    }}
                    onClick={() => setSelectedDatasetId(
                      selectedDatasetId === dataset.id ? null : dataset.id
                    )}
                  >
                    <div style={styles.datasetRadio}>
                      <div style={{
                        ...styles.radioOuter,
                        ...(selectedDatasetId === dataset.id ? styles.radioOuterSelected : {})
                      }}>
                        {selectedDatasetId === dataset.id && (
                          <div style={styles.radioInner}></div>
                        )}
                      </div>
                    </div>
                    <div style={styles.datasetInfo}>
                      <div style={styles.datasetName}>{dataset.name}</div>
                      <div style={styles.datasetMeta}>
                        {dataset.file_name} • {new Date(dataset.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.modalFooter}>
            <button
              type="button"
              onClick={handleClose}
              style={styles.cancelButton}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.title.trim() || !formData.description.trim()}
              style={{
                ...styles.createButton,
                ...(isSubmitting || !formData.title.trim() || !formData.description.trim() 
                  ? styles.createButtonDisabled 
                  : {})
              }}
            >
              {isSubmitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
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
    borderRadius: '16px',
    width: '90%',
    maxWidth: '550px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderBottom: '1px solid #e2e8f0'
  },
  modalTitle: {
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: 0
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '0',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    transition: 'all 0.2s'
  },
  form: {
    padding: '24px'
  },
  formGroup: {
    marginBottom: '24px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#334155',
    marginBottom: '8px'
  },
  optional: {
    fontWeight: '400',
    color: '#94a3b8'
  },
  required: {
    color: '#ef4444',
    fontWeight: '400'
  },
  helperText: {
    fontSize: '13px',
    color: '#64748b',
    margin: '0 0 12px 0'
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '15px',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
    outline: 'none'
  },
  textarea: {
    width: '100%',
    padding: '12px 16px',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '15px',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: '80px',
    transition: 'border-color 0.2s',
    outline: 'none',
    fontFamily: 'inherit'
  },
  loadingContainer: {
    padding: '20px',
    textAlign: 'center'
  },
  loadingText: {
    color: '#64748b',
    fontSize: '14px'
  },
  noDatasets: {
    padding: '24px',
    textAlign: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    border: '2px dashed #e2e8f0'
  },
  noDataIcon: {
    fontSize: '32px',
    display: 'block',
    marginBottom: '8px'
  },
  datasetsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '200px',
    overflowY: 'auto',
    padding: '4px',
    border: '1px solid #e2e8f0',
    borderRadius: '10px'
  },
  datasetItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
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
  datasetRadio: {
    flexShrink: 0
  },
  radioOuter: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#cbd5e1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  },
  radioOuterSelected: {
    borderColor: '#3b82f6'
  },
  radioInner: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6'
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
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    paddingTop: '20px',
    borderTop: '1px solid #e2e8f0',
    marginTop: '8px'
  },
  cancelButton: {
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  createButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  createButtonDisabled: {
    backgroundColor: '#94a3b8',
    cursor: 'not-allowed'
  }
};

export default NewProjectModal;
