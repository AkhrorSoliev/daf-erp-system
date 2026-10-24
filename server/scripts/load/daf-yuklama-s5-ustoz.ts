/**
 * LOCAL ONLY. S5 teacher view (spec S5 §7): parity of `MusobaqaUstozService`
 * against a brute force over `DafStudentDay`/`Enrollment` for up to 200
 * groups (current week and last week), and `guruh.ball` against the S3
 * `guruhlarYigindisi`; the Task 2 probe (`azolarKunlari` returns `tage` as an
 * array, numbers as numbers); then 50 parallel requests × ROUNDS over random
 * groups: p50 / p95 (limit 200 ms). Exit 1 on any difference or when the limit
 * is crossed. Sends nothing anywhere.
 */
import { loadavg } from 'os';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import {
  addDaysToDateStr,
  tashkentDateStr,
} from '../../src/common/date/tashkent';
import { serieAus, wochenStartTag } from '../../src/daf/uebung/punkte';
import { guruhlarYigindisi } from '../../src/daf/liga/guruhlar-jadvali';
import { MusobaqaUstozService } from '../../src/daf/ustoz/musobaqa-ustoz.service';
import { azolarKunlari } from '../../src/daf/ustoz/musobaqa-ustoz.sql';

assertLocalDb();

const NAMUNA = 200;
const PARALLEL = 50;
const ROUNDS = 10;
const CHEGARA_MS = 200;
const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[
    Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))
  ];

run(async (prisma) => {
  const db = prisma as any;
  const servis = new MusobaqaUstozService(prisma as never);
  const jetzt = new Date();
  const bugun = tashkentDateStr(jetzt);
  const joriy = wochenStartTag(jetzt);
  const otgan = addDaysToDateStr(joriy, -7);
  const xatolar: string[] = [];

  const guruhlar: { groupId: string; companyId: number }[] =
    await db.$queryRaw`SELECT g.id AS "groupId", g."companyId"
      FROM "Group" g WHERE g."statusEnum" = 'ACTIVE' AND g."deletedAt" IS NULL
      ORDER BY random() LIMIT ${NAMUNA}`;
  if (guruhlar.length === 0) throw new Error('faol guruh yo‘q — baza bo‘sh');

  let tekshirilgan = 0;
  let kunlarProbi = 0;
  for (const { groupId, companyId } of guruhlar) {
    const s3 = await guruhlarYigindisi(prisma, companyId, joriy);
    const azolar = await prisma.enrollment.findMany({
      where: { groupId, status: 'ACTIVE' },
      distinct: ['studentId'],
      select: { studentId: true },
    });
    const ids = azolar.map((a) => a.studentId);
    if (ids.length) {
      const k = await azolarKunlari(prisma, companyId, ids, bugun);
      kunlarProbi += k.length;
      if (
        !k.every(
          (r) =>
            Array.isArray(r.tage) &&
            r.tage.every((t) => typeof t === 'string') &&
            typeof r.bugunBali === 'number',
        )
      )
        xatolar.push(`${groupId}: azolarKunlari tage massiv emas`);
    }
    const kunlar = ids.length
      ? await prisma.dafStudentDay.findMany({
          where: {
            studentId: { in: ids },
            day: {
              gte: new Date(`${addDaysToDateStr(bugun, -400)}T00:00:00Z`),
            },
          },
          select: {
            studentId: true,
            day: true,
            groupKey: true,
            points: true,
            attempts: true,
          },
        })
      : [];
    const kunStr = (d: Date) => d.toISOString().slice(0, 10);
    for (const hafta of [joriy, otgan]) {
      const keyingi = addDaysToDateStr(hafta, 7);
      const r = await servis.guruhKorinishi(groupId, companyId, hafta, jetzt);
      let jamiGuruh = 0;
      for (const id of ids) {
        const q = r.oquvchilar.find((x) => x.studentId === id);
        if (!q) {
          xatolar.push(`${groupId}/${hafta}: ${id} qatorda yo‘q`);
          continue;
        }
        const mine = kunlar.filter((k) => k.studentId === id);
        const haftada = mine.filter(
          (k) => kunStr(k.day) >= hafta && kunStr(k.day) < keyingi,
        );
        const guruhBali = haftada
          .filter((k) => k.groupKey === groupId)
          .reduce((s, k) => s + k.points, 0);
        const jami = haftada.reduce((s, k) => s + k.points, 0);
        const faolKun = new Set(
          haftada.filter((k) => k.attempts > 0).map((k) => kunStr(k.day)),
        ).size;
        const tage = [
          ...new Set(
            mine.filter((k) => k.attempts > 0).map((k) => kunStr(k.day)),
          ),
        ];
        jamiGuruh += guruhBali;
        const kutilgan = {
          guruhBali,
          jamiBall: jami,
          faolKunlar: faolKun,
          seriya: hafta === joriy ? serieAus(tage, bugun) : null,
        };
        const bor = {
          guruhBali: q.guruhBali,
          jamiBall: q.jamiBall,
          faolKunlar: q.faolKunlar,
          seriya: q.seriya,
        };
        if (JSON.stringify(kutilgan) !== JSON.stringify(bor))
          xatolar.push(
            `${groupId}/${hafta}/${id}: ${JSON.stringify(bor)} ≠ ${JSON.stringify(kutilgan)}`,
          );
      }
      if (r.oquvchilar.length !== ids.length)
        xatolar.push(
          `${groupId}/${hafta}: a'zolar ${r.oquvchilar.length} ≠ ${ids.length}`,
        );
      if (hafta === joriy) {
        const oz = s3.find((x) => x.groupId === groupId);
        if (oz && oz.ball !== jamiGuruh)
          xatolar.push(
            `${groupId}: S3 ball ${oz.ball} ≠ a'zolar yig'indisi ${jamiGuruh}`,
          );
        if (oz && oz.ball !== r.guruh.ball)
          xatolar.push(
            `${groupId}: karta ball ${r.guruh.ball} ≠ S3 ${oz.ball}`,
          );
      }
      tekshirilgan++;
    }
  }

  // --- yuklama: 50 parallel × ROUNDS ---
  const t0load = loadavg()[0];
  const vaqtlar: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        const g = guruhlar[Math.floor(Math.random() * guruhlar.length)];
        const t = performance.now();
        await servis.guruhKorinishi(
          g.groupId,
          g.companyId,
          undefined,
          new Date(),
        );
        vaqtlar.push(performance.now() - t);
      }),
    );
  }
  const p50 = pct(vaqtlar, 50);
  const p95 = pct(vaqtlar, 95);
  console.log(
    `parity: ${tekshirilgan} guruh-hafta, farq ${xatolar.length}; azolarKunlari probi: ${kunlarProbi} qator`,
  );
  console.log(
    `yuklama: p50 ${p50.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (limit ${CHEGARA_MS}), loadavg ${t0load.toFixed(1)}`,
  );
  if (xatolar.length) {
    console.error(xatolar.slice(0, 20).join('\n'));
    process.exit(1);
  }
  if (p95 > CHEGARA_MS) {
    console.error('p95 chegaradan oshdi');
    process.exit(1);
  }
});
