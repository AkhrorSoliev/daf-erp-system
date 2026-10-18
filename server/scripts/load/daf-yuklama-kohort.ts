import { Prisma } from '@prisma/client';

/**
 * LOCAL ONLY. The S2 load test splits the 5 000 students that have attempts
 * into cohorts by `(row_number over id) % 10`, so the three load scripts (S2
 * seed, measurement, parity) agree on who is who without a marker column.
 *
 *  DUE      — 20 words due now: `fortschritt` skips the open-lesson query.
 *  OCHIQ    — no word state at all: 0 due words, an open lesson exists (the
 *             lesson query stops at the first hit).
 *  TUGAGAN  — no word state, every lesson done: 0 due words and NO open
 *             lesson, so the lesson query runs to the end.
 *  TOLIQ    — 105-day streak, every word known, all reachable badges already
 *             granted: each session end is `INSERT … ON CONFLICT` with
 *             nothing new.
 *  QISMAN   — 8-day streak, 60 words, three badges already granted.
 *  YANGI    — 105-day streak, 320 words, NO badge yet: the first session end
 *             really inserts rows.
 */
export const KOHORT = {
  DUE: [0, 1, 2],
  OCHIQ: [5, 6],
  TUGAGAN: [8],
  TOLIQ: [3],
  QISMAN: [7],
  YANGI: [4, 9],
} as const;

export type KohortNomi = keyof typeof KOHORT;

/** `SELECT id, "companyId", k` over the first 5 000 live students. */
export const KOHORT_SQL = Prisma.sql`
  SELECT s.id, s."companyId", ((s.rn - 1) % 10)::int AS k
  FROM (
    SELECT id, "companyId", row_number() OVER (ORDER BY id) AS rn
    FROM (
      SELECT id, "companyId" FROM "Student"
      WHERE "deletedAt" IS NULL ORDER BY id LIMIT 5000
    ) f
  ) s`;

/** Current ACTIVE group, newest enrollment first — as the seed and the writer see it. */
export const GROUP_OF = Prisma.sql`
  (SELECT "groupId" FROM "Enrollment" e
   WHERE e."studentId" = c.id AND e.status = 'ACTIVE'
   ORDER BY e."createdAt" DESC LIMIT 1)`;

export interface KohortStudent {
  id: number;
  companyId: number;
  groupId: string | null;
}

/**
 * `n` random students of the cohort; with `badgeSiz` only those with no badge
 * row yet (the YANGI cohort is fresh only until it has been measured once).
 */
export async function kohortOl(
  prisma: {
    $queryRaw: <T>(q: Prisma.Sql) => Promise<T>;
  },
  nomi: KohortNomi,
  n: number,
  badgeSiz = false,
): Promise<KohortStudent[]> {
  const ks = [...KOHORT[nomi]];
  return prisma.$queryRaw<KohortStudent[]>(Prisma.sql`
    SELECT c.id, c."companyId", ${GROUP_OF} AS "groupId"
    FROM (${KOHORT_SQL}) c
    WHERE c.k = ANY(${ks}::int[])
      ${
        badgeSiz
          ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "DafStudentBadge" b WHERE b."studentId" = c.id)`
          : Prisma.empty
      }
    ORDER BY random() LIMIT ${n}`);
}
