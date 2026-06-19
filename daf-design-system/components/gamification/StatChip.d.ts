import React from 'react';

export interface StatChipProps {
  /** Icon node (Phosphor/SVG). */
  icon?: React.ReactNode;
  value: React.ReactNode;
  /** Colors the icon. @default 'xp' */
  kind?: 'xp' | 'coin' | 'streak' | 'gem' | 'neutral';
  /** @default 'md' */
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

/** White capsule showing a gamification stat (XP / coins / streak / gems). */
export function StatChip(props: StatChipProps): JSX.Element;
