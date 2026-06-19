import React from 'react';

export interface DialogProps {
  /** Controls mount. @default true */
  open?: boolean;
  onClose?: () => void;
  /** Sets icon medallion + accent. @default 'confirm' */
  variant?: 'confirm' | 'alert' | 'celebrate' | 'neutral';
  /** Icon node shown in the medallion. */
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Button stack (usually <Button block> elements). */
  actions?: React.ReactNode;
  /** Tap-scrim-to-close. @default true */
  dismissOnScrim?: boolean;
  style?: React.CSSProperties;
}

/**
 * Centered modal dialog over a scrim — confirm / alert / celebrate.
 * @startingPoint section="Overlay" subtitle="Centered modal dialog" viewport="430x520"
 */
export function Dialog(props: DialogProps): JSX.Element;
