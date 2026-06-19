import React from 'react';

export interface BadgeProps {
  children?: React.ReactNode;
  /** @default 'coral' */
  color?: 'coral' | 'amber' | 'teal' | 'grape' | 'sky' | 'success' | 'danger' | 'neutral';
  /** Soft tinted fill vs solid. @default true */
  soft?: boolean;
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}

/** Small rounded status/label pill. */
export function Badge(props: BadgeProps): JSX.Element;
