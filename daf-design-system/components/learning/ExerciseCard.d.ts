import React from 'react';

export interface ExerciseCardProps {
  /** Green type pill, e.g. "Choose Answer" / "Construct". @default 'Choose Answer' */
  type?: string;
  /** Amber skill pill, e.g. "GRAMMAR" / "LISTENING". @default 'GRAMMAR' */
  skill?: string;
  instruction: React.ReactNode;
  /** [earned, total] stars. @default [0,10] */
  stars?: [number, number];
  /** [earned, total] coins. @default [0,10] */
  coins?: [number, number];
  /** Completion percent. @default 0 */
  percent?: number;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Homework / practice exercise card — type + skill pills, instruction, reward
 * fractions, and a progress bar.
 * @startingPoint section="Learning" subtitle="Exercise / homework card" viewport="430x260"
 */
export function ExerciseCard(props: ExerciseCardProps): JSX.Element;
