import React from 'react';

export interface ProgressBarProps {
  /** 0–100. */
  value?: number;
  color?: string;
  /** Track height px. @default 12 */
  height?: number;
  showLabel?: boolean;
  style?: React.CSSProperties;
}

/** Rounded horizontal progress bar with inset track. */
export function ProgressBar(props: ProgressBarProps): JSX.Element;
