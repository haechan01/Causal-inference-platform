// src/services/projectStateService.ts
import axios from 'axios';

export interface AnalysisConfig {
  // DiD-specific
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
  // RD-specific
  runningVar?: string;
  cutoff?: string | number;
  outcomeVar?: string;
  bandwidth?: string;
  polynomialOrder?: number;
  treatmentSide?: 'above' | 'below';
  rdType?: 'sharp' | 'fuzzy';
  // IV-specific (treatmentVar also used by Fuzzy RD)
  treatmentVar?: string;
  instruments?: string[];
  interactions?: [string, string][];
  additionalEndogenous?: Array<{ variable: string; instrument: string }>;
  runSensitivity?: boolean;
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
   * Get the route path for a given step.
   * Uses selectedMethod to route to method-specific pages (e.g. RD uses /rd-setup, /rd-results).
   */
  getStepPath(step: string, selectedMethod?: string): string {
    // Handle method-specific step names saved directly as step keys
    if (step === 'rd-setup') return '/rd-setup';
    if (step === 'rd-results') return '/rd-results';
    if (step === 'iv-setup') return '/iv-setup';
    if (step === 'iv-results') return '/iv-results';

    const isRD = selectedMethod === 'rdd';
    const isIV = selectedMethod === 'iv';
    const stepPaths: Record<string, string> = {
      'upload': '/upload-data',
      'projects': '/projects',
      'method': '/method-selection',
      'variables': isRD ? '/rd-setup' : isIV ? '/iv-setup' : '/variable-selection',
      'results': isRD ? '/rd-results' : isIV ? '/iv-results' : '/results'
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
      '/analysis': 'results',
      '/iv-setup': 'iv-setup',
      '/iv-results': 'iv-results',
      '/rd-setup': 'rd-setup',
      '/rd-results': 'rd-results',
    };
    return pathSteps[path] || 'projects';
  }
}

export const projectStateService = new ProjectStateService();
export default projectStateService;



