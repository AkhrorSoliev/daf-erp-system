import React from 'react';

export interface ProgressRingProps {
  /** 0–100. */
  value?: number;
  /** Diameter px. @default 72 */
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  /** Centered label; defaults to "NN%". */
  label?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Circular completion ring with a centered percentage label. */
export function ProgressRing(props: ProgressRingProps): JSX.Element;
