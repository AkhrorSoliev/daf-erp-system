/**
 * verify-absence-streak-parity — READ-ONLY.
 *
 * `AbsenceStreakService` da o'zgargan YAGONA narsa — oxirgi 10 ta davomatni
 * olish usuli: har bir yozuv uchun alohida `findMany` o'rniga bitta
 * `ROW_NUMBER()` so'rovi. Hisoblash mantiqi (`consecutiveAbsentCount`) va
 * `lastPresentDate` zaxira so'rovi umuman tegilmagan — ular unit testlarda.
 *
 * Shuning uchun bu skript AYNAN o'sha o'zgargan qatlamni solishtiradi: bir xil
 * juftliklar uchun eski yo'l va yangi yo'l bir xil sana/status ro'yxatini,
 * bir xil tartibda qaytaradimi.
 *
 * NEGA `computeStreaks` ning O'ZI solishtirilmaydi: dev bazasida ketma-ket
 * 3 marta kelmagan bitta ham o'quvchi yo'q (`removalQueue = 0`), ya'ni u
 * bo'sh ro'yxatni bo'sh ro'yxat bilan taqqoslab «bir xil» deb yozardi —
 * hech narsani isbotlamasdan.
 *
 * Namuna ATAYLAB davomati eng ko'p juftliklardan olinadi: shunda «faqat
 * oxirgi 10 tasi» cheklovi ham haqiqatan sinovdan o'tadi.
 *
 * Ishlatish:
 *   cd server && npx ts-node --transpile-only \
 *     scripts/verify-absence-streak-parity.ts [namuna-hajmi]
 *
 * `tsx` EMAS: u (esbuild) dekorator metama'lumotini chiqarmaydi, shuning uchun
 * NestJS bog'liqliklarni ulay olmaydi va `this.prisma` undefined bo'lib qoladi.
 */
import 'dotenv/config';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AttendanceStatus } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AbsenceStreakService } from '../src/outreach/absence-streak.service';

@Module({
  imports: [PrismaModule],
  providers: [AbsenceStreakService],
})
class VerifyModule {}

interface Row {
  date: Date;
  status: AttendanceStatus;
}

const iso = (d: Date) => new Date(d).toISOString();
const pairKey = (s: number, g: string) => `${s}|${g}`;

async function main() {
  const sampleSize = Number(process.argv[2] ?? 300);
  const app = await NestFactory.createApplicationContext(VerifyModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const service = app.get(AbsenceStreakService);

  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error('Kompaniya topilmadi');
  const companyId = company.id;

  // Davomati eng ko'p juftliklar — «oxirgi 10 ta» cheklovi ishlashi uchun.
  const busiest = await prisma.attendance.groupBy({
    by: ['studentId', 'groupId'],
    where: { companyId },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: sampleSize,
  });

  if (busiest.length === 0) {
    console.log("\nBazada davomat yo'q — solishtirishga narsa yo'q.\n");
    await app.close();
    process.exit(1);
  }

  const pairs = busiest.map((b) => ({
    studentId: b.studentId,
    groupId: b.groupId,
  }));
  const maxRows = Math.max(...busiest.map((b) => b._count.id));
  const overTen = busiest.filter((b) => b._count.id > 10).length;

  console.log(`\nNamuna: ${pairs.length} ta juftlik`);
  console.log(`  eng ko'p davomatli juftlikda ${maxRows} ta qator`);
  console.log(`  10 tadan ko'p davomatli juftliklar: ${overTen} ta`);
  console.log(
    overTen === 0
      ? "  ⚠ DIQQAT: 10 talik cheklov sinovdan o'tmaydi\n"
      : "  ✓ 10 talik cheklov haqiqatan sinovdan o'tadi\n",
  );

  // --- ESKI YO'L: juftlik boshiga bitta so'rov ---
  const t0 = Date.now();
  const legacy = new Map<string, Row[]>();
  const CONCURRENCY = 25;
  for (let i = 0; i < pairs.length; i += CONCURRENCY) {
    const batch = pairs.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (p) => {
        const rows = await prisma.attendance.findMany({
          where: {
            studentId: p.studentId,
            groupId: p.groupId,
            companyId,
          },
          orderBy: { date: 'desc' },
          take: 10,
          select: { date: true, status: true },
        });
        legacy.set(pairKey(p.studentId, p.groupId), rows);
      }),
    );
  }
  const legacyMs = Date.now() - t0;

  // --- YANGI YO'L: hammasi uchun bitta so'rov ---
  const t1 = Date.now();
  const fresh: Map<string, Row[]> = await (
    service as unknown as {
      fetchLastTenPerPair: (
        c: number,
        p: { studentId: number; groupId: string }[],
      ) => Promise<Map<string, Row[]>>;
    }
  ).fetchLastTenPerPair(companyId, pairs);
  const freshMs = Date.now() - t1;

  // --- Solishtirish ---
  const problems: string[] = [];
  let comparedRows = 0;

  for (const p of pairs) {
    const k = pairKey(p.studentId, p.groupId);
    const a = legacy.get(k) ?? [];
    const b = fresh.get(k) ?? [];

    if (a.length !== b.length) {
      problems.push(`${k}: qator soni ${a.length} → ${b.length}`);
      continue;
    }
    for (let i = 0; i < a.length; i++) {
      comparedRows++;
      if (iso(a[i].date) !== iso(b[i].date)) {
        problems.push(`${k}[${i}]: sana ${iso(a[i].date)} → ${iso(b[i].date)}`);
      }
      if (a[i].status !== b[i].status) {
        problems.push(`${k}[${i}]: status ${a[i].status} → ${b[i].status}`);
      }
    }
  }

  const speedup = freshMs > 0 ? (legacyMs / freshMs).toFixed(1) : '∞';
  console.log(`So'rovlar   : eski ${pairs.length} ta → yangi 1 ta`);
  console.log(
    `Vaqt        : eski ${(legacyMs / 1000).toFixed(2)}s → yangi ${(freshMs / 1000).toFixed(2)}s  (${speedup}x tez)`,
  );
  console.log(`Solishtirildi: ${comparedRows} ta davomat qatori`);

  await app.close();

  if (problems.length === 0) {
    console.log('\n✓ HAR BIR QATOR AYNAN BIR XIL\n');
    process.exit(0);
  }
  console.log(`\n✗ ${problems.length} TA FARQ:`);
  for (const p of problems.slice(0, 20)) console.log(`   ${p}`);
  if (problems.length > 20) console.log(`   ... yana ${problems.length - 20}`);
  console.log('');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
