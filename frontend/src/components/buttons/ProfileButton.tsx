import React from 'react';
import { useNavigate } from 'react-router-dom';

interface ProfileButtonProps {
  style?: React.CSSProperties;
}

const ProfileButton: React.FC<ProfileButtonProps> = ({ style }) => {
  const navigate = useNavigate();
  
  const handleProfile = () => {
    navigate('/projects');
  };

  return (
    <button 
      onClick={handleProfile} 
      style={style}
    >
      Projects
    </button>
  );
};

export default ProfileButton;
