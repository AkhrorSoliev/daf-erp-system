import React from 'react';

export interface BottomSheetProps {
  /** Controls mount. @default true */
  open?: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export interface SheetActionProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  /** Text/icon color. @default 'ink' */
  tone?: 'ink' | 'coral' | 'teal' | 'grape' | 'danger';
  onClick?: (e: React.MouseEvent) => void;
}

/** Bottom sheet that slides up over a scrim — action lists, pickers, language select. */
export function BottomSheet(props: BottomSheetProps): JSX.Element;
/** Convenience row for a BottomSheet action list. */
export function SheetAction(props: SheetActionProps): JSX.Element;
