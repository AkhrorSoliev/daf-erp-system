import React from 'react';

export interface AvatarProps {
  src?: string;
  /** Used for initials fallback + alt text. */
  name?: string;
  /** Pixel diameter. @default 48 */
  size?: number;
  ring?: boolean;
  ringColor?: string;
  /** Small corner badge content (e.g. level number). */
  badge?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Circular avatar with initials fallback and optional ring + corner badge. */
export function Avatar(props: AvatarProps): JSX.Element;
