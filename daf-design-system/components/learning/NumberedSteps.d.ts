import React from 'react';

export interface NumberedStepsProps {
  /** Step descriptions, in order. */
  steps: React.ReactNode[];
  /** Tile color. @default 'grape' */
  tone?: 'grape' | 'coral' | 'teal' | 'sky';
  style?: React.CSSProperties;
}

/** Numbered onboarding path — clay numbered tiles + dashed connectors + bubbles. */
export function NumberedSteps(props: NumberedStepsProps): JSX.Element;
