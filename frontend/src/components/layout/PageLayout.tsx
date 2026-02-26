import React from 'react';
import Navbar from './Navbar';

interface PageLayoutProps {
  children: React.ReactNode;
  /** Optional bottom bar (e.g. BottomProgressBar). When present, main content gets bottom padding. */
  bottomBar?: React.ReactNode;
}

const NAVBAR_HEIGHT = 70;
const BOTTOM_BAR_PADDING = 120;

/**
 * Shared layout for app pages: fixed Navbar + main content area + optional bottom bar.
 * Use this to avoid repeating Navbar + padding in every page.
 */
const PageLayout: React.FC<PageLayoutProps> = ({ children, bottomBar }) => {
  return (
    <>
      <Navbar />
      <main
        style={{
          paddingTop: NAVBAR_HEIGHT,
          paddingBottom: bottomBar ? BOTTOM_BAR_PADDING : 24,
          minHeight: '100vh',
          boxSizing: 'border-box'
        }}
      >
        {children}
      </main>
      {bottomBar}
    </>
  );
};

export default PageLayout;
