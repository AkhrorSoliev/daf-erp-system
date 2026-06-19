import React from 'react';

export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  /** @default 'text' */
  type?: string;
  iconBefore?: React.ReactNode;
  error?: string;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
}

/** Rounded text field with optional label, leading icon, and error state. */
export function Input(props: InputProps): JSX.Element;
