import React from 'react';

export interface ResultStatPillProps {
  /** Icon node shown in the colored coin. */
  icon?: React.ReactNode;
  value: React.ReactNode;
  /** Colors the coin. @default 'correct' */
  kind?: 'correct' | 'wrong' | 'star' | 'time';
  /** Translucent style for the winner card. @default false */
  filled?: boolean;
  style?: React.CSSProperties;
}

/** Battle-result stat capsule (correct / wrong / star / time). */
export function ResultStatPill(props: ResultStatPillProps): JSX.Element;
