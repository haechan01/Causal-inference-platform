import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NavigationButtonConfig } from '../../types/buttons';

interface NavigationButtonProps {
  config: NavigationButtonConfig;
}

const NavigationButton: React.FC<NavigationButtonProps> = ({ config }) => {
  const navigate = useNavigate();
  
  const handleNavigation = () => {
    navigate(config.to);
  };

  return (
    <button 
      onClick={handleNavigation}
      style={config.style}
    >
      {config.text}
    </button>
  );
};

export default NavigationButton;
