import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface LogoutButtonProps {
  style?: React.CSSProperties;
}

const LogoutButton: React.FC<LogoutButtonProps> = ({ style }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <button 
      onClick={handleLogout} 
      style={style}
    >
      Logout
    </button>
  );
};

export default LogoutButton;
