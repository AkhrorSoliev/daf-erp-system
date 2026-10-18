import type { Prisma } from '@prisma/client';

/** One `DafStudentDay` row's share of the week: who, and how many points. */
export type HaftaQatori = { studentId: number; points: number };

/**
 * A stand-in for `$queryRaw` that answers the two centre-ranking queries of
 * `FortschrittService` (`/* zentrum-top *\/`, `/* zentrum-rank *\/`).
 *
 * A fake cannot run SQL, so this is the reference implementation of what the
 * SQL means, written from the rules (spec §4) and not from the service:
 * sum each student's week, add the caller with 0 when absent, order by
 * points DESC then studentId ASC. The bound values are read the way the
 * service binds them: `[companyId, montagTag, studentId, …, last]`, where
 * `last` is the TOP limit (top) or the points to subtract (rank).
 *
 * `week(companyId, montagTag)` returns the rows the SQL's `WHERE` would see.
 * The real SQL is checked against a brute-force ranking on the load-test
 * database by `scripts/load/daf-yuklama-paritet.ts`.
 */
export function zentrumQueryRaw(
  week: (companyId: number, montagTag: string) => HaftaQatori[],
) {
  return jest.fn((sql: Prisma.Sql) => Promise.resolve(answer(sql)));

  function answer(sql: Prisma.Sql): unknown[] {
    const [companyId, montagTag, me] = sql.values as [number, string, number];
    const last = sql.values[sql.values.length - 1] as number;

    const totals = new Map<number, number>();
    for (const r of week(companyId, montagTag))
      totals.set(r.studentId, (totals.get(r.studentId) ?? 0) + r.points);
    if (!totals.has(me)) totals.set(me, 0);

    if (sql.strings[0].includes('/* zentrum-top */')) {
      return [...totals]
        .sort(([a, pa], [b, pb]) => pb - pa || a - b)
        .map(([studentId, punkte], i) => ({ studentId, punkte, platz: i + 1 }))
        .filter((r) => r.platz <= last || r.studentId === me);
    }
    if (sql.strings[0].includes('/* zentrum-rank */')) {
      const own = totals.get(me)!;
      const platz = (p: number) =>
        1 +
        [...totals].filter(
          ([id, q]) => id !== me && (q > p || (q === p && id < me)),
        ).length;
      return [
        {
          punkte: own,
          hozir: platz(own),
          oldin: platz(Math.max(0, own - last)),
        },
      ];
    }
    throw new Error(`unexpected $queryRaw: ${sql.strings[0].slice(0, 40)}`);
  }
}
