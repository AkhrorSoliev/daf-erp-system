import React from 'react';

export interface ListRowProps {
  icon?: React.ReactNode;
  /** Soft tile color behind the icon. @default 'grape' */
  iconTone?: 'grape' | 'coral' | 'amber' | 'teal' | 'ink';
  label: React.ReactNode;
  /** Trailing node before the chevron (badge, switch, value). */
  trailing?: React.ReactNode;
  /** @default true */
  chevron?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/** White rounded settings/menu row with a soft icon tile and trailing chevron. */
export function ListRow(props: ListRowProps): JSX.Element;
