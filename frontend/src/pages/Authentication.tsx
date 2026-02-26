// src/components/Authentication.tsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';

const Authentication: React.FC = () => {
  const location = useLocation();
  const isLoginMode = location.pathname === '/login';

  return (
    <div>
      {isLoginMode ? (
        <LoginPage />
      ) : (
        <SignUpPage />
      )}
    </div>
  );
};

export default Authentication;
