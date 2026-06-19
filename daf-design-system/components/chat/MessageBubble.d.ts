import React from 'react';

export interface MessageBubbleProps {
  children?: React.ReactNode;
  /** 'me' (coral, right) or 'them' (white, left). @default 'them' */
  side?: 'me' | 'them';
  /** Sender name, shown above incoming bubbles (group chats). */
  name?: string;
  /** Timestamp label under the bubble. */
  time?: string;
  /** Draw the pointed corner. @default true */
  tail?: boolean;
  style?: React.CSSProperties;
}

/** A single chat message bubble for the student-to-student chat. */
export function MessageBubble(props: MessageBubbleProps): JSX.Element;
