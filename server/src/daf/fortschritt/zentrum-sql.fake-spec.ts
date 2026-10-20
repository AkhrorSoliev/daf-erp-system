import type { Prisma } from '@prisma/client';

/** One `DafStudentDay` row as the SQL sees it (`day` is the Tashkent date). */
export type KunQatori = {
  studentId: number;
  companyId: number;
  day: string; // YYYY-MM-DD
  points: number;
  attempts: number;
};

/**
 * A stand-in for `$queryRaw` that answers the two raw queries of
 * `FortschrittService`: `/* zentrum-top *\/` (the centre table) and
 * `/* oquvchi-raqamlari *\/` (the student's own figures).
 *
 * A fake cannot run SQL, so this is the reference implementation of what the
 * SQL means, written from the rules (spec §4) and not from the service:
 * the week = the company's rows from the Monday, summed per student, the
 * caller added with 0 when absent, ordered by points DESC then studentId ASC;
 * the lifetime total = all the caller's rows; the streak days = the caller's
 * days with attempts > 0; today's attempts = the caller's rows of today. Today's points likewise; the goal level is the caller's DafStudentSetting row (null = none).
 *
 * Bound values are read the way the service binds them:
 * `[companyId, montagTag, studentId, …]`, and last the TOP limit (top) or
 * `minus, heuteTag` (own figures).
 *
 * The real SQL is checked against a brute-force ranking on the load-test
 * database by `scripts/load/daf-yuklama-paritet.ts`.
 */
export function zentrumQueryRaw(
  rows: () => KunQatori[],
  dailyGoal: () => string | null = () => null,
  /** S4: `remindersEnabled` (qator yo'q = true) va kartaning botga ulanganligi. */
  eslatma: () => { eslatmalar: boolean; telegramUlangan: boolean } = () => ({
    eslatmalar: true,
    telegramUlangan: false,
  }),
) {
  return jest.fn((sql: Prisma.Sql) => Promise.resolve(answer(sql)));

  function answer(sql: Prisma.Sql): unknown[] {
    const v = sql.values;
    const [companyId, montagTag, me] = v as [number, string, number];
    const all = rows();

    const totals = new Map<number, number>();
    for (const r of all)
      if (r.companyId === companyId && r.day >= montagTag)
        totals.set(r.studentId, (totals.get(r.studentId) ?? 0) + r.points);
    if (!totals.has(me)) totals.set(me, 0);

    if (sql.strings[0].includes('/* zentrum-top */')) {
      const limit = v[v.length - 1] as number;
      return [...totals]
        .sort(([a, pa], [b, pb]) => pb - pa || a - b)
        .map(([studentId, punkte], i) => ({ studentId, punkte, platz: i + 1 }))
        .filter((r) => r.platz <= limit || r.studentId === me);
    }
    if (sql.strings[0].includes('/* oquvchi-raqamlari */')) {
      const [minus, heuteTag] = v.slice(-2) as [number, string];
      const own = totals.get(me)!;
      const platz = (p: number) =>
        1 +
        [...totals].filter(
          ([id, q]) => id !== me && (q > p || (q === p && id < me)),
        ).length;
      const mine = all.filter((r) => r.studentId === me);
      return [
        {
          punkte: own,
          hozir: platz(own),
          oldin: platz(Math.max(0, own - minus)),
          gesamt: mine.reduce((s, r) => s + r.points, 0),
          tage: [
            ...new Set(mine.filter((r) => r.attempts > 0).map((r) => r.day)),
          ],
          heuteAttempts: mine
            .filter((r) => r.day === heuteTag)
            .reduce((s, r) => s + r.attempts, 0),
          heutePunkte: mine
            .filter((r) => r.day === heuteTag)
            .reduce((s, r) => s + r.points, 0),
          dailyGoal: dailyGoal(),
          ...eslatma(),
        },
      ];
    }
    throw new Error(`unexpected $queryRaw: ${sql.strings[0].slice(0, 40)}`);
  }
}
