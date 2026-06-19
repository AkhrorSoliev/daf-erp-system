import React from 'react';

export interface SegmentOption { label: string; value: string; }

export interface SegmentedControlProps {
  /** Array of {label,value} or plain strings. */
  options: Array<SegmentOption | string>;
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}

/** Pill segmented control with a sliding selected indicator. */
export function SegmentedControl(props: SegmentedControlProps): JSX.Element;
