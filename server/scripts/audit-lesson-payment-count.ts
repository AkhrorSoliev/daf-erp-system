/**
 * Sikl darslari soni (Course.lessonPaymentCount) auditi — READ-ONLY.
 *
 * "13 yoki 21 talik sikllar" anomaliyasini diagnoz qiladi:
 *   Bo'lim 1 — har bir kursning lessonPaymentCount qiymati; {12,20} dan
 *              tashqaridagilarni OUTLIER deb belgilaydi.
 *   Bo'lim 2 — har bir outlier kurs uchun faol enrollment (ta'sir doirasi).
 *   Bo'lim 3 — namuna guruh uchun sikl (lessonPaymentCount) vs joriy oydagi
 *              jadval darslar soni — "Sikl != kalendar oy" ekanini ko'rsatadi.
 *
 * Xulosa: outlier topilsa -> ma'lumot kiritish xatosi (kursni tuzatish kerak).
 *         outlier yo'q, lekin oy hisobida 13/21 chiqsa -> kalendar/sikl
 *         aralashuvi (kod xatosi emas, faqat ko'rinish tushuntirilishi kerak).
 *
 * Ishga tushirish:
 *   cd server && npx ts-node scripts/audit-lesson-payment-count.ts
 *   (ixtiyoriy)  --company=1001
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// --- Tashkent kalendar yordamchilari (mavjud check-* skriptlari bilan bir xil) ---
const DAY_NAME_TO_JS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
function tashkentDateStr(date: Date): string {
  const s = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`;
}
function utcMidnightFromDateStr(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}
function dayOfWeekForDateStr(s: string) {
  return utcMidnightFromDateStr(s).getUTCDay();
}
function addDaysToDateStr(s: string, n: number) {
  const d = utcMidnightFromDateStr(s);
  d.setUTCDate(d.getUTCDate() + n);
  return tashkentDateStr(d);
}

/** getCycleSize'dagi (o'lik kod) bilan bir xil heuristika: kutilgan qiymat. */
function expectedCountForName(name: string): number {
  return /intensiv/i.test(name) ? 20 : 12;
}

function parseCompanyArg(): number | undefined {
  const arg = process.argv.find((a) => a.startsWith('--company='));
  if (!arg) return undefined;
  const n = Number(arg.split('=')[1]);
  return Number.isFinite(n) ? n : undefined;
}

async function main() {
  const companyId = parseCompanyArg();
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(
    companyId ? `Company filtri: ${companyId}\n` : `Barcha companylar\n`,
  );

  // ---------- Bo'lim 1: kurslar auditi ----------
  const courses = await prisma.course.findMany({
    where: { deletedAt: null, ...(companyId && { companyId }) },
    select: {
      id: true,
      name: true,
      lessonPaymentCount: true,
      price: true,
      companyId: true,
      _count: { select: { groups: { where: { deletedAt: null } } } },
    },
    orderBy: { name: 'asc' },
  });

  console.log('=== BO\'LIM 1: Kurslar lessonPaymentCount auditi ===');
  console.log(
    'Nom'.padEnd(36) +
      'lpc'.padStart(5) +
      'kut'.padStart(5) +
      'guruh'.padStart(7) +
      '  belgi',
  );
  const outliers: typeof courses = [];
  for (const c of courses) {
    const lpc = c.lessonPaymentCount;
    const expected = expectedCountForName(c.name);
    const isOutlier = lpc !== 12 && lpc !== 20;
    if (isOutlier) outliers.push(c);
    console.log(
      c.name.slice(0, 35).padEnd(36) +
        String(lpc).padStart(5) +
        String(expected).padStart(5) +
        String(c._count.groups).padStart(7) +
        (isOutlier ? '  <-- OUTLIER' : ''),
    );
  }
  console.log(
    `\nJami kurslar: ${courses.length}, OUTLIER (lpc != 12 va != 20): ${outliers.length}`,
  );

  // ---------- Bo'lim 2: ta'sir doirasi ----------
  console.log('\n=== BO\'LIM 2: Outlier kurslarning ta\'sir doirasi ===');
  if (outliers.length === 0) {
    console.log(
      'Outlier kurs yo\'q — barcha kurslar 12 yoki 20 talik. 13/21 ko\'rinishi',
    );
    console.log('ehtimol kalendar-oy darslar sonidir (Bo\'lim 3 ga qarang).');
  } else {
    for (const c of outliers) {
      const activeEnrollments = await prisma.enrollment.count({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          group: { courseId: c.id, deletedAt: null },
        },
      });
      const perLesson = c.lessonPaymentCount
        ? Math.round(c.price / c.lessonPaymentCount)
        : 0;
      console.log(
        `  "${c.name}" (lpc=${c.lessonPaymentCount}): ${c._count.groups} guruh, ` +
          `${activeEnrollments} faol o'quvchi, per-lesson = ${perLesson.toLocaleString('en-US')} so'm`,
      );
    }
    console.log(
      '\nDIQQAT: lessonPaymentCount per-lesson narxni belgilaydi. Tuzatishdan',
    );
    console.log(
      'oldin narx 12/20 ga moslab qo\'yilganmi yoki 13/21 ga moslanganmi —',
    );
    console.log('product owner bilan aniqlang. Tuzatish PATCH /courses/:id orqali.');
  }

  // ---------- Bo'lim 3: kalendar vs sikl (namuna guruh) ----------
  console.log('\n=== BO\'LIM 3: Sikl vs kalendar-oy (namuna guruh) ===');
  const sampleGroup = await prisma.group.findFirst({
    where: {
      deletedAt: null,
      statusEnum: 'ACTIVE',
      startDate: { not: null },
      ...(companyId && { companyId }),
      ...(outliers.length > 0
        ? { courseId: { in: outliers.map((o) => o.id) } }
        : {}),
    },
    select: {
      name: true,
      exactDays: true,
      startDate: true,
      endDate: true,
      companyId: true,
      course: { select: { name: true, lessonPaymentCount: true } },
    },
    orderBy: { startDate: 'desc' },
  });

  if (!sampleGroup) {
    console.log('Namuna guruh topilmadi.');
  } else {
    const cycleSize = sampleGroup.course?.lessonPaymentCount ?? 12;
    const now = new Date();
    const todayStr = tashkentDateStr(now);
    const [y, m] = todayStr.split('-').map(Number);
    const monthStartStr = `${y}-${String(m).padStart(2, '0')}-01`;
    // Oyning oxirgi kuni
    const monthEnd = new Date(Date.UTC(y, m, 0));
    const monthEndStr = tashkentDateStr(monthEnd);

    const holidays = await prisma.holiday.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        date: { lte: utcMidnightFromDateStr(monthEndStr) },
        endDate: { gte: utcMidnightFromDateStr(monthStartStr) },
      },
      select: { date: true, endDate: true },
    });
    const holidaySet = new Set<string>();
    for (const h of holidays) {
      let d = new Date(h.date);
      while (d <= h.endDate) {
        holidaySet.add(tashkentDateStr(d));
        d = new Date(d.getTime() + 86400000);
      }
    }

    const scheduleDays = (sampleGroup.exactDays as string[])
      .map((d) => DAY_NAME_TO_JS[d.toLowerCase()])
      .filter((d) => d !== undefined);

    let calendarMonthLessons = 0;
    let cursor = monthStartStr;
    while (cursor <= monthEndStr) {
      if (
        scheduleDays.includes(dayOfWeekForDateStr(cursor)) &&
        !holidaySet.has(cursor)
      ) {
        calendarMonthLessons++;
      }
      cursor = addDaysToDateStr(cursor, 1);
    }

    console.log(`  Guruh: ${sampleGroup.name} (${sampleGroup.course?.name})`);
    console.log(`  1 sikl = ${cycleSize} dars (kurs sozlamasi)`);
    console.log(
      `  ${y}-${String(m).padStart(2, '0')} oyida jadval bo'yicha: ${calendarMonthLessons} ta dars kuni`,
    );
    console.log(
      `  => Sikl (${cycleSize}) ${cycleSize === calendarMonthLessons ? '==' : '!='} kalendar oy (${calendarMonthLessons}). ` +
        `Bular ALOHIDA tushunchalar.`,
    );
  }

  console.log('\nAudit yakunlandi (hech narsa o\'zgartirilmadi).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
