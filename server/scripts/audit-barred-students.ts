/**
 * To'lov yo'qligi uchun davomat olib bo'lmagan o'quvchilar hisoboti (ADR-0142).
 * FAQAT O'QIYDI: hech narsa yozmaydi, xabar yubormaydi. CEO ro'yxatni ko'rib
 * tasdiqlamaguncha hech narsa o'zgarmaydi; tuzatish alohida PR va alohida
 * `--apply` (bu skriptda yo'q).
 *
 * Har FAOL qarzdor yozilish uchun: nechta ketma-ket dars, nechtasiga kelgan,
 * qoida bo'yicha qarz qancha bo'lishi kerak (kelgan darslar × dars narxi) va
 * hozirgi hisobdan farqi.
 *
 *   railway run npx ts-node --transpile-only scripts/audit-barred-students.ts
 */
import {
  MonthlyChargeStatus,
  EnrollmentStatus,
  GroupStatus,
} from '@prisma/client';
import { tashkentMonthKey } from '../src/common/date/tashkent';
import { BarredLessonsService } from '../src/attendance/barred-lessons.service';
import { LessonAdmissionService } from '../src/billing/lesson-admission.service';
import {
  applyDiscount,
  clampDiscount,
  proratedMonthlyAmount,
} from '../src/billing/monthly-price';
import { printHeader, printTable, run, section, som } from './lib/check-cli';

run(async (prisma) => {
  printHeader(
    "To'lov yo'qligi uchun davomat olib bo'lmagan o'quvchilar (faqat o'qiydi)",
  );

  // Qoida yoqilgan deb hisoblaymiz va 3.2 bilan 50% talabi ishlaydi: bu
  // hisobot qoida nima qilishini ko'rsatadi, sozlamalar holatini emas.
  const settings = {
    get: async (_companyId: number, key: string) =>
      key === 'payment.admissionMinPaidPercent' ? 50 : true,
  };
  const admission = new LessonAdmissionService(
    prisma as never,
    settings as never,
  );
  const barred = new BarredLessonsService(
    prisma as never,
    admission,
    settings as never,
  );

  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: EnrollmentStatus.ACTIVE,
      deletedAt: null,
      student: { deletedAt: null, balance: { lt: 0 } },
      group: { deletedAt: null, statusEnum: GroupStatus.ACTIVE },
    },
    select: {
      id: true,
      studentId: true,
      student: { select: { firstName: true, lastName: true, balance: true } },
      group: { select: { name: true } },
    },
  });
  console.log(`Qarzdor faol yozilishlar: ${enrollments.length}`);

  const thisPeriod = Number(tashkentMonthKey(new Date()).replace('-', ''));
  const found = await barred.forEnrollments(enrollments.map((e) => e.id));
  const rows: (string | number)[][] = [];
  let totalExcess = 0;
  let pauseExcess = 0;

  for (const e of enrollments) {
    const b = found.get(e.id);
    if (!b || b.days.length === 0) continue;

    const charges = await prisma.enrollmentMonthlyCharge.findMany({
      where: { enrollmentId: e.id, status: MonthlyChargeStatus.CHARGED },
      select: {
        periodYear: true,
        periodMonth: true,
        coveredDates: true,
        monthlyPrice: true,
        plannedLessons: true,
        discountPercent: true,
        chargedAmount: true,
      },
    });
    const cameRows = await prisma.attendance.findMany({
      where: {
        studentId: e.studentId,
        groupId: b.groupId,
        status: { in: ['PRESENT', 'LATE'] },
      },
      select: { date: true },
    });
    const came = new Set(
      cameRows.map((r) => r.date.toISOString().slice(0, 10)),
    );

    let should = 0;
    let current = 0;
    let cameCount = 0;
    for (const c of charges) {
      // Kelasi oylarning hisobi hali o'tmagan darslar: ortiqcha emas.
      if (c.periodYear * 100 + c.periodMonth > thisPeriod) continue;
      const attended = (c.coveredDates ?? []).filter((d) => came.has(d)).length;
      cameCount += attended;
      should += applyDiscount(
        proratedMonthlyAmount(c.monthlyPrice, c.plannedLessons, attended),
        clampDiscount(c.discountPercent ?? 0),
      );
      current += c.chargedAmount;
    }
    const excess = Math.max(0, current - should);
    totalExcess += excess;
    if (b.streak >= 3) pauseExcess += excess;
    rows.push([
      e.studentId,
      `${e.student.firstName} ${e.student.lastName}`.trim(),
      e.group.name,
      b.streak,
      cameCount,
      som(should),
      som(current),
      som(excess),
    ]);
  }

  rows.sort((a, b) => Number(b[3]) - Number(a[3]));
  section(`Qoidaga mos o'quvchilar: ${rows.length} ta`);
  printTable(
    [
      'ID',
      "O'quvchi",
      'Guruh',
      'Ketma-ket',
      'Kelgan',
      "Bo'lishi kerak",
      'Hozir hisobda',
      'Ortiqcha',
    ],
    rows,
    ['l', 'l', 'l', 'r', 'r', 'r', 'r', 'r'],
  );
  console.log(`\nJami ortiqcha yozilgan: ${som(totalExcess)}`);
  console.log(
    `Shundan 3 va undan ko'p ketma-ket (pauzaga tushadiganlar): ${som(pauseExcess)}`,
  );
  console.log(
    "\nDIQQAT: bu faqat hisobot. Boshqa guruhga ko'chirilgan va muzlatilganlar alohida ko'riladi.",
  );
});
