import React from 'react';

export interface LeaderboardRowProps {
  rank: number;
  name: string;
  /** XP / star points shown in the trailing pill. */
  xp: React.ReactNode;
  src?: string;
  /** Outline as the current user's own row. @default false */
  highlight?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/** Ranked leaderboard row with avatar, name, and star-XP pill. */
export function LeaderboardRow(props: LeaderboardRowProps): JSX.Element;
