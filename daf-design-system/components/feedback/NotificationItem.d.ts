import React from 'react';

export interface NotificationItemProps {
  /** Sets the icon-tile color. @default 'system' */
  type?: 'achievement' | 'battle' | 'social' | 'lesson' | 'system';
  /** Icon node (Phosphor/SVG) shown in the tile. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** Secondary description line. */
  body?: React.ReactNode;
  /** Relative time label (e.g. "5 daqiqa oldin"). */
  time?: React.ReactNode;
  /** Read state → flat, muted, no dot. @default false */
  read?: boolean;
  /** Just-received → coral "YANGI" pill. @default false */
  isNew?: boolean;
  /** High-priority → amber accent bar + "MUHIM" pill + tinted surface. @default false */
  priority?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Notification row covering unread / read / new / priority states with a
 * type-colored icon tile and trailing unread dot.
 * @startingPoint section="Feedback" subtitle="Notification states" viewport="700x200"
 */
export function NotificationItem(props: NotificationItemProps): JSX.Element;
