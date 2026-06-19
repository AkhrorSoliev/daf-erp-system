import React from 'react';

export interface BottomNavItem {
  value: string;
  label: string;
  icon: React.ReactNode;
  /** Optional filled variant shown when active. */
  iconActive?: React.ReactNode;
}

/**
 * Floating pill tab bar.
 * @startingPoint section="Navigation" subtitle="Floating tab bar" viewport="700x300"
 */
export interface BottomNavProps {
  items: BottomNavItem[];
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}

/**
 * Floating pill tab bar; active tab collapses to a solid coral circle.
 */
export function BottomNav(props: BottomNavProps): JSX.Element;
