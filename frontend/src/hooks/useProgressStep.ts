import { useLocation, useNavigate } from 'react-router-dom';

export const useProgressStep = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Flow: Upload Data → Create Project → Method → Variables → Results
  const steps = [
    { id: 'upload', label: 'Upload Data', path: '/upload-data' },
    { id: 'projects', label: 'Project', path: '/projects' },
    { id: 'method', label: 'Method', path: '/method-selection' },
    { id: 'variables', label: 'Variables', path: '/variable-selection' },
    { id: 'results', label: 'Results', path: '/results' }
  ];
  
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
      default:
        return 'upload';
    }
  };
  
  const goToPreviousStep = () => {
    const currentIndex = steps.findIndex(step => step.id === getCurrentStep());
    if (currentIndex > 0) {
      navigate(steps[currentIndex - 1].path);
    }
  };
  
  const goToNextStep = () => {
    const currentIndex = steps.findIndex(step => step.id === getCurrentStep());
    if (currentIndex < steps.length - 1) {
      navigate(steps[currentIndex + 1].path);
    }
  };
  
  return {
    currentStep: getCurrentStep(),
    steps,
    goToPreviousStep,
    goToNextStep
  };
};