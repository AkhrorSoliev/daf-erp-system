import React from 'react';

export interface SwitchProps {
  checked?: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
  /** @default 'md' */
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

/** On/off toggle — green track when on, bouncy knob. */
export function Switch(props: SwitchProps): JSX.Element;
