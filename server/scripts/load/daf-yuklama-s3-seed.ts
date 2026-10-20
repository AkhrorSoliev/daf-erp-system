/**
 * LOCAL ONLY. S3 league data for the load test (spec S3 §7), AFTER
 * `daf-yuklama-s2-seed.ts`: tiers spread over all five leagues and LAST
 * week's rooms for the first 5 000 students — all but cohort TUGAGAN, left
 * out so the measurement has students who join a room at their first
 * session. Rooms and memberships go through the module's own `joinRoom`;
 * the tier rows are the one raw write `liga.single-source.spec.ts` allows.
 *
 * Run once per fresh DB: it refuses when league rooms exist.
 */
import { Prisma } from '@prisma/client';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { KOHORT, KOHORT_SQL } from './daf-yuklama-kohort';
import { joinRoom } from '../../src/daf/liga/liga-xona';

assertLocalDb();

const ISHCHI = 20;

run(async (prisma) => {
  if ((await prisma.dafLeagueRoom.count()) > 0) {
    throw new Error('Liga ma`lumoti allaqachon bor. Bazani qayta yarating.');
  }
  // ~20% each tier, independent of the cohort index.
  const darajalar = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "DafStudentLeague" ("studentId", "companyId", "tier", "updatedAt")
    SELECT c.id, c."companyId", (c.id / 10) % 5, (now() AT TIME ZONE 'UTC')
    FROM (${KOHORT_SQL}) c
    ON CONFLICT ("studentId") DO NOTHING`);

  const list = await prisma.$queryRaw<{ id: number; companyId: number }[]>(
    Prisma.sql`SELECT c.id, c."companyId" FROM (${KOHORT_SQL}) c
               WHERE c.k <> ALL(${[...KOHORT.TUGAGAN]}::int[]) ORDER BY c.id`,
  );
  // A moment of last week (Tashkent): `joinRoom` puts it in that week's rooms.
  const otganHafta = new Date(Date.now() - 7 * 86_400_000);
  let i = 0;
  await Promise.all(
    Array.from({ length: ISHCHI }, async () => {
      while (i < list.length) {
        const s = list[i++];
        await joinRoom(prisma as any, s.id, s.companyId, otganHafta);
      }
    }),
  );

  for (const t of ['DafStudentLeague', 'DafLeagueRoom', 'DafLeagueEntry']) {
    await prisma.$executeRaw(Prisma.sql`ANALYZE ${Prisma.raw(`"${t}"`)}`);
  }
  const xonalar = await prisma.$queryRaw<
    { tier: number; xonalar: number; azolar: number; eng: number }[]
  >`SELECT tier, COUNT(*)::int AS xonalar, SUM(n)::int AS azolar, MAX(n)::int AS eng
    FROM (SELECT r.tier, COUNT(e.id) AS n FROM "DafLeagueRoom" r
          JOIN "DafLeagueEntry" e ON e."roomId" = r.id GROUP BY r.id, r.tier) x
    GROUP BY tier ORDER BY tier`;
  console.log({ darajalar, qoshildi: list.length, xonalar });
  if (
    xonalar.reduce((s, x) => s + x.azolar, 0) !== list.length ||
    xonalar.some((x) => x.eng > 30)
  ) {
    process.exitCode = 1;
  }
});
