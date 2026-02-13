import React, { useState } from 'react';

interface Project {
  id: number;
  title: string;
  description: string;
  created_at: string;
  dataset_count: number;
  current_step?: string;
  selected_method?: string;
  updated_at?: string;
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
  onCheckboxChange: (project: Project, checked: boolean) => void;
  onEdit?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  onNavigate?: (project: Project, step: string) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isSelected,
  onSelect,
  onCheckboxChange,
  onEdit,
  onDelete,
  onNavigate
}) => {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const hasDatasets = project.datasets && project.datasets.length > 0;

  // Helper to get progress status text and color
  const getProgressStatus = () => {
    if (!project.current_step || project.current_step === 'projects') {
      return null;
    }

    const stepLabels: Record<string, string> = {
      'method': 'Method Selected',
      'variables': 'Configuring Variables',
      'results': 'Analysis Complete',
      'rd-setup': 'Configuring Variables',
      'rd-results': 'Analysis Complete'
    };

    const stepColors: Record<string, string> = {
      'method': '#3498db',
      'variables': '#f39c12',
      'results': '#27ae60',
      'rd-setup': '#f39c12',
      'rd-results': '#27ae60'
    };

    return {
      label: stepLabels[project.current_step] || 'In Progress',
      color: stepColors[project.current_step] || '#7f8c8d',
      method: project.selected_method?.toUpperCase()
    };
  };

  const progressStatus = getProgressStatus();

  // Helper to check if a step is available
  const isStepAvailable = (step: string) => {
    if (!project.current_step || !hasDatasets) return false;

    const steps = ['projects', 'method', 'variables', 'results'];
    // Map RD-specific steps to generic steps for index comparison
    const normalizedStep =
      project.current_step === 'rd-setup'
        ? 'variables'
        : project.current_step === 'rd-results'
          ? 'results'
          : project.current_step;
    const currentIndex = steps.indexOf(normalizedStep);
    const targetIndex = steps.indexOf(step);

    // Allow navigation to current or previous steps
    return targetIndex <= currentIndex && targetIndex > 0;
  };

  // Handle card click - toggle selection if has datasets
  const handleCardClick = () => {
    if (hasDatasets) {
      onCheckboxChange(project, !isSelected);
    }
    onSelect(project);
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

  const handleNavigateClick = (e: React.MouseEvent, step: string) => {
    e.stopPropagation();
    onNavigate?.(project, step);
  };

  return (
    <div
      style={{
        ...styles.card,
        ...(isSelected ? styles.selectedCard : {}),
        ...(hasDatasets ? {} : styles.cardDisabled)
      }}
      onClick={handleCardClick}
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

      {/* Quick Navigation Buttons */}
      {hasDatasets && onNavigate && (
        <div style={styles.quickNavContainer}>
          <h4 style={styles.quickNavTitle}>Quick Navigation:</h4>
          <div style={styles.quickNavButtons}>
            <button
              onClick={(e) => handleNavigateClick(e, 'method')}
              style={styles.navButton}
              title="Go to Method Selection"
            >
              Method
            </button>

            {isStepAvailable('variables') && (
              <button
                onClick={(e) => handleNavigateClick(e, 'variables')}
                style={styles.navButton}
                title="Go to Variable Selection"
              >
                Variables
              </button>
            )}

            {isStepAvailable('results') && (
              <button
                onClick={(e) => handleNavigateClick(e, 'results')}
                style={styles.navButton}
                title="Go to Analysis Results"
              >
                Results
              </button>
            )}
          </div>
        </div>
      )}

      {/* Progress Status Badge */}
      {progressStatus && (
        <div style={styles.progressContainer}>
          <span
            style={{
              ...styles.progressBadge,
              backgroundColor: progressStatus.color
            }}
          >
            {progressStatus.label}
            {progressStatus.method && ` • ${progressStatus.method}`}
          </span>
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
  cardDisabled: {
    opacity: 0.7,
    cursor: 'default'
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
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '12px',
    marginBottom: '12px'
  },
  progressBadge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    color: 'white',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  },
  continueHint: {
    fontSize: '12px',
    color: '#7f8c8d',
    fontStyle: 'italic'
  },
  quickNavContainer: {
    marginTop: '15px',
    marginBottom: '10px',
    padding: '10px',
    backgroundColor: '#f0f7ff',
    borderRadius: '8px',
    border: '1px solid #d0e7ff'
  },
  quickNavTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#043873',
    margin: '0 0 8px 0',
    textTransform: 'uppercase' as const
  },
  quickNavButtons: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const
  },
  navButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    color: '#043873',
    backgroundColor: 'white',
    border: '1px solid #043873',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    '&:hover': {
      backgroundColor: '#043873',
      color: 'white'
    }
  }
};

export default ProjectCard;
