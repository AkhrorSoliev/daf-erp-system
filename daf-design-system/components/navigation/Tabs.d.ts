import React from 'react';

export interface TabItem { label: string; value: string; }

export interface TabsProps {
  /** {label,value} objects or plain strings. */
  items: Array<TabItem | string>;
  value?: string;
  onChange?: (value: string) => void;
  /** Style for placement on a colored header (white selected pill). @default false */
  onColor?: boolean;
  style?: React.CSSProperties;
}

/** Horizontally scrollable category tabs with a solid selected pill. */
export function Tabs(props: TabsProps): JSX.Element;
