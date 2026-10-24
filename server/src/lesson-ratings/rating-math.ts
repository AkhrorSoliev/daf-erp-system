import { LOW_SCORE_MAX } from './rating-rules';

export interface RatingRow {
  score: number | null;
  /** Xabar o'quvchiga yetgan (`messageId` bor). */
  delivered: boolean;
  teacherIds: number[];
  /** Past baho ostida izoh yozilgan. */
  commented?: boolean;
}

export interface RatingTotals {
  /** Faqat baho qo'yilganlar bo'yicha, bir xona; baho yo'q — null. */
  average: number | null;
  rated: number;
  delivered: number;
  /** rated / delivered, foizda, bir xona; yetkazilgan yo'q — null. */
  responseRate: number | null;
  low: number;
  /** Izoh yozilgan qatorlar soni. */
  commented: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function totalsOf(rows: RatingRow[]): RatingTotals {
  let sum = 0;
  let rated = 0;
  let delivered = 0;
  let low = 0;
  let commented = 0;
  for (const r of rows) {
    if (r.delivered) delivered += 1;
    if (r.commented === true) commented += 1;
    if (r.score === null) continue;
    rated += 1;
    sum += r.score;
    if (r.score <= LOW_SCORE_MAX) low += 1;
  }
  return {
    average: rated ? round1(sum / rated) : null,
    rated,
    delivered,
    responseRate: delivered ? round1((rated / delivered) * 100) : null,
    low,
    commented,
  };
}

/** Ikki ustozli dars ikkalasiga ham sanaladi (spec §6.2). */
export function byTeacher(rows: RatingRow[]): Map<number, RatingTotals> {
  const groups = new Map<number, RatingRow[]>();
  for (const r of rows) {
    for (const id of r.teacherIds) {
      const list = groups.get(id) ?? [];
      list.push(r);
      groups.set(id, list);
    }
  }
  return new Map([...groups].map(([id, list]) => [id, totalsOf(list)]));
}

/** Eng past o'rtacha tepada, bahosizlar oxirida. */
export function sortByAverage<T extends { average: number | null }>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    if (a.average === null) return b.average === null ? 0 : 1;
    if (b.average === null) return -1;
    return a.average - b.average;
  });
}

/** Index 0 = 1 baho soni … index 4 = 5 baho soni; bahosizlar sanalmaydi. */
export function scoreDistribution(rows: { score: number | null }[]): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const r of rows) {
    if (r.score !== null && r.score >= 1 && r.score <= 5)
      counts[r.score - 1] += 1;
  }
  return counts;
}

/**
 * Bahosi bor ustozlar ichida eng yuqori va eng past o'rtacha. Bitta ustoz
 * bo'lsa yoki hammasining o'rtachasi teng bo'lsa `worst` null (bir ustoz ikkala
 * qatorda turmasin); teng bo'lsa — birinchisi.
 */
export function bestAndWorst<T extends { average: number | null }>(
  teachers: T[],
): { best: T | null; worst: T | null } {
  const rated = teachers.filter(
    (t): t is T & { average: number } => t.average !== null,
  );
  if (!rated.length) return { best: null, worst: null };
  let best = rated[0];
  let worst = rated[0];
  for (const t of rated) {
    if (t.average > best.average) best = t;
    if (t.average < worst.average) worst = t;
  }
  return { best, worst: worst === best ? null : worst };
}
