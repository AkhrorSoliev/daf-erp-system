/**
 * check-pg-version — READ-ONLY: PostgreSQL versiyasi va `range_agg` mavjudligi
 * (DaF markaz dizayni 9.3, 0-bosqich). Markaz so'rovi kunlik seanslarni
 * `tsrange` birlashmasi bilan qirqadi — bu PG 14+ da bor.
 *
 * Usage: npx ts-node --transpile-only scripts/check-pg-version.ts              (dev, server/.env)
 *        railway run npx ts-node --transpile-only scripts/check-pg-version.ts  (prod)
 */
import { PrismaClient } from '@prisma/client';
import { printHeader, run } from './lib/check-cli';

async function main(prisma: PrismaClient) {
  printHeader('PostgreSQL versiyasi va range_agg');
  const [{ version }] = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
  console.log(`  ${version}`);

  // Ikki kesishgan oraliq: 10:00–11:00 va 10:30–12:00 → birlashma 2 soat = 7200 s.
  // Bu aynan markaz so'rovidagi ifoda — u yerda ishlasa, bu yerda ham ishlaydi.
  const [{ soniya }] = await prisma.$queryRaw<{ soniya: number }[]>`
    SELECT FLOOR(COALESCE(SUM(EXTRACT(EPOCH FROM (upper(x) - lower(x)))), 0))::int AS soniya
    FROM unnest((
      SELECT range_agg(r) FROM (VALUES
        (tsrange('2026-01-01 10:00', '2026-01-01 11:00')),
        (tsrange('2026-01-01 10:30', '2026-01-01 12:00'))
      ) AS v(r)
    )) AS x
  `;
  const ok = soniya === 7200;
  console.log(`  range_agg birlashma: ${soniya} s ${ok ? '✓' : '✗ (7200 kutilgan)'}`);
  if (!ok) process.exitCode = 1;
}

run(main);
