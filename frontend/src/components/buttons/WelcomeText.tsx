import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface WelcomeTextProps {
  style?: React.CSSProperties;
}

const WelcomeText: React.FC<WelcomeTextProps> = ({ style }) => {
  const { user } = useAuth();

  return (
    <span style={style}>
      Welcome, {user?.username || 'User'}!
    </span>
  );
};

export default WelcomeText;
