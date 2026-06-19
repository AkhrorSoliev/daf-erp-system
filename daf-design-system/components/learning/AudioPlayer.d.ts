import React from 'react';

export interface AudioPlayerProps {
  /** Elapsed time label. @default '00:15' */
  elapsed?: string;
  /** Total duration label. @default '00:00' */
  total?: string;
  /** Track fill percent. @default 18 */
  progress?: number;
  playing?: boolean;
  /** Play/pause toggle handler. */
  onToggle?: () => void;
  style?: React.CSSProperties;
}

/** Listening-exercise audio bar — scrubber, times, volume, play/pause, speed toggle. */
export function AudioPlayer(props: AudioPlayerProps): JSX.Element;
