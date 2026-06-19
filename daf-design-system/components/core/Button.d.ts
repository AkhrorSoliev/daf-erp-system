import React from 'react';

/**
 * Props for the Lumio clay action button.
 * @startingPoint section="Core" subtitle="Clay action buttons" viewport="700x340"
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** Visual style. @default 'primary' */
  variant?: 'primary' | 'secondary' | 'ghost' | 'amber' | 'teal';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Stretch to full container width. @default false */
  block?: boolean;
  disabled?: boolean;
  iconBefore?: React.ReactNode;
  iconAfter?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Primary tappable action. Chunky rounded clay button that presses down on tap.
 */
export function Button(props: ButtonProps): JSX.Element;
