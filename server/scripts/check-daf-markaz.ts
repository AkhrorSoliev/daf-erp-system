/**
 * check-daf-markaz — READ-ONLY: markaz SQL yig'indisi guruh tabi ishlatadigan
 * TypeScript qoidasi bilan bir xil raqam beradimi (dizayn 9.4).
 *
 * Har (o'quvchi, kun) uchun: faolSoniya, radioSoniya, lernenSoniya, kirdi —
 * SQL `kunlikSeanslar` vs TS `kunlikYigindi()`. Farq (±1 s dan katta) = XATO,
 * exit code 1. Savollar: SQL (tugatilgan seanslar) vs TS `mashqNatijasi`
 * (urinishlar) — faqat KO'RSATILADI, qamrov farqi kutilgan (dizayn 3.5).
 *
 * Usage: npx ts-node --transpile-only scripts/check-daf-markaz.ts [n]            (dev, server/.env)
 *        railway run npx ts-node --transpile-only scripts/check-daf-markaz.ts 30  (prod)
 *
 * Bu faylni hech narsa import qilmaydi — `run(main)` yuklanishda ishga tushadi.
 */
import { PrismaClient } from '@prisma/client';
import { CenterAppActivityQueries } from '../src/app-activity/center/center-app-activity.queries';
import {
  kunlikYigindi,
  seansSatri,
} from '../src/app-activity/stats/kunlik-faollik';
import {
  mashqNatijasi,
  MashqUrinishi,
} from '../src/app-activity/stats/mashq-natijasi';
import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
  utcMidnightFromDateStr,
} from '../src/common/date/tashkent';
import { parseArgs, printHeader, printTable, run, section } from './lib/check-cli';

async function main(prisma: PrismaClient) {
  const { positional } = parseArgs();
  const n = Number(positional[0] ?? 30);
  const bugun = tashkentDateStr(new Date());
  const davrBoshi = addDaysToDateStr(bugun, -29);
  printHeader(`DaF markaz: SQL vs TS — ${n} o'quvchi, ${davrBoshi}..${bugun}`);

  // Faqat davrda seansi bor o'quvchilar — aks holda bo'sh qatorlar solishtiriladi.
  const nomzodlar = await prisma.$queryRaw<{ studentId: number; companyId: number }[]>`
    SELECT "studentId", "companyId" FROM (
      SELECT DISTINCT "studentId", "companyId" FROM "StudentAppSession"
      WHERE "day" >= ${davrBoshi}::date
    ) t ORDER BY random() LIMIT ${n}
  `;
  if (nomzodlar.length === 0) {
    console.log("  Davrda seans yo'q — solishtiradigan narsa yo'q.");
    return;
  }
  const companyId = nomzodlar[0].companyId;
  const ids = nomzodlar
    .filter((r) => r.companyId === companyId)
    .map((r) => r.studentId);

  const queries = new CenterAppActivityQueries(prisma as never);
  const [sqlSeanslar, sqlSavollar, seanslar, urinishlar] = await Promise.all([
    queries.kunlikSeanslar(companyId, ids, davrBoshi, bugun),
    queries.kunlikSavollar(companyId, ids, tashkentDayStartUtc(davrBoshi)),
    prisma.studentAppSession.findMany({
      where: {
        studentId: { in: ids },
        day: {
          gte: utcMidnightFromDateStr(davrBoshi),
          lte: utcMidnightFromDateStr(bugun),
        },
      },
      select: {
        studentId: true,
        day: true,
        firstSeenAt: true,
        lastSeenAt: true,
        activeSeconds: true,
        radioSeconds: true,
        platform: true,
        sections: true,
      },
    }),
    prisma.dafAttempt.findMany({
      where: {
        studentId: { in: ids },
        companyId,
        createdAt: { gte: tashkentDayStartUtc(davrBoshi) },
      },
      select: {
        studentId: true,
        createdAt: true,
        sessionId: true,
        questionIndex: true,
        attemptNo: true,
        format: true,
        score: true,
        gradingStatus: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // TS tomoni — guruh tabi aynan shu yo'ldan yuradi.
  const ts = new Map<string, { faol: number; radio: number; lernen: number; kirdi: boolean }>();
  for (const id of ids) {
    const yig = kunlikYigindi(
      seanslar.filter((s) => s.studentId === id).map(seansSatri),
    );
    for (const [sana, k] of yig) {
      ts.set(`${id}:${sana}`, {
        faol: k.faolSoniya,
        radio: k.radioSoniya,
        lernen: k.bolim.LERNEN,
        kirdi: k.kirdi,
      });
    }
  }
  const sql = new Map(sqlSeanslar.map((r) => [`${r.studentId}:${r.sana}`, r]));

  section('Kunlik seanslar: SQL vs kunlikYigindi()');
  // ±1 s — FLOOR/ROUND farqi; undan kattasi qoida farqi.
  const yaqin = (x: number, y: number) => Math.abs(x - y) <= 1;
  const farqlar: (string | number)[][] = [];
  const kalitlar = new Set([...ts.keys(), ...sql.keys()]);
  for (const kalit of kalitlar) {
    const a = ts.get(kalit);
    const b = sql.get(kalit);
    if (!a || !b) {
      farqlar.push([kalit, a ? 'faqat TS' : 'faqat SQL', '', '', '']);
      continue;
    }
    if (
      !yaqin(a.faol, b.faolSoniya) ||
      !yaqin(a.radio, b.radioSoniya) ||
      !yaqin(a.lernen, b.lernenSoniya) ||
      a.kirdi !== b.kirdi
    ) {
      farqlar.push([
        kalit,
        `${a.faol}/${b.faolSoniya}`,
        `${a.radio}/${b.radioSoniya}`,
        `${a.lernen}/${b.lernenSoniya}`,
        `${a.kirdi}/${b.kirdi}`,
      ]);
    }
  }
  console.log(`  Solishtirildi: ${kalitlar.size} (o'quvchi, kun) qatori`);
  printTable(
    ["o'quvchi:kun", 'faol TS/SQL', 'radio TS/SQL', 'LERNEN TS/SQL', 'kirdi TS/SQL'],
    farqlar,
  );

  section("Savollar: SQL (tugatilgan seanslar) vs TS (urinishlar) — faqat ma'lumot");
  const savolQatorlari: (string | number)[][] = [];
  for (const id of ids) {
    const sqlJami = sqlSavollar
      .filter((r) => r.studentId === id)
      .reduce((j, r) => j + r.savollar, 0);
    const tsJami = mashqNatijasi(
      urinishlar.filter((u) => u.studentId === id) as MashqUrinishi[],
    ).savollar;
    savolQatorlari.push([id, tsJami, sqlJami, tsJami - sqlJami]);
  }
  printTable(["o'quvchi", 'urinishlardan', 'seanslardan', 'farq'], savolQatorlari, [
    'r', 'r', 'r', 'r',
  ]);

  if (farqlar.length === 0) {
    console.log('\n  ✓ Kunlik vaqt va kirish: SQL va TS bir xil.');
  } else {
    console.log(`\n  ✗ ${farqlar.length} ta farq — dizayn 9.4 buzilgan, SQL ni tekshiring.`);
    process.exitCode = 1;
  }
}

run(main);
