import React from 'react';

export interface FractionChipProps {
  /** Reward type → icon + color. @default 'star' */
  kind?: 'star' | 'coin' | 'xp' | 'gem';
  /** Earned amount (numerator). @default 0 */
  earned?: number;
  /** Total available (denominator). @default 0 */
  total?: number;
  /** @default 'md' */
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

/** "earned / total" reward chip (star, coin, XP, gem) used across lesson screens. */
export function FractionChip(props: FractionChipProps): JSX.Element;
