import React, { useState } from 'react';

interface Project {
  id: number;
  title: string;
  description: string;
  created_at: string;
  dataset_count: number;
  datasets?: Array<{
    id: number;
    name: string;
    file_name: string;
    created_at: string;
  }>;
}

interface ProjectCardProps {
  project: Project;
  isSelected: boolean;
  onSelect: (project: Project) => void;
  onUpload: (project: Project) => void;
  onCheckboxChange: (project: Project, checked: boolean) => void;
  onEdit?: (project: Project) => void;
  onDelete?: (project: Project) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ 
  project, 
  isSelected, 
  onSelect, 
  onUpload, 
  onCheckboxChange,
  onEdit,
  onDelete 
}) => {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const handleUploadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpload(project);
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onCheckboxChange(project, e.target.checked);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(project);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirmDelete(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(project);
    setShowConfirmDelete(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirmDelete(false);
  };

  const hasDatasets = project.datasets && project.datasets.length > 0;

  return (
    <div 
      style={{
        ...styles.card,
        ...(isSelected ? styles.selectedCard : {})
      }}
      onClick={() => onSelect(project)}
    >
      <div style={styles.cardHeader}>
        <div style={styles.headerLeft}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            style={styles.checkbox}
            disabled={!hasDatasets}
          />
          <h3 style={styles.cardTitle}>{project.title}</h3>
        </div>
        <div style={styles.cardBadge}>
          {project.dataset_count} files
        </div>
      </div>
      
      <p style={styles.cardDescription}>{project.description}</p>
      
      {/* Show uploaded files */}
      {project.datasets && project.datasets.length > 0 && (
        <div style={styles.datasetsList}>
          <h4 style={styles.datasetsTitle}>Uploaded Files:</h4>
          {project.datasets.slice(0, 3).map((dataset) => (
            <div key={dataset.id} style={styles.datasetItem}>
              <span style={styles.datasetIcon}>📊</span>
              <span style={styles.datasetName}>{dataset.file_name}</span>
            </div>
          ))}
          {project.datasets.length > 3 && (
            <div style={styles.moreFiles}>
              +{project.datasets.length - 3} more files
            </div>
          )}
        </div>
      )}
      
      <div style={styles.cardFooter}>
        <span style={styles.cardDate}>
          Created {new Date(project.created_at).toLocaleDateString()}
        </span>
        <div style={styles.actionButtons}>
          <button
            onClick={handleEditClick}
            style={styles.editButton}
            title="Edit project"
          >
            ✏️
          </button>
          <button
            onClick={handleDeleteClick}
            style={styles.deleteButton}
            title="Delete project"
          >
            🗑️
          </button>
          <button
            onClick={handleUploadClick}
            style={styles.uploadButton}
          >
            + Upload Data
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showConfirmDelete && (
        <div style={styles.confirmOverlay} onClick={handleCancelDelete}>
          <div style={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.confirmTitle}>Delete Project?</h3>
            <p style={styles.confirmText}>
              Are you sure you want to delete "{project.title}"? This action cannot be undone.
              Linked datasets will be unlinked but not deleted.
            </p>
            <div style={styles.confirmButtons}>
              <button onClick={handleCancelDelete} style={styles.cancelButton}>
                Cancel
              </button>
              <button onClick={handleConfirmDelete} style={styles.confirmDeleteButton}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    border: '2px solid transparent',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
    }
  },
  selectedCard: {
    border: '2px solid #043873',
    boxShadow: '0 4px 20px rgba(4, 56, 115, 0.2)'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: '#043873'
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
    margin: 0,
    flex: 1
  },
  cardBadge: {
    backgroundColor: '#043873',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    marginLeft: '10px'
  },
  cardDescription: {
    fontSize: '14px',
    color: '#666',
    margin: '0 0 15px 0',
    lineHeight: '1.4'
  },
  datasetsList: {
    margin: '15px 0',
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px'
  },
  datasetsTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#666',
    margin: '0 0 8px 0',
    textTransform: 'uppercase' as const
  },
  datasetItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
    fontSize: '13px'
  },
  datasetIcon: {
    fontSize: '14px'
  },
  datasetName: {
    color: '#333',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1
  },
  moreFiles: {
    fontSize: '12px',
    color: '#666',
    fontStyle: 'italic'
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px'
  },
  cardDate: {
    fontSize: '12px',
    color: '#999',
    flex: 1
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },
  editButton: {
    backgroundColor: '#f1f5f9',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  uploadButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  confirmOverlay: {
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
  confirmModal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
  },
  confirmTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 12px 0'
  },
  confirmText: {
    fontSize: '14px',
    color: '#64748b',
    lineHeight: 1.5,
    margin: '0 0 20px 0'
  },
  confirmButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end'
  },
  cancelButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  confirmDeleteButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    backgroundColor: '#ef4444',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  }
};

export default ProjectCard;
