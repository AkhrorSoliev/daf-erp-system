import React from 'react';

export interface LessonNodeProps {
  /** @default 'Unit 1.1' */
  label?: string;
  /** 0–100 completion shown big. @default 0 */
  percent?: number;
  /** @default 'locked' */
  state?: 'locked' | 'active' | 'done';
  /** Square px. @default 132 */
  size?: number;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/** Chunky rounded unit tile for the lesson path map. */
export function LessonNode(props: LessonNodeProps): JSX.Element;
