// src/components/EditProjectModal.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface Dataset {
  id: number;
  name: string;
  file_name: string;
  created_at: string;
}

interface Project {
  id: number;
  title: string;
  description: string;
  created_at: string;
  dataset_count: number;
  datasets?: Dataset[];
}

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  project: Project;
}

const EditProjectModal: React.FC<EditProjectModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  project 
}) => {
  const { accessToken } = useAuth();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(
    project.datasets && project.datasets.length > 0 ? project.datasets[0].id : null
  );
  const [availableDatasets, setAvailableDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load available datasets when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle(project.title);
      setDescription(project.description);
      setSelectedDatasetId(
        project.datasets && project.datasets.length > 0 ? project.datasets[0].id : null
      );
      loadAvailableDatasets();
    }
  }, [isOpen, project]);

  const loadAvailableDatasets = async () => {
    try {
      setLoadingDatasets(true);
      const response = await axios.get('/projects/user/datasets', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setAvailableDatasets(response.data.datasets || []);
    } catch (err) {
      console.error('Failed to load datasets:', err);
    } finally {
      setLoadingDatasets(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await axios.put(`/projects/${project.id}`, {
        name: title,
        description,
        dataset_id: selectedDatasetId
      }, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update project');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Edit Project</h2>
          <button style={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.field}>
            <label style={styles.label}>Project Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={styles.input}
              placeholder="Enter project title"
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={styles.textarea}
              placeholder="Enter project description"
              rows={3}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Linked Dataset</label>
            {loadingDatasets ? (
              <div style={styles.loadingText}>Loading datasets...</div>
            ) : availableDatasets.length === 0 ? (
              <div style={styles.noDatasets}>No datasets available. Upload one first.</div>
            ) : (
              <select
                value={selectedDatasetId || ''}
                onChange={(e) => setSelectedDatasetId(e.target.value ? Number(e.target.value) : null)}
                style={styles.select}
              >
                <option value="">No dataset linked</option>
                {availableDatasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name} ({dataset.file_name})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={styles.actions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.cancelButton}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                ...styles.saveButton,
                ...(loading ? styles.saveButtonDisabled : {})
              }}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Changes'}
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
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 24px 0',
    borderBottom: 'none'
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1e293b',
    margin: 0
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#64748b',
    padding: '0',
    lineHeight: 1
  },
  form: {
    padding: '24px'
  },
  field: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '8px'
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box'
  },
  textarea: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    outline: 'none',
    backgroundColor: 'white',
    cursor: 'pointer',
    boxSizing: 'border-box'
  },
  loadingText: {
    color: '#64748b',
    fontSize: '14px',
    padding: '12px 0'
  },
  noDatasets: {
    color: '#94a3b8',
    fontSize: '14px',
    padding: '12px 0',
    fontStyle: 'italic'
  },
  error: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#dc2626',
    fontSize: '14px',
    marginBottom: '20px'
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px'
  },
  cancelButton: {
    flex: 1,
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  saveButton: {
    flex: 1,
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: '600',
    color: 'white',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  saveButtonDisabled: {
    backgroundColor: '#94a3b8',
    cursor: 'not-allowed'
  }
};

export default EditProjectModal;

