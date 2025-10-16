// src/components/FileUpload.tsx
import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface Project {
  id: number;
  name: string;
  description: string;
  datasets_count: number;
  analyses_count: number;
}

interface UploadedFile {
  dataset_id: number;
  file_name: string;
  file_size?: number; // Optional since it might not be in the database
  s3_key: string;
}

interface FileUploadProps {
  onUploadSuccess?: (file: UploadedFile) => void;
  onProjectSelect?: (projectId: number) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUploadSuccess, onProjectSelect }) => {
  // State management
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  const { accessToken } = useAuth();

  // Load projects from API
  const loadProjects = React.useCallback(async () => {
    try {
      const response = await axios.get('/projects', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setProjects(response.data.projects);
    } catch (error: any) {
      console.error('Failed to load projects:', error);
    }
  }, [accessToken]);

  // Load projects on component mount
  React.useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Create new project
  const createProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      const response = await axios.post('/projects', {
        name: newProjectName,
        description: newProjectDescription
      }, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const newProject = response.data.project;
      setProjects(prev => [...prev, newProject]);
      setSelectedProject(newProject);
      if (onProjectSelect) {
        onProjectSelect(newProject.id);
      }
      setShowNewProjectForm(false);
      setNewProjectName('');
      setNewProjectDescription('');
    } catch (error: any) {
      console.error('Failed to create project:', error);
    }
  };

  // Upload file to S3
  const handleFileUpload = React.useCallback(async (file: File) => {
    if (!selectedProject) {
      setUploadError('Please select a project first');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Please select a CSV file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setUploadError('File size too large. Maximum size is 10MB');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(
        `/projects/${selectedProject.id}/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            setUploadProgress(progress);
          }
        }
      );

      setUploadSuccess(`File "${file.name}" uploaded successfully!`);
      setUploadProgress(100);
      
      // Refresh projects to update dataset count
      await loadProjects();
      
      // Call success callback
      if (onUploadSuccess) {
        onUploadSuccess(response.data);
      }

    } catch (error: any) {
      setUploadError(error.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [selectedProject, accessToken, onUploadSuccess, loadProjects]);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => file.name.toLowerCase().endsWith('.csv'));
    
    if (csvFile) {
      handleFileUpload(csvFile);
    } else {
      setUploadError('Please select a CSV file');
    }
  }, [handleFileUpload]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // Drag event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Upload CSV File</h2>
      
      {/* Project Selection */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Select Project</h3>
        
        {projects.length === 0 ? (
          <div style={styles.noProjects}>
            <p>No projects found. Create your first project to get started!</p>
            <button
              onClick={() => setShowNewProjectForm(true)}
              style={styles.createButton}
            >
              Create Project
            </button>
          </div>
        ) : (
          <div style={styles.projectSelector}>
            <select
              value={selectedProject?.id || ''}
              onChange={(e) => {
                const project = projects.find(p => p.id === parseInt(e.target.value));
                setSelectedProject(project || null);
                if (project && onProjectSelect) {
                  onProjectSelect(project.id);
                }
              }}
              style={styles.select}
            >
              <option value="">Select a project...</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.datasets_count} files)
                </option>
              ))}
            </select>
            
            <button
              onClick={() => setShowNewProjectForm(true)}
              style={styles.addButton}
            >
              + New Project
            </button>
          </div>
        )}
      </div>

      {/* New Project Form */}
      {showNewProjectForm && (
        <div style={styles.newProjectForm}>
          <h3 style={styles.sectionTitle}>Create New Project</h3>
          <input
            type="text"
            placeholder="Project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            style={styles.input}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newProjectDescription}
            onChange={(e) => setNewProjectDescription(e.target.value)}
            style={styles.input}
          />
          <div style={styles.formButtons}>
            <button onClick={createProject} style={styles.saveButton}>
              Create Project
            </button>
            <button
              onClick={() => {
                setShowNewProjectForm(false);
                setNewProjectName('');
                setNewProjectDescription('');
              }}
              style={styles.cancelButton}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* File Upload Area */}
      {selectedProject && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Upload File</h3>
          
          <div
            style={{
              ...styles.uploadArea,
              ...(isDragOver ? styles.uploadAreaDragOver : {}),
              ...(uploading ? styles.uploadAreaUploading : {})
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {uploading ? (
              <div style={styles.uploadingContent}>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${uploadProgress}%`
                    }}
                  />
                </div>
                <p style={styles.progressText}>
                  Uploading... {uploadProgress}%
                </p>
              </div>
            ) : (
              <div style={styles.uploadContent}>
                <div style={styles.uploadIcon}>📁</div>
                <p style={styles.uploadText}>
                  Drag and drop your CSV file here, or click to browse
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  style={styles.fileInput}
                />
              </div>
            )}
          </div>

          {/* Error Message */}
          {uploadError && (
            <div style={styles.errorMessage}>
              ❌ {uploadError}
            </div>
          )}

          {/* Success Message */}
          {uploadSuccess && (
            <div style={styles.successMessage}>
              ✅ {uploadSuccess}
            </div>
          )}

          {/* File Requirements */}
          <div style={styles.requirements}>
            <h4 style={styles.requirementsTitle}>File Requirements:</h4>
            <ul style={styles.requirementsList}>
              <li>File must be in CSV format (.csv)</li>
              <li>Maximum file size: 10MB</li>
              <li>First row should contain column headers</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

// Styles
const styles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '30px',
    textAlign: 'center' as const
  },
  section: {
    marginBottom: '30px',
    padding: '20px',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9'
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '15px',
    marginTop: 0
  },
  noProjects: {
    textAlign: 'center' as const,
    padding: '20px'
  },
  createButton: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    cursor: 'pointer',
    marginTop: '10px'
  },
  projectSelector: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center'
  },
  select: {
    flex: 1,
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '16px'
  },
  addButton: {
    backgroundColor: '#28a745',
    color: 'white',
    padding: '10px 15px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer'
  },
  newProjectForm: {
    marginTop: '20px',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #ddd'
  },
  input: {
    width: '100%',
    padding: '10px',
    marginBottom: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '16px'
  },
  formButtons: {
    display: 'flex',
    gap: '10px'
  },
  saveButton: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    cursor: 'pointer'
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    cursor: 'pointer'
  },
  uploadArea: {
    border: '2px dashed #ccc',
    borderRadius: '8px',
    padding: '40px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    position: 'relative' as const
  },
  uploadAreaDragOver: {
    borderColor: '#007bff',
    backgroundColor: '#f0f8ff'
  },
  uploadAreaUploading: {
    cursor: 'not-allowed'
  },
  uploadContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '15px'
  },
  uploadIcon: {
    fontSize: '48px'
  },
  uploadText: {
    fontSize: '18px',
    color: '#666',
    margin: 0
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
  uploadingContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '15px'
  },
  progressBar: {
    width: '100%',
    height: '20px',
    backgroundColor: '#e0e0e0',
    borderRadius: '10px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007bff',
    transition: 'width 0.3s ease'
  },
  progressText: {
    fontSize: '16px',
    color: '#333',
    margin: 0
  },
  errorMessage: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '10px',
    borderRadius: '4px',
    marginTop: '10px',
    border: '1px solid #f5c6cb'
  },
  successMessage: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '10px',
    borderRadius: '4px',
    marginTop: '10px',
    border: '1px solid #c3e6cb'
  },
  requirements: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#e9ecef',
    borderRadius: '4px'
  },
  requirementsTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '10px',
    marginTop: 0
  },
  requirementsList: {
    margin: 0,
    paddingLeft: '20px',
    color: '#666'
  }
};

export default FileUpload;
