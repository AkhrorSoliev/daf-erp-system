import React from 'react';

export interface ChipProps {
  children?: React.ReactNode;
  selected?: boolean;
  /** @default 'coral' */
  color?: 'coral' | 'amber' | 'teal' | 'grape' | 'sky' | 'ink';
  iconBefore?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/** Selectable filter/choice chip — solid when selected, outlined when idle. */
export function Chip(props: ChipProps): JSX.Element;
