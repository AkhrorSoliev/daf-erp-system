import React from 'react';

export interface CategoryCardProps {
  title: React.ReactNode;
  /** Trailing value — a count or a percent string. */
  value: React.ReactNode;
  /** Pastel surface tint. @default 'sky' */
  tone?: 'sky' | 'pink' | 'sand' | 'grape' | 'mint' | 'peach' | 'coral' | 'teal';
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Soft pastel category card — big title + trailing value box (count or %).
 * Used for the vocabulary buckets and unit sections.
 * @startingPoint section="Gamification" subtitle="Category count cards" viewport="430x260"
 */
export function CategoryCard(props: CategoryCardProps): JSX.Element;
