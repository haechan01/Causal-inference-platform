// src/components/ProjectsPage.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from './Navbar';
import ProjectCard from './ProjectCard';
import NewProjectModal from './NewProjectModal';
import UploadDataModal from './UploadDataModal';
import { LoginButton, SignUpButton } from './buttons';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import axios from 'axios';

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

const ProjectsPage: React.FC = () => {
  const { isAuthenticated, isLoading, accessToken } = useAuth();
  const { currentStep, steps, goToPreviousStep, goToNextStep } = useProgressStep();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [checkedProject, setCheckedProject] = useState<Project | null>(null);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadProject, setUploadProject] = useState<Project | null>(null);
  const [isReadyForNext, setIsReadyForNext] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load projects from API
  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/projects', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      // Map backend response to frontend format and load datasets for each project
      const mappedProjects = await Promise.all(
        (response.data.projects || []).map(async (project: any) => {
          try {
            // Load datasets for this project
            const datasetsResponse = await axios.get(`/projects/${project.id}/datasets`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            return {
              id: project.id,
              title: project.name,  // Map 'name' to 'title'
              description: project.description,
              created_at: new Date().toISOString(),  // Add timestamp
              dataset_count: project.datasets_count || 0,
              datasets: datasetsResponse.data.datasets || []
            };
          } catch (error) {
            console.error(`Error loading datasets for project ${project.id}:`, error);
            return {
              id: project.id,
              title: project.name,
              description: project.description,
              created_at: new Date().toISOString(),
              dataset_count: project.datasets_count || 0,
              datasets: []
            };
          }
        })
      );
      
      setProjects(mappedProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load projects on component mount
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      loadProjects();
    }
  }, [isAuthenticated, accessToken]);

  // Handle project selection
  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
  };

  // Handle creating new project
  const handleCreateProject = async (title: string, description: string) => {
    try {
      const response = await axios.post('/projects', {
        name: title,  // Backend expects 'name' field
        description
      }, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      const newProject = response.data.project;
      // Map backend response to frontend format
      const mappedProject = {
        id: newProject.id,
        title: newProject.name,  // Map 'name' to 'title' for frontend
        description: newProject.description,
        created_at: new Date().toISOString(),  // Add timestamp
        dataset_count: 0
      };
      
      setProjects([...projects, mappedProject]);
      setSelectedProject(mappedProject);
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  };


  // Handle upload button click
  const handleUploadClick = (project: Project) => {
    setUploadProject(project);
    setIsUploadModalOpen(true);
  };

  // Handle successful upload
  const handleUploadSuccess = (uploadedFile: any) => {
    console.log('File uploaded successfully:', uploadedFile);
    // Reload projects to update dataset counts
    loadProjects();
  };

  // Handle checkbox change
  const handleCheckboxChange = (project: Project, checked: boolean) => {
    if (checked) {
      setCheckedProject(project);
      // Set ready for next if project has datasets
      setIsReadyForNext(project.dataset_count > 0);
    } else {
      setCheckedProject(null);
      setIsReadyForNext(false);
    }
  };

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner}></div>
        <p style={styles.loadingText}>Loading...</p>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return (
      <div style={styles.authRequired}>
        <div style={styles.authCard}>
          <h2 style={styles.authTitle}>Authentication Required</h2>
          <p style={styles.authMessage}>
            Please log in or sign up to access your projects and start analysis.
          </p>
          <div style={styles.authButtons}>
            <LoginButton />
            <SignUpButton />
          </div>
        </div>
      </div>
    );
  }


  // Show project selection interface for authenticated users
  return (
    <div>
      <Navbar />
      <div style={styles.contentContainer}>
        <div style={styles.projectsHeader}>
          <h1 style={styles.pageTitle}>Your Projects</h1>
          <p style={styles.pageSubtitle}>Select a project to manage data or create a new one</p>
        </div>

        <div style={styles.projectsGrid}>
          {loading ? (
            <div style={styles.loadingContainer}>
              <div style={styles.loadingSpinner}></div>
              <p style={styles.loadingText}>Loading projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📁</div>
              <h3 style={styles.emptyTitle}>No projects yet</h3>
              <p style={styles.emptyDescription}>Create your first project to get started with data analysis</p>
            </div>
          ) : (
            projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isSelected={checkedProject?.id === project.id}
                onSelect={handleProjectSelect}
                onUpload={handleUploadClick}
                onCheckboxChange={handleCheckboxChange}
              />
            ))
          )}
        </div>

        <div style={styles.newProjectSection}>
          <button
            onClick={() => setIsNewProjectModalOpen(true)}
            style={styles.newProjectButton}
          >
            + New Project
          </button>
        </div>
      </div>

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onCreateProject={handleCreateProject}
      />

      {/* Upload Data Modal */}
      {uploadProject && (
        <UploadDataModal
          isOpen={isUploadModalOpen}
          onClose={() => {
            setIsUploadModalOpen(false);
            setUploadProject(null);
          }}
          onUploadSuccess={handleUploadSuccess}
          projectId={uploadProject.id}
        />
      )}
       {/* Bottom Progress Bar */}
       <BottomProgressBar
         currentStep={currentStep}
         steps={steps}
         onPrev={goToPreviousStep}
         onNext={goToNextStep}
         canGoNext={isReadyForNext}
       />
     </div>
   );
};

// Styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5'
  },
  contentContainer: {
    paddingTop: '70px', // Account for fixed navbar height
    paddingBottom: '80px', // Account for fixed bottom progress bar
    minHeight: 'calc(100vh - 70px)', // Full height minus navbar
    backgroundColor: '#f5f5f5'
  },
  projectsHeader: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    maxWidth: '1200px',
    margin: '0 auto'
  },
  pageTitle: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0'
  },
  pageSubtitle: {
    fontSize: '18px',
    color: '#666',
    margin: 0
  },
  projectsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto'
  },
  emptyState: {
    gridColumn: '1 / -1',
    textAlign: 'center' as const,
    padding: '60px 20px',
    color: '#666'
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '20px'
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0'
  },
  emptyDescription: {
    fontSize: '16px',
    margin: 0
  },
  newProjectSection: {
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 20px'
  },
  newProjectButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 15px rgba(4, 56, 115, 0.3)',
    '&:hover': {
      backgroundColor: '#0a4a8a',
      transform: 'translateY(-2px)',
      boxShadow: '0 6px 20px rgba(4, 56, 115, 0.4)'
    }
  },
  dataManagementHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
    borderBottom: '1px solid #e0e0e0'
  },
  backButton: {
    backgroundColor: 'transparent',
    color: '#043873',
    border: '1px solid #043873',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    '&:hover': {
      backgroundColor: '#043873',
      color: 'white'
    }
  },
  projectTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    margin: 0
  },
  mainContent: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    flex: 1,
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e0e0e0',
    padding: '20px 0'
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px',
    textAlign: 'center' as const
  },
  title: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0'
  },
  subtitle: {
    fontSize: '18px',
    color: '#666',
    margin: 0
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5'
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px'
  },
  loadingText: {
    fontSize: '18px',
    color: '#666',
    margin: 0
  },
  authRequired: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: '20px'
  },
  authCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as const,
    maxWidth: '400px',
    width: '100%'
  },
  authTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 15px 0'
  },
  authMessage: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 30px 0',
    lineHeight: '1.5'
  },
  authButtons: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center'
  },
  loginButton: {
    backgroundColor: '#FFE492',
    color: '#043873',
    border: 'none',
    borderRadius: '6px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  signupButton: {
    backgroundColor: '#4F9CF9',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
};

export default ProjectsPage;
