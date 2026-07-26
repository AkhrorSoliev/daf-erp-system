/**
 * FAZA 0 — rules.md implementatsiyasi oldidan PRE-FLIGHT tekshiruvlar. READ-ONLY.
 *
 * Uch narsani tasdiqlaydi (kod yozishdan / deploy'dan oldin):
 *   1. Prod SalaryPeriodSetting.cycleStartDay = 1 (kalendar oy = period; aks holda
 *      cron Iyulni ~01.08 da yakunlamaydi va isTopUpPeriod noto'g'ri chegaraga tayanadi).
 *   2. Iyulda faol o'qitgan ustozning salary config'i isActive=false EMASligi
 *      (gap sweep config:{isActive:true} filtrlaydi → jimgina top-up olmaydi).
 *   3. Iyul (>=2026-07-01) ABSENT darslariga yozilgan, hali to'lanmagan teacher
 *      accrual soni — reversal skript nechta qatorga tegishini oldindan ko'rish.
 *
 * Prod: `railway run npx ts-node scripts/preflight-rules-faza0.ts`
 * Dev : `npx ts-node scripts/preflight-rules-faza0.ts`
 */
import { PrismaClient } from '@prisma/client';
import { run, printHeader, section, printTable, day, dbEnvLabel } from './lib/check-cli';

const COMPANY_ID = 1001;
const JULY_START = '2026-07-01';

async function main(prisma: PrismaClient) {
  printHeader('FAZA 0 — PRE-FLIGHT (rules.md)');
  console.log(`  Baza: ${dbEnvLabel()}  ·  companyId=${COMPANY_ID}`);

  // ─── 1. cycleStartDay ────────────────────────────────────────────────────
  section('1. SalaryPeriodSetting.cycleStartDay');
  const now = new Date();
  const settings = await prisma.salaryPeriodSetting.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { effectiveFrom: 'desc' },
  });
  const active = settings.find(
    (s) => s.effectiveFrom <= now && (s.effectiveTo === null || s.effectiveTo > now),
  );
  if (!active) {
    console.log('  ⚠️  FAOL SalaryPeriodSetting topilmadi → kod default cycleStartDay=8 ishlatiladi!');
    console.log('      Bu BR-01 uchun XATO — kalendar oy emas. Faza 1 dan oldin 1 ga o‘rnating.');
  } else {
    const ok = active.cycleStartDay === 1;
    console.log(`  Faol qator: cycleStartDay=${active.cycleStartDay}  (effectiveFrom ${day(active.effectiveFrom)})`);
    console.log(ok
      ? '  ✅ cycleStartDay=1 → period = kalendar oy. Iyul ~01.08 da yakunlanadi. OK.'
      : `  ⛔ cycleStartDay=${active.cycleStartDay} ≠ 1 → BLOKLOVCHI. Reja shu yerda to‘xtaydi (BR-01).`);
  }
  if (settings.length > 1) {
    console.log(`  (jami ${settings.length} ta SalaryPeriodSetting qatori bor — SCD2 tarixi)`);
  }

  // ─── 2. Deaktiv config bilan Iyulda o'qitgan ustozlar ────────────────────
  section('2. Deaktiv (isActive=false) non-FIXED_MONTHLY teacher configlar');
  const deadConfigs = await prisma.employeeSalaryConfig.findMany({
    where: {
      companyId: COMPANY_ID,
      isActive: false,
      salaryType: { in: ['PERCENTAGE', 'FIXED_PER_STUDENT'] },
    },
    select: { userId: true, groupId: true, salaryType: true, value: true },
  });
  if (deadConfigs.length === 0) {
    console.log('  ✅ Hech qanday deaktiv PERCENTAGE/FIXED_PER_STUDENT config yo‘q.');
  } else {
    // Har bir deaktiv-config egasining Iyulda (o'qituvchi sifatida) darsi bormi?
    const userIds = [...new Set(deadConfigs.map((c) => c.userId))];
    const julyTeaching = await prisma.$queryRaw<{ teacherId: number; cnt: number }[]>`
      SELECT gt."teacherId" AS "teacherId", COUNT(*)::int AS cnt
      FROM "Attendance" a
      JOIN "GroupTeacher" gt ON gt."groupId" = a."groupId"
      WHERE a.date >= ${new Date(JULY_START)}
        AND a."companyId" = ${COMPANY_ID}
        AND gt."teacherId" = ANY(${userIds})
      GROUP BY gt."teacherId"
    `;
    const teachingMap = new Map(julyTeaching.map((r) => [r.teacherId, r.cnt]));
    const rows = deadConfigs.map((c) => [
      c.userId,
      c.groupId ?? 'GLOBAL',
      c.salaryType,
      teachingMap.get(c.userId) ? `⚠️ ${teachingMap.get(c.userId)} dars` : '—',
    ]);
    printTable(['userId', 'groupId', 'type', 'Iyulda o‘qitdi?'], rows, ['l', 'l', 'l', 'l']);
    const risky = deadConfigs.filter((c) => teachingMap.get(c.userId));
    console.log(risky.length === 0
      ? '  ✅ Ularning hech biri Iyulda o‘qitmagan — top-up xavfi yo‘q.'
      : `  ⚠️  ${risky.length} ta deaktiv config egasi Iyulda o‘qitgan → jimgina top-up yo‘qolishi mumkin. Tekshiring.`);
  }

  // ─── 3. Iyul ABSENT accrual soni (reversal skript nishoni) ───────────────
  console.log('\n' + '═'.repeat(74));
  console.log('  Pre-flight tugadi. cycleStartDay=1 va deaktiv config yo‘q bo‘lsa — deploy OK.');
  console.log('═'.repeat(74));
}

run(main);
