/**
 * READ-ONLY. Compares DafStudentDay with the totals rebuilt from DafAttempt
 * (ADR-0111). Exits 1 on any difference.
 *
 *   railway run --service caring-courage --environment production npx ts-node --transpile-only scripts/audit-daf-student-day.ts
 */
import { run, dbEnvLabel } from './lib/check-cli';
import { DIFF_SQL } from './lib/daf-student-day-sql';

run(async (prisma) => {
  console.log('DB:', dbEnvLabel());
  const rows = await prisma.$queryRaw<
    {
      studentId: number;
      day: string;
      groupKey: string;
      expectedPoints: number | null;
      actualPoints: number | null;
      expectedAttempts: number | null;
      actualAttempts: number | null;
    }[]
  >(DIFF_SQL);
  if (rows.length === 0) {
    console.log('Farq 0 — kunlik jadval urinishlar bilan mos.');
    return;
  }
  console.table(rows.slice(0, 50));
  console.error(`Farq: ${rows.length} qator (eng ko'pi 1000 ko'rsatiladi).`);
  process.exitCode = 1;
});
