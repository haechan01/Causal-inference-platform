import React from 'react';
import { useNavigate } from 'react-router-dom';

interface SignUpButtonProps {
  style?: React.CSSProperties;
}

const SignUpButton: React.FC<SignUpButtonProps> = ({ style }) => {
  const navigate = useNavigate();
  
  const handleSignUp = () => {
    navigate('/signup');
  };

  return (
    <button 
      onClick={handleSignUp} 
      style={style}
    >
      Sign Up
    </button>
  );
};

export default SignUpButton;
