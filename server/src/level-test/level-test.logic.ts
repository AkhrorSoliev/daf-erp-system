import {
  LEVEL_TEST_LEVELS,
  type AskedQuestion,
  type CorrectByLevel,
  type LevelTestLevel,
  type LevelTestQuestion,
  type LevelTestResult,
} from './level-test.types';

/** Har darajadan nechta savol beriladi. */
export const QUESTIONS_PER_LEVEL = 5;
/** Keyingi darajaga o'tish uchun darajadan nechta to'g'ri kerak (5 dan 4). */
export const PASS_MARK = 4;

export type Rng = () => number;

/** Fisher–Yates; `rng` berilmasa `Math.random`. Kirishni o'zgartirmaydi. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Darajadan `count` ta savol tanlaydi: avval odam hali ko'rmaganlar, ular
 * yetmasa — ko'rilganlardan to'ldiriladi (havza tugagan odamga baribir test
 * chiqishi kerak).
 */
export function pickQuestions(
  pool: readonly LevelTestQuestion[],
  level: LevelTestLevel,
  seen: ReadonlySet<string>,
  count: number = QUESTIONS_PER_LEVEL,
  rng: Rng = Math.random,
): LevelTestQuestion[] {
  const ofLevel = pool.filter((q) => q.level === level);
  const fresh = shuffle(
    ofLevel.filter((q) => !seen.has(q.id)),
    rng,
  );
  if (fresh.length >= count) return fresh.slice(0, count);
  const repeats = shuffle(
    ofLevel.filter((q) => seen.has(q.id)),
    rng,
  );
  return [...fresh, ...repeats].slice(0, count);
}

/** Variantlarni aralashtiradi va to'g'ri javob o'rnini aytadi. */
export function askQuestion(
  q: LevelTestQuestion,
  rng: Rng = Math.random,
): AskedQuestion {
  const options = shuffle([q.correct, ...q.wrong], rng);
  return {
    id: q.id,
    level: q.level,
    text: q.text,
    options,
    correctIndex: options.indexOf(q.correct),
  };
}

/**
 * Natija qoidasi: darajalar A1 → B2 tartibida, har birida `PASS_MARK` to'g'ri
 * kerak. Birinchi o'tmagan darajadan oldingi daraja — natija; A1 dan o'tmagan
 * bo'lsa — BEGINNER.
 */
export function judge(correct: CorrectByLevel): LevelTestResult {
  let result: LevelTestResult = 'BEGINNER';
  for (const level of LEVEL_TEST_LEVELS) {
    if ((correct[level] ?? 0) < PASS_MARK) return result;
    result = level;
  }
  return result;
}

/** Daraja tugagach: keyingisiga o'tish mumkinmi (aks holda test tugaydi). */
export function levelPassed(correctInLevel: number): boolean {
  return correctInLevel >= PASS_MARK;
}

export function nextLevel(level: LevelTestLevel): LevelTestLevel | null {
  const i = LEVEL_TEST_LEVELS.indexOf(level);
  return LEVEL_TEST_LEVELS[i + 1] ?? null;
}
