import { useLocation, useNavigate } from 'react-router-dom';

export const useProgressStep = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const steps = [
    { id: 'landing', label: 'Welcome', path: '/' },
    { id: 'projects', label: 'Projects', path: '/projects' },
    { id: 'method', label: 'Method', path: '/method-selection' },
    { id: 'variables', label: 'Variables', path: '/variable-selection' },
    { id: 'analysis', label: 'Analysis', path: '/analysis' },
    { id: 'results', label: 'Results', path: '/results' }
  ];
  
  const getCurrentStep = (): string => {
    switch (location.pathname) {
      case '/':
        return 'landing';
      case '/projects':
        return 'projects';
      case '/method-selection':
        return 'method';
      case '/variable-selection':
        return 'variables';
      case '/analysis':
        return 'analysis';
      case '/results':
        return 'results';
      default:
        return 'landing';
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