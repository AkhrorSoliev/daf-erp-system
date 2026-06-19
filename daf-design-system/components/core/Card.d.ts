import React from 'react';

/**
 * Base rounded surface.
 * @startingPoint section="Core" subtitle="Rounded surface container" viewport="700x340"
 */
export interface CardProps {
  children?: React.ReactNode;
  /** Add the extruded clay bottom-lip shadow. @default false */
  clay?: boolean;
  /** Lip color when clay. @default 'neutral' */
  tone?: 'neutral' | 'coral' | 'amber' | 'teal' | 'grape' | 'sky';
  /** @default 'md' */
  pad?: 'none' | 'sm' | 'md' | 'lg';
  /** @default 'lg' */
  radius?: 'md' | 'lg' | 'xl' | '2xl';
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Base rounded surface. White by default, soft ambient shadow; opt into `clay`
 * for the extruded look.
 */
export function Card(props: CardProps): JSX.Element;
