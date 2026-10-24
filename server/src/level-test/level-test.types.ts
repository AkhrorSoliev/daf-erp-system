export const LEVEL_TEST_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type LevelTestLevel = (typeof LEVEL_TEST_LEVELS)[number];

/** BEGINNER — A1 dan ham past: birinchi darajadan o'tmagan. */
export type LevelTestResult = 'BEGINNER' | LevelTestLevel;

export interface LevelTestQuestion {
  /** Barqaror id: `a1-007`. Qayta ishlatilmaydi, o'zgartirilmaydi. */
  id: string;
  level: LevelTestLevel;
  text: string;
  correct: string;
  wrong: readonly [string, string, string];
}

/** Bitta berilgan savol: variantlar aralashtirilgan, to'g'risi qayerdaligi ma'lum. */
export interface AskedQuestion {
  id: string;
  level: LevelTestLevel;
  text: string;
  options: string[];
  correctIndex: number;
}

export type CorrectByLevel = Partial<Record<LevelTestLevel, number>>;
