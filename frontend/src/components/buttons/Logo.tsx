import React from 'react';

interface LogoProps {
  style?: React.CSSProperties;
}

const Logo: React.FC<LogoProps> = ({ style }) => {
  return (
    <h1 style={style}>CausalFlow</h1>
  );
};

export default Logo;
