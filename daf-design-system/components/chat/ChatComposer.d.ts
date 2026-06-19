import React from 'react';

export interface ChatComposerProps {
  placeholder?: string;
  /** Called with the trimmed message text on send. */
  onSend?: (text: string) => void;
  /** Show the attach (paperclip) button. @default true */
  attach?: boolean;
  style?: React.CSSProperties;
}

/** Bottom chat input bar with a rounded field and coral send button. */
export function ChatComposer(props: ChatComposerProps): JSX.Element;
