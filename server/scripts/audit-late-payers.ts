/**
 * Kech to'layotgan o'quvchilar hisoboti (FAQAT O'QIYDI).
 *
 * To'lamagan o'quvchini 2-darsdan davomatga qo'yib bo'lmaydi (ADR-0047). U
 * keyin to'lasa ham o'tgan darslarda qatori yo'q qoladi. Bu skript har faol
 * oylik yozilish uchun «ustoz dars o'tgan, o'quvchida qator yo'q» kunlarni
 * topadi va ularni ikkiga ajratadi:
 *   - to'lov yetgan (bugungi to'lovlar bilan, sana tartibida, eski qarz
 *     avval) → «Keldi» qo'yilishi kerak bo'lgan darslar;
 *   - to'lov yetmagan → qarz bo'lib turgan darslar.
 * O'quvchilar ikki turga bo'linadi: o'sha kunlardan keyin to'lov qilganlar
 * («kech to'layotgan») va to'lov qilmaganlar («yo'qolgan»).
 *
 *   railway run npx ts-node --transpile-only scripts/audit-late-payers.ts
 */
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
} from '@prisma/client';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../src/common/date/tashkent';
import { ADMISSION_START_DAY } from '../src/billing/lesson-admission';
import {
  LessonAdmissionService,
  admissionKey,
} from '../src/billing/lesson-admission.service';
import { barredLessonDays } from '../src/attendance/barred-lessons';
import { printHeader, printTable, run, section, som } from './lib/check-cli';

const short = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

run(async (prisma) => {
  printHeader(
    "Kech to'layotgan o'quvchilar: davomatga tushmagan darslar (faqat o'qiydi)",
  );
  const today = tashkentDateStr(new Date());

  // Qoida qanday hukm qilishini ko'rsatamiz: 3.2 yoqiq, 50% noyabrdan.
  const settings = {
    get: async (_c: number, key: string) =>
      key === 'payment.admissionMinPaidPercent' ? 50 : true,
  };
  const admission = new LessonAdmissionService(
    prisma as never,
    settings as never,
  );

  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: EnrollmentStatus.ACTIVE,
      deletedAt: null,
      student: { deletedAt: null },
      group: { deletedAt: null, statusEnum: GroupStatus.ACTIVE },
      monthlyCharges: {
        some: {
          status: MonthlyChargeStatus.CHARGED,
          OR: [
            { periodYear: { gt: 2026 } },
            { periodYear: 2026, periodMonth: { gte: 10 } },
          ],
        },
      },
    },
    select: {
      id: true,
      studentId: true,
      groupId: true,
      student: { select: { firstName: true, lastName: true, balance: true } },
      group: { select: { name: true } },
      monthlyCharges: {
        where: {
          status: MonthlyChargeStatus.CHARGED,
          OR: [
            { periodYear: { gt: 2026 } },
            { periodYear: 2026, periodMonth: { gte: 10 } },
          ],
        },
        select: { coveredDates: true, frozenOutDates: true },
      },
    },
  });
  console.log(`Faol oylik yozilishlar: ${enrollments.length}`);

  const groupIds = [...new Set(enrollments.map((e) => e.groupId))];
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
  const range = {
    gte: utcMidnightFromDateStr(ADMISSION_START_DAY),
    lt: utcMidnightFromDateStr(today),
  };
  const dayStr = (d: Date) => d.toISOString().slice(0, 10);

  const [heldRows, rows, payments] = await Promise.all([
    prisma.attendance.groupBy({
      by: ['groupId', 'date'],
      where: { groupId: { in: groupIds }, date: range, cancellationId: null },
    }),
    prisma.attendance.findMany({
      where: { studentId: { in: studentIds }, date: range },
      select: { studentId: true, groupId: true, date: true },
    }),
    prisma.payment.findMany({
      where: {
        studentId: { in: studentIds },
        status: 'COMPLETED',
        createdAt: { gte: range.gte },
      },
      select: { studentId: true, amount: true, createdAt: true },
    }),
  ]);
  const held = new Map<string, Set<string>>();
  for (const r of heldRows) {
    const s = held.get(r.groupId) ?? new Set<string>();
    s.add(dayStr(r.date));
    held.set(r.groupId, s);
  }
  const marked = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = `${r.studentId}:${r.groupId}`;
    const s = marked.get(k) ?? new Set<string>();
    s.add(dayStr(r.date));
    marked.set(k, s);
  }

  const candidates = enrollments
    .map((e) => ({
      e,
      days: barredLessonDays({
        coveredDates: e.monthlyCharges.flatMap((c) => c.coveredDates ?? []),
        frozenOutDates: e.monthlyCharges.flatMap((c) => c.frozenOutDates ?? []),
        heldDays: held.get(e.groupId) ?? new Set(),
        markedDays: marked.get(`${e.studentId}:${e.groupId}`) ?? new Set(),
        from: ADMISSION_START_DAY,
        to: today,
        includeFrozenOut: false,
      }),
    }))
    .filter((c) => c.days.length > 0);

  const verdicts = await admission.forLessons(
    candidates.flatMap((c) =>
      c.days.map((d) => ({
        studentId: c.e.studentId,
        groupId: c.e.groupId,
        lessonDay: d,
      })),
    ),
  );

  const late: (string | number)[][] = [];
  const gone: (string | number)[][] = [];
  let lateKeldi = 0;
  for (const { e, days } of candidates) {
    const paid = days.filter((d) => {
      const v = verdicts.get(admissionKey(e.studentId, e.groupId, d));
      return !v || v.admitted;
    });
    const unpaid = days.filter((d) => !paid.includes(d));
    const after = payments
      .filter(
        (p) =>
          p.studentId === e.studentId &&
          tashkentDateStr(p.createdAt) >= days[0],
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const row = [
      e.studentId,
      `${e.student.firstName} ${e.student.lastName}`.trim().slice(0, 28),
      e.group.name,
      days.length,
      paid.length
        ? `${paid.length} (${short(paid[0])}–${short(paid[paid.length - 1])})`
        : '0',
      unpaid.length,
      after.length
        ? `${short(tashkentDateStr(after[0].createdAt))} · ${som(after.reduce((n, p) => n + p.amount, 0))}`
        : '—',
      som(e.student.balance),
    ];
    if (after.length > 0) {
      late.push(row);
      lateKeldi += paid.length;
    } else {
      gone.push(row);
    }
  }

  const headers = [
    'ID',
    "O'quvchi",
    'Guruh',
    'Qatorsiz',
    "To'lov yetgan → «Keldi»",
    "To'lanmagan",
    "Keyingi to'lovlar",
    'Balans',
  ];
  const aligns: ('l' | 'r')[] = ['l', 'l', 'l', 'r', 'l', 'r', 'l', 'r'];
  late.sort((a, b) => Number(b[3]) - Number(a[3]));
  gone.sort((a, b) => Number(b[3]) - Number(a[3]));

  section(
    `A. Kech to'layotganlar (qatorsiz kunlardan keyin to'lov qilgan): ${late.length} ta`,
  );
  printTable(headers, late, aligns);
  console.log(`\n  «Keldi» qo'yiladigan darslar jami: ${lateKeldi}`);

  section(
    `B. To'lov qilmaganlar (o'sha kunlardan keyin to'lov yo'q): ${gone.length} ta`,
  );
  printTable(headers, gone, aligns);
});
