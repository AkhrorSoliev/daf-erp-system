import React from 'react';

export interface WordCardProps {
  /** Language flag emoji. @default '🇬🇧' */
  flag?: string;
  /** Part-of-speech / language label (e.g. "Olmosh"). @default 'Olmosh' */
  lang?: string;
  /** The word/term. */
  term?: string;
  /** IPA pronunciation, e.g. "/juː/". */
  ipa?: string;
  /** Example sentence (shown italic, quoted). */
  example?: string;
  audioOnly?: boolean;
  /** Show + handle the audio button. */
  onAudio?: () => void;
  /** Show + handle the translate toggle on the example. */
  onTranslate?: () => void;
  style?: React.CSSProperties;
}

/**
 * Vocabulary flashcard — flag, term, IPA, audio, example with translate toggle.
 * @startingPoint section="Learning" subtitle="Vocabulary flashcard" viewport="430x300"
 */
export function WordCard(props: WordCardProps): JSX.Element;
