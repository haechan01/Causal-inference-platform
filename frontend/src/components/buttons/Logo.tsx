import React from 'react';

interface LogoProps {
  style?: React.CSSProperties;
}

const Logo: React.FC<LogoProps> = ({ style }) => {
  return (
    <h1 style={style}>CausAl Studio</h1>
  );
};

export default Logo;
