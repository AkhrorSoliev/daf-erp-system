import React from 'react';

export interface IconButtonProps {
  /** Icon node (e.g. a Phosphor <i> or inline SVG). */
  children?: React.ReactNode;
  /** @default 'soft' */
  variant?: 'primary' | 'soft' | 'white' | 'teal' | 'ghost';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** @default 'circle' */
  shape?: 'circle' | 'squircle';
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/** Compact circular/squircle button holding a single icon. */
export function IconButton(props: IconButtonProps): JSX.Element;
