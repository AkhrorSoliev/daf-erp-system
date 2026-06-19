import React from 'react';

export interface ConversationRowProps {
  name: string;
  /** Last-message preview text. */
  preview?: string;
  /** Time label (e.g. "10:14"). */
  time?: string;
  /** Unread count; 0 hides the badge. @default 0 */
  unread?: number;
  src?: string;
  /** Show the green online dot. @default false */
  online?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/** A row in the chat/conversations list. */
export function ConversationRow(props: ConversationRowProps): JSX.Element;
