import { TOTAL_QUESTIONS } from './level-test.logic';

/** Boshlangan, lekin bundan eski va tugamagan test — "tashlab ketilgan". */
export const IDLE_AFTER_MS = 60 * 60 * 1000;

export type LevelTestDisplayStatus =
  | 'RUNNING'
  | 'ABANDONED'
  | 'COMPLETED'
  | 'STOPPED'
  | 'TIMED_OUT'
  | 'CANCELLED';

type DbStatus =
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'STOPPED'
  | 'TIMED_OUT'
  | 'CANCELLED';

/**
 * Bazadagi `IN_PROGRESS` ikki xil bo'ladi: hozir yechilayotgani va odam
 * tashlab ketgani (hech qachon yopilmaydi). Ajratish vaqt bo'yicha.
 */
export function displayStatus(
  status: DbStatus,
  createdAt: Date,
  now: Date,
): LevelTestDisplayStatus {
  if (status !== 'IN_PROGRESS') return status;
  return now.getTime() - createdAt.getTime() > IDLE_AFTER_MS
    ? 'ABANDONED'
    : 'RUNNING';
}

export interface StatRow {
  chatId: string;
  status: DbStatus;
  result: string | null;
  answered: number;
  createdAt: Date;
  studentId: number | null;
  leadId: string | null;
}

export const RESULT_KEYS = [
  'BEGINNER',
  'A1',
  'A2',
  'B1',
  'B2',
  'UNKNOWN',
] as const;
export type ResultKey = (typeof RESULT_KEYS)[number];

export interface LevelTestStats {
  /** Boshlangan urinishlar va ulardagi har xil odamlar (chat) soni. */
  started: number;
  people: number;
  /** Holatlar bo'yicha (yig'indisi `started`). */
  finished: number;
  stopped: number;
  timedOut: number;
  cancelled: number;
  abandoned: number;
  running: number;
  /** Natija chiqqan urinishlar (tugatgan + o'zi to'xtatgan) darajalar bo'yicha. */
  byResult: Record<ResultKey, number>;
  /**
   * 20 savolga yetmay to'xtaganlar nechta savolda qolgan: 20 tadan kamini
   * yechgan urinishlar (to'xtatgan, javobsiz, bekor qilgan, tashlab ketgan).
   */
  dropOff: { to5: number; to10: number; to15: number; to19: number };
  /** O'quvchilar (chat kartaga bog'langan) va boshqalar (lid oqimi). */
  students: number;
  others: number;
  /** Telefon qoldirib lidga aylanganlar. */
  leads: number;
  total: number;
}

const emptyByResult = (): Record<ResultKey, number> => ({
  BEGINNER: 0,
  A1: 0,
  A2: 0,
  B1: 0,
  B2: 0,
  UNKNOWN: 0,
});

/** Oy bo'yicha urinishlar qatoridan umumiy ko'rsatkichlar. Sof funksiya. */
export function summarize(rows: StatRow[], now: Date): LevelTestStats {
  const stats: LevelTestStats = {
    started: rows.length,
    people: new Set(rows.map((r) => r.chatId)).size,
    finished: 0,
    stopped: 0,
    timedOut: 0,
    cancelled: 0,
    abandoned: 0,
    running: 0,
    byResult: emptyByResult(),
    dropOff: { to5: 0, to10: 0, to15: 0, to19: 0 },
    students: 0,
    others: 0,
    leads: 0,
    total: TOTAL_QUESTIONS,
  };

  for (const r of rows) {
    const s = displayStatus(r.status, r.createdAt, now);
    if (s === 'COMPLETED') stats.finished += 1;
    else if (s === 'STOPPED') stats.stopped += 1;
    else if (s === 'TIMED_OUT') stats.timedOut += 1;
    else if (s === 'CANCELLED') stats.cancelled += 1;
    else if (s === 'ABANDONED') stats.abandoned += 1;
    else stats.running += 1;

    if (r.result && r.result in stats.byResult) {
      stats.byResult[r.result as ResultKey] += 1;
    }
    // Hozir yechilayotgan test hali "to'xtamagan": hisobga olinmaydi.
    if (s !== 'COMPLETED' && s !== 'RUNNING' && r.answered < TOTAL_QUESTIONS) {
      if (r.answered < 5) stats.dropOff.to5 += 1;
      else if (r.answered < 10) stats.dropOff.to10 += 1;
      else if (r.answered < 15) stats.dropOff.to15 += 1;
      else stats.dropOff.to19 += 1;
    }
    if (r.studentId !== null) stats.students += 1;
    else stats.others += 1;
    if (r.leadId !== null) stats.leads += 1;
  }
  return stats;
}
