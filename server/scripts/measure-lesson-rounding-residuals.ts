/**
 * measure-lesson-rounding-residuals — READ-ONLY.
 *
 * Spec'ning 0-qadami: hozirgi mayda qoldiqlar AYNAN yaxlitlashdanmi?
 *
 * Usul — simulyatsiya emas, tekshiriladigan alomat. Har kursda bir tsiklning
 * xatosi qat'iy: `round(narx/dars) × dars − narx`. Masalan 500 000 / 12 →
 * 41 667 × 12 − 500 000 = **+4** (ortiqcha yoziladi, qarz tug'iladi), 400 000 / 12
 * → **−4** (kam yoziladi, ortiqcha qoladi). Agar o'quvchining qoldig'i o'sha
 * xatoning butun karrasi bo'lsa — kelib chiqishi yaxlitlash. Bo'lmasa — boshqa
 * sabab (yumaloq to'lov, tuzatish).
 *
 * Ishlatish:
 *   npx ts-node scripts/measure-lesson-rounding-residuals.ts
 *   DATABASE_URL=... npx ts-node scripts/measure-lesson-rounding-residuals.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { baseLessonPrice } from '../src/billing/lesson-price';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const som = (n: number) => Math.round(n).toLocaleString('ru-RU');
const THRESHOLD = 1000;

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true } });
  const companyId = company!.id;

  // Har kursning bir tsikldagi xatosi.
  const courses = await prisma.course.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, price: true, lessonPaymentCount: true },
  });
  console.log('KURSLARNING TSIKL XATOSI');
  for (const c of courses) {
    const n = c.lessonPaymentCount || 12;
    const err = baseLessonPrice(c.price, n) * n - c.price;
    console.log(
      `  ${c.name.slice(0, 18).padEnd(18)} ${som(c.price).padStart(9)} / ${String(n).padStart(2)} → ` +
        `xato ${err > 0 ? '+' : ''}${err} so'm/tsikl ${err > 0 ? '(ortiqcha yozadi → QARZ)' : err < 0 ? '(kam yozadi → ortiqcha qoladi)' : '(toza)'}`,
    );
  }

  const students = await prisma.student.findMany({
    where: { companyId, balance: { lt: 0, gt: -THRESHOLD } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      balance: true,
      status: true,
      deletedAt: true,
      enrollments: {
        select: {
          group: {
            select: {
              course: { select: { price: true, lessonPaymentCount: true } },
            },
          },
        },
      },
    },
    orderBy: { balance: 'desc' },
  });

  console.log(
    `\n1000 so'mdan kam qarzi bor: ${students.length} ta, jami ` +
      `${som(students.reduce((a, s) => a - s.balance, 0))} so'm\n`,
  );
  console.log(
    "o'quvchi                          qarz  holat   tsikl xatosi  karrami?",
  );

  let rounding = 0;
  let roundingSum = 0;

  for (const s of students) {
    const debt = -s.balance;
    // Bu o'quvchi tegishli kurslarning xatolari (odatda bitta).
    const errs = [
      ...new Set(
        s.enrollments.map((e) => {
          const n = e.group.course.lessonPaymentCount || 12;
          return baseLessonPrice(e.group.course.price, n) * n - e.group.course.price;
        }),
      ),
    ].filter((e) => e > 0); // faqat QARZ tug'diradigan yo'nalish

    const isMultiple = errs.some((e) => e > 0 && debt % e === 0);
    if (isMultiple) {
      rounding++;
      roundingSum += debt;
    }
    const live = s.status === 'ACTIVE' && !s.deletedAt;

    console.log(
      `#${s.id} ${(s.firstName + ' ' + s.lastName).trim().slice(0, 24).padEnd(24)} ` +
        `${som(debt).padStart(6)}  ${live ? 'faol  ' : 'nofaol'}  ` +
        `${(errs.length ? errs.map((e) => `+${e}`).join(',') : '—').padStart(12)}  ` +
        `${isMultiple ? `HA (${errs.map((e) => debt / e).join(',')} tsikl)` : "yo'q"}`,
    );
  }

  console.log(
    `\nXULOSA: ${rounding} ta / ${students.length} ta qoldiq yaxlitlashga mos ` +
      `(${som(roundingSum)} so'm / ${som(students.reduce((a, s) => a - s.balance, 0))} so'm).`,
  );
  console.log(
    'Tuzatishdan keyin bu turdagi qoldiq boshqa TUG`ILMAYDI. Mavjudlari o`z holida qoladi —',
  );
  console.log('faol o`quvchida keyingi to`lovda yutiladi, nofaolda qoladi.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
