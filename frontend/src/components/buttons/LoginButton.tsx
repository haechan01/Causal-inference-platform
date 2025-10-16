import React from 'react';
import { useNavigate } from 'react-router-dom';

interface LoginButtonProps {
  style?: React.CSSProperties;
}

const LoginButton: React.FC<LoginButtonProps> = ({ style }) => {
  const navigate = useNavigate();
  
  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <button 
      onClick={handleLogin} 
      style={style}
    >
      Login
    </button>
  );
};

export default LoginButton;
