import React from 'react';

/**
 * Bold gradient feature tile.
 * @startingPoint section="Gamification" subtitle="Gradient feature tiles" viewport="700x340"
 */
export interface FeatureCardProps {
  title: React.ReactNode;
  /** Optional pill caption under the title. */
  subtitle?: React.ReactNode;
  /** @default 'warm' */
  gradient?: 'warm' | 'sun' | 'teal' | 'cool' | 'grape';
  /** Right-side art (large icon / image element). */
  art?: React.ReactNode;
  /** Min height px. @default 150 */
  height?: number;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Bold full-width gradient feature tile with a corner "open" arrow.
 */
export function FeatureCard(props: FeatureCardProps): JSX.Element;
