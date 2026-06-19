import React from 'react';

export interface VideoProgress {
  /** [earned, total] stars. */
  stars: [number, number];
  /** [earned, total] coins. */
  coins: [number, number];
  /** Track fill percent. */
  pct: number;
}

export interface VideoLessonCardProps {
  /** @default '1-video' */
  title?: string;
  video?: VideoProgress;
  practice?: VideoProgress;
  onWatch?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/** Video lesson block — Video + Mashq progress rows and a watch CTA. */
export function VideoLessonCard(props: VideoLessonCardProps): JSX.Element;
