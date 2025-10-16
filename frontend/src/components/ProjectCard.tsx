import React from 'react';

interface Project {
  id: number;
  title: string;
  description: string;
  created_at: string;
  dataset_count: number;
  datasets?: Array<{
    id: number;
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
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, isSelected, onSelect, onUpload, onCheckboxChange }) => {
  const handleUploadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpload(project);
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onCheckboxChange(project, e.target.checked);
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
        <button
          onClick={handleUploadClick}
          style={styles.uploadButton}
        >
          + Upload Data
        </button>
      </div>
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
  uploadButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    '&:hover': {
      backgroundColor: '#0a4a8a',
      transform: 'translateY(-1px)'
    }
  }
};

export default ProjectCard;
