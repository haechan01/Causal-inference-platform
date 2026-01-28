import { useLocation, useNavigate } from 'react-router-dom';

export const useProgressStep = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Unified Flow: Upload Data → Project → Method → Variables → Results
  // The Variables and Results pages adapt based on the selected method (DiD or RD)
  const steps = [
    { id: 'upload', label: 'Upload Data', path: '/upload-data' },
    { id: 'projects', label: 'Project', path: '/projects' },
    { id: 'method', label: 'Method', path: '/method-selection' },
    { id: 'variables', label: 'Variables', path: '/variable-selection' },
    { id: 'results', label: 'Results', path: '/results' }
  ];

  // Helper to build path with preserved query params (projectId, datasetId)
  const buildPathWithParams = (basePath: string): string => {
    const params = new URLSearchParams(location.search);
    const projectId = params.get('projectId');
    const datasetId = params.get('datasetId');

    // Also check location state for projectId/datasetId if not in URL
    const stateProjectId = (location.state as any)?.projectId;
    const stateDatasetId = (location.state as any)?.datasetId;

    const finalProjectId = projectId || stateProjectId;
    const finalDatasetId = datasetId || stateDatasetId;

    if (finalProjectId) {
      const newParams = new URLSearchParams();
      newParams.set('projectId', String(finalProjectId));
      if (finalDatasetId) {
        newParams.set('datasetId', String(finalDatasetId));
      }
      return `${basePath}?${newParams.toString()}`;
    }
    return basePath;
  };

  const getCurrentStep = (): string => {
    switch (location.pathname) {
      case '/':
        return 'upload'; // Landing redirects to upload
      case '/upload-data':
        return 'upload';
      case '/projects':
        return 'projects';
      case '/method-selection':
        return 'method';
      case '/variable-selection':
        return 'variables';
      case '/analysis':
      case '/results':
        return 'results';
      // RD routes map to the generic steps
      case '/rd-setup':
        return 'variables'; // RD Setup is the "Variables" step for RD
      case '/rd-results':
        return 'results'; // RD Results is the "Results" step for RD
      default:
        return 'upload';
    }
  };

  const goToPreviousStep = () => {
    const currentIndex = steps.findIndex(step => step.id === getCurrentStep());
    if (currentIndex > 0) {
      const targetPath = buildPathWithParams(steps[currentIndex - 1].path);
      // Also pass state for backwards compatibility
      const params = new URLSearchParams(location.search);
      const stateProjectId = (location.state as any)?.projectId;
      const stateDatasetId = (location.state as any)?.datasetId;
      const projectId = params.get('projectId') || stateProjectId;
      const datasetId = params.get('datasetId') || stateDatasetId;

      navigate(targetPath, {
        state: {
          projectId: projectId ? parseInt(String(projectId)) : undefined,
          datasetId: datasetId ? parseInt(String(datasetId)) : undefined
        }
      });
    }
  };

  const goToNextStep = () => {
    const currentIndex = steps.findIndex(step => step.id === getCurrentStep());
    if (currentIndex < steps.length - 1) {
      const targetPath = buildPathWithParams(steps[currentIndex + 1].path);
      // Also pass state for backwards compatibility
      const params = new URLSearchParams(location.search);
      const stateProjectId = (location.state as any)?.projectId;
      const stateDatasetId = (location.state as any)?.datasetId;
      const projectId = params.get('projectId') || stateProjectId;
      const datasetId = params.get('datasetId') || stateDatasetId;

      navigate(targetPath, {
        state: {
          projectId: projectId ? parseInt(String(projectId)) : undefined,
          datasetId: datasetId ? parseInt(String(datasetId)) : undefined
        }
      });
    }
  };

  // Helper function for onStepClick - preserves projectId in step navigation
  const navigateToStep = (stepPath: string) => {
    const targetPath = buildPathWithParams(stepPath);
    const params = new URLSearchParams(location.search);
    const stateProjectId = (location.state as any)?.projectId;
    const stateDatasetId = (location.state as any)?.datasetId;
    const projectId = params.get('projectId') || stateProjectId;
    const datasetId = params.get('datasetId') || stateDatasetId;

    navigate(targetPath, {
      state: {
        projectId: projectId ? parseInt(String(projectId)) : undefined,
        datasetId: datasetId ? parseInt(String(datasetId)) : undefined
      }
    });
  };

  return {
    currentStep: getCurrentStep(),
    steps,
    goToPreviousStep,
    goToNextStep,
    navigateToStep  // New helper for step clicks
  };
};