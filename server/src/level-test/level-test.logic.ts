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
/** Darajadan o'tilgan hisoblanishi uchun nechta to'g'ri kerak (5 dan 4). */
export const PASS_MARK = 4;
/** Bir urinishdagi savollar soni: hamma 4 darajadan 5 tadan. */
export const TOTAL_QUESTIONS = LEVEL_TEST_LEVELS.length * QUESTIONS_PER_LEVEL;
/** Qolgan vaqt chizig'i shuncha soniyada bir yangilanadi (Telegram tahrir cheklovi). */
export const TICK_SECONDS = 5;

/**
 * Savolga beriladigan vaqt (soniya), daraja bo'yicha: yuqori darajada savol
 * murakkabroq va o'qishga ko'proq vaqt ketadi. Bitta jadval, o'zgartirish oson.
 */
export const SECONDS_PER_LEVEL: Record<LevelTestLevel, number> = {
  A1: 20,
  A2: 30,
  B1: 40,
  B2: 50,
};
/** Tarmoq va Telegram kechikishi uchun: bu soniyada kelgan javob hali o'tadi. */
export const GRACE_SECONDS = 3;
/** Ketma-ket shuncha savolga javob berilmasa, odam ketgan deb test to'xtatiladi. */
export const MAX_TIMEOUTS_IN_ROW = 3;

export type Rng = () => number;

export const secondsFor = (level: LevelTestLevel): number =>
  SECONDS_PER_LEVEL[level];

/** Savol ko'rsatilgan paytdan `deadlineAt` (ms) va kechikish muhlati o'tdimi. */
export function isPastDeadline(deadlineAt: number, now: number): boolean {
  return now > deadlineAt + GRACE_SECONDS * 1000;
}

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
 * Natija qoidasi. Test HAMMA darajadan so'raydi (A1 → B2), natija esa oxirida
 * shu yerda aytiladi: darajalar tartibida, har birida `PASS_MARK` to'g'ri kerak.
 * Birinchi o'tilmagan darajadan oldingi daraja — natija, A1 dan o'tilmagan
 * bo'lsa — BEGINNER. Undan yuqoridagi darajalardagi to'g'ri javoblar hisobga
 * olinmaydi: taxmin bilan tasodifan topilgan javob darajani ko'tarmasligi uchun.
 */
export function judge(correct: CorrectByLevel): LevelTestResult {
  let result: LevelTestResult = 'BEGINNER';
  for (const level of LEVEL_TEST_LEVELS) {
    if ((correct[level] ?? 0) < PASS_MARK) return result;
    result = level;
  }
  return result;
}

export function nextLevel(level: LevelTestLevel): LevelTestLevel | null {
  const i = LEVEL_TEST_LEVELS.indexOf(level);
  return LEVEL_TEST_LEVELS[i + 1] ?? null;
}
