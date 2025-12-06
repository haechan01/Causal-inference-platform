// src/services/projectStateService.ts
import axios from 'axios';

export interface AnalysisConfig {
  outcome?: string;
  treatment?: string;
  treatmentValue?: string;
  time?: string;
  unit?: string;
  treatmentStart?: string;
  startPeriod?: string;
  endPeriod?: string;
  controls?: string[];
  treatmentUnits?: string[];
  controlUnits?: string[];
}

export interface ProjectState {
  currentStep?: string;
  selectedMethod?: string;
  analysisConfig?: AnalysisConfig;
  lastResults?: any;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  currentStep?: string;
  selectedMethod?: string;
  analysisConfig?: AnalysisConfig;
  lastResults?: any;
  updatedAt?: string;
  datasetsCount: number;
  datasets?: Array<{
    id: number;
    name: string;
    file_name: string;
    created_at: string;
  }>;
}

class ProjectStateService {
  /**
   * Save project state to the backend
   */
  async saveState(
    projectId: number, 
    state: ProjectState, 
    accessToken: string
  ): Promise<void> {
    try {
      await axios.put(`/projects/${projectId}/state`, {
        current_step: state.currentStep,
        selected_method: state.selectedMethod,
        analysis_config: state.analysisConfig,
        last_results: state.lastResults
      }, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } catch (error) {
      console.error('Failed to save project state:', error);
      throw error;
    }
  }

  /**
   * Load project with its saved state
   */
  async loadProject(projectId: number, accessToken: string): Promise<Project> {
    try {
      const response = await axios.get(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      const project = response.data.project;
      
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        currentStep: project.current_step,
        selectedMethod: project.selected_method,
        analysisConfig: project.analysis_config,
        lastResults: project.last_results,
        updatedAt: project.updated_at,
        datasetsCount: project.datasets_count,
        datasets: project.datasets
      };
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  }

  /**
   * Get the route path for a given step
   */
  getStepPath(step: string): string {
    const stepPaths: Record<string, string> = {
      'upload': '/upload-data',
      'projects': '/projects',
      'method': '/method-selection',
      'variables': '/variable-selection',
      'results': '/results'
    };
    return stepPaths[step] || '/projects';
  }

  /**
   * Get the step name from a route path
   */
  getStepFromPath(path: string): string {
    const pathSteps: Record<string, string> = {
      '/upload-data': 'upload',
      '/projects': 'projects',
      '/method-selection': 'method',
      '/variable-selection': 'variables',
      '/results': 'results',
      '/analysis': 'results'
    };
    return pathSteps[path] || 'projects';
  }
}

export const projectStateService = new ProjectStateService();
export default projectStateService;


