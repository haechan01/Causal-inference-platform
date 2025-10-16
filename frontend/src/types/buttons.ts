export interface NavigationButtonConfig {
  to: string;
  text: string;
  style?: React.CSSProperties;
}

export interface NavigationButton {
  onClick: () => void;
  text: string;
  style?: React.CSSProperties;
}
