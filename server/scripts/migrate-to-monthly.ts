/**
 * migrate-to-monthly — Oylik to'lovga o'tish MIGRATSIYASI.
 *
 * `--dry-run` (standart, majburiy birinchi): STRICTLY READ-ONLY. Bazadan
 * hozirgi (LESSON_PACK) holatni o'qiydi, sentabr oyi uchun "agar MONTHLY'ga
 * o'tilsa nima o'zgaradi" degan rejani hisoblab, konsolga sarhisob + guruh
 * kesimi chiqaradi va to'liq o'quvchi ro'yxatini CSV'ga yozadi. HECH QANDAY
 * `create`/`update`/`delete`/`upsert`/`$executeRaw` ishlatilmaydi.
 *
 * `--apply` (Task 10): hali yozilmagan.
 *
 * Arifmetika `scripts/lib/monthly-migration-report.ts` (buildMigrationPlan)
 * dan keladi — bu skript faqat MigrationRow[] ni bazadan yig'adi. Dars
 * kunlari va bayramlar `MonthlyChargeService.resolveExcludedDates` orqali —
 * bu YAGONA manba, ikkinchi nusxasi yozilmaydi (Task 6 buzilgan sabab shu
 * edi).
 *
 * Usage:
 *   cd server && npx ts-node scripts/migrate-to-monthly.ts --dry-run [--period=2026-09]
 *     — DEV bazaga (server/.env) ulanadi.
 *   cd server && railway run npx ts-node scripts/migrate-to-monthly.ts --dry-run --period=2026-09
 *     — PROD bazaga ulanadi (Railway DATABASE_URL'ni in'ektsiya qiladi).
 *
 * Muhit konsol sarlavhasida aniq ko'rsatiladi (`printHeader` → dbEnvLabel) —
 * DEV raqamlarini PROD deb adashtirmaslik uchun.
 */
import {
  EnrollmentStatus,
  GroupStatus,
  PaymentModel,
  Prisma,
  PrismaClient,
  TransactionType,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import {
  dbEnvLabel,
  printHeader,
  printTable,
  run,
  section,
  som,
} from './lib/check-cli';
import {
  tashkentDateStr,
  tashkentDayRangeUtc,
} from '../src/attendance/shared/date-utils';
import { baseLessonPrice } from '../src/billing/lesson-price';
import { MonthlyChargeService } from '../src/billing/monthly-charge.service';
import { perLessonCostForMonth } from '../src/billing/monthly-price';
import { lessonDatesInMonth } from '../src/billing/planned-lessons';
import {
  perLessonAccrual,
  RateVersion,
} from '../src/salary/shared/deserved-math';
import {
  buildMigrationPlan,
  MigrationRow,
  renderStudentCsv,
  renderSummary,
} from './lib/monthly-migration-report';
import {
  resolvePackPerLessonCost,
  type PrepaidRefundBatch,
} from './lib/prepaid-refund-price';

interface CliArgs {
  apply: boolean;
  period: string;
}

function parseCliArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const periodTok = argv.find((a) => a.startsWith('--period='));
  const period = periodTok
    ? periodTok.split('=')[1]
    : tashkentDateStr(new Date()).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(
      `--period noto'g'ri format: "${period}" (kutilgan YYYY-MM, masalan 2026-09)`,
    );
  }
  return { apply, period };
}

interface GroupSummaryRow {
  groupName: string;
  courseName: string;
  studentCount: number;
  plannedLessons: number;
  oldPerLesson: number;
  newPerLesson: number;
  expectedIncome: number;
  teacherPayDelta: number;
}

/** `docs/migration-preview-<sana>.csv` — repo ildizidagi docs/, server/ ichida emas. */
function csvOutputPath(): string {
  const today = tashkentDateStr(new Date());
  return path.join(
    __dirname,
    '..',
    '..',
    'docs',
    `migration-preview-${today}.csv`,
  );
}

async function main(prisma: PrismaClient) {
  const { apply, period } = parseCliArgs();

  if (apply) {
    // Task 10 gacha shu yerda to'xtaydi — bazaga hech narsa yozilmaydi.
    throw new Error('--apply hali yozilmagan');
  }

  const [yearStr, monthStr] = period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  printHeader(
    `MIGRATSIYA OLDINDAN HISOBOTI — davr ${period} — DRY RUN, HECH NARSA YOZILMAYDI`,
  );

  // resolveExcludedDates() `this`ga tegmaydi (faqat o'z parametrlaridan
  // ishlaydi) — shuning uchun servisni to'liq Nest DI grafigisiz, faqat
  // shu bitta metod uchun qo'lda yasash xavfsiz. TransactionsWriteService
  // hech qachon chaqirilmaydi.
  const chargeService = new MonthlyChargeService(
    prisma as unknown as never,
    undefined as unknown as never,
  );
  const tx = prisma as unknown as Prisma.TransactionClient;

  const companies = await prisma.company.findMany({ select: { id: true } });

  const allRows: MigrationRow[] = [];
  const reversedDeductions: Record<number, number> = {};
  const groupSummaries: GroupSummaryRow[] = [];

  for (const company of companies) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        group: {
          deletedAt: null,
          companyId: company.id,
          statusEnum: { in: [GroupStatus.ACTIVE, GroupStatus.PAUSED] },
          course: { paymentModel: PaymentModel.LESSON_PACK, deletedAt: null },
        },
        student: { deletedAt: null, status: 'ACTIVE' },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        startDate: true,
        prepaidLessonsRemaining: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            balance: true,
            discountPercent: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            groupNumber: true,
            branchId: true,
            exactDays: true,
            teachers: { select: { teacherId: true } },
            course: {
              select: { name: true, price: true, lessonPaymentCount: true },
            },
          },
        },
      },
    });

    if (enrollments.length === 0) continue;

    // ── guruh kesimida bir marta hisoblanadigan narsalar (N+1 emas) ────────
    const uniqueGroups = new Map<
      string,
      (typeof enrollments)[number]['group']
    >();
    for (const e of enrollments) uniqueGroups.set(e.groupId, e.group);

    const excludedByGroup = new Map<string, string[]>();
    for (const [groupId, group] of uniqueGroups) {
      excludedByGroup.set(
        groupId,
        await chargeService.resolveExcludedDates(
          tx,
          groupId,
          group.branchId,
          year,
          month,
        ),
      );
    }

    const plannedByGroup = new Map<string, number>();
    for (const [groupId, group] of uniqueGroups) {
      plannedByGroup.set(
        groupId,
        lessonDatesInMonth({
          year,
          month,
          exactDays: group.exactDays,
          excludedDates: excludedByGroup.get(groupId),
        }).length,
      );
    }

    // ── har enrollment uchun eng so'nggi (bekor qilinmagan) LESSON_DEDUCTION —
    // prepaid qaytarish shu BATCH'ning o'z summasidan hisoblanadi (bitta
    // so'rov), xuddi EnrollmentBillingService.prepaidRefundValue kabi —
    // metadata.perLessonCost ATAYLAB chegirmasiz, uni to'g'ridan-to'g'ri
    // ishlatish chegirmali o'quvchini 2x ortiqcha ko'rsatardi. ─────────────
    const enrollmentsWithPrepaid = enrollments.filter(
      (e) => e.prepaidLessonsRemaining > 0,
    );
    const deductions = enrollmentsWithPrepaid.length
      ? await prisma.transaction.findMany({
          where: {
            type: TransactionType.LESSON_DEDUCTION,
            reversedAt: null,
            enrollmentId: { in: enrollmentsWithPrepaid.map((e) => e.id) },
          },
          orderBy: { createdAt: 'asc' },
          select: { enrollmentId: true, amount: true, metadata: true },
        })
      : [];
    const lastDeductionByEnrollment = new Map<string, PrepaidRefundBatch>();
    for (const d of deductions) {
      if (!d.enrollmentId) continue;
      const meta = d.metadata as
        | { perLessonCost?: number; lessonsCovered?: number }
        | null
        | undefined;
      lastDeductionByEnrollment.set(d.enrollmentId, {
        amount: d.amount,
        lessonsCovered: meta?.lessonsCovered,
        perLessonCost: meta?.perLessonCost,
      });
    }

    // ── shu davrda (masalan 02.09) yechilib, migratsiyada bekor qilinadigan
    // LESSON_DEDUCTION'lar, o'quvchi bo'yicha yig'ilgan. ─────────────────────
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const { gte: periodGte } = tashkentDayRangeUtc(`${period}-01`);
    const { lt: periodLt } = tashkentDayRangeUtc(
      `${period}-${String(daysInMonth).padStart(2, '0')}`,
    );
    const periodDeductions = await prisma.transaction.findMany({
      where: {
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
        createdAt: { gte: periodGte, lt: periodLt },
        studentId: { in: enrollments.map((e) => e.studentId) },
      },
      select: { studentId: true, amount: true },
    });
    for (const t of periodDeductions) {
      if (t.studentId == null) continue;
      reversedDeductions[t.studentId] =
        (reversedDeductions[t.studentId] ?? 0) + Math.abs(t.amount);
    }

    // ── o'qituvchi stavkalari (guruh-maxsus, aks holda global) ──────────────
    const teacherIds = [
      ...new Set(
        enrollments.flatMap((e) => e.group.teachers.map((t) => t.teacherId)),
      ),
    ];
    const groupIds = [...uniqueGroups.keys()];
    const salaryConfigs = teacherIds.length
      ? await prisma.employeeSalaryConfig.findMany({
          where: {
            userId: { in: teacherIds },
            isActive: true,
            companyId: company.id,
            OR: [{ groupId: null }, { groupId: { in: groupIds } }],
          },
          select: {
            userId: true,
            groupId: true,
            salaryType: true,
            value: true,
          },
        })
      : [];
    const configFor = (teacherId: number, groupId: string) =>
      salaryConfigs.find(
        (c) => c.userId === teacherId && c.groupId === groupId,
      ) ??
      salaryConfigs.find((c) => c.userId === teacherId && c.groupId === null) ??
      null;

    // ── MigrationRow[] ni yig'ish ─────────────────────────────────────────
    for (const e of enrollments) {
      const course = e.group.course;

      // EnrollmentBillingService.prepaidRefundValue bilan bir xil ustuvorlik
      // (scripts/lib/prepaid-refund-price.ts izohiga qarang) — chegirmani
      // batch summasidan to'g'ri o'qiydi, metadata.perLessonCost'ga
      // (chegirmasiz) faqat batch ma'lumoti yo'q bo'lganda tushadi.
      const packPerLessonCost = resolvePackPerLessonCost({
        remaining: e.prepaidLessonsRemaining,
        course,
        batch: lastDeductionByEnrollment.get(e.id) ?? null,
      });

      const plannedLessons = plannedByGroup.get(e.groupId) ?? 0;
      const coveredLessons = lessonDatesInMonth({
        year,
        month,
        exactDays: e.group.exactDays,
        excludedDates: excludedByGroup.get(e.groupId),
        fromDate: e.startDate ? tashkentDateStr(e.startDate) : null,
      }).length;

      allRows.push({
        enrollmentId: e.id,
        studentId: e.studentId,
        studentName: `${e.student.firstName} ${e.student.lastName}`,
        groupId: e.groupId,
        groupName: e.group.groupNumber
          ? `#${e.group.groupNumber} ${e.group.name}`
          : e.group.name,
        branchId: e.group.branchId,
        balance: e.student.balance,
        prepaidLessons: e.prepaidLessonsRemaining,
        packPerLessonCost,
        monthlyPrice: course.price,
        plannedLessons,
        coveredLessons,
        discountPercent: e.student.discountPercent,
      });
    }

    // ── guruh kesimi (CEO qatlami 2) ─────────────────────────────────────
    for (const [groupId, group] of uniqueGroups) {
      const rowsInGroup = enrollments.filter((e) => e.groupId === groupId);
      const plannedLessons = plannedByGroup.get(groupId) ?? 0;
      const newPerLesson = perLessonCostForMonth(
        group.course.price,
        plannedLessons,
      );
      const oldPerLesson = baseLessonPrice(
        group.course.price,
        group.course.lessonPaymentCount,
      );

      const expectedIncome = rowsInGroup.reduce((sum, e) => {
        const covered = lessonDatesInMonth({
          year,
          month,
          exactDays: group.exactDays,
          excludedDates: excludedByGroup.get(groupId),
          fromDate: e.startDate ? tashkentDateStr(e.startDate) : null,
        }).length;
        const charge =
          plannedLessons > 0 && covered >= plannedLessons
            ? group.course.price
            : plannedLessons > 0
              ? Math.round((group.course.price * covered) / plannedLessons)
              : 0;
        return sum + charge;
      }, 0);

      // Faqat "yangi dars narxi almashishi teacher haqiga qanday ta'sir
      // qiladi" — sentabrda haqiqatda o'tiladigan dars soni O'ZGARMAYDI,
      // faqat shu darslardan hisoblanadigan perLessonCost o'zgaradi.
      let teacherPayDelta = 0;
      for (const t of group.teachers) {
        const cfg = configFor(t.teacherId, groupId);
        if (!cfg) continue;
        const version: RateVersion = {
          salaryType: cfg.salaryType,
          value: cfg.value,
          effectiveFrom: new Date(0),
          effectiveTo: null,
        };
        const oldAccrual = perLessonAccrual(
          version,
          oldPerLesson,
          group.course.lessonPaymentCount,
        );
        const newAccrual = perLessonAccrual(
          version,
          newPerLesson,
          plannedLessons,
        );
        teacherPayDelta +=
          (newAccrual - oldAccrual) * plannedLessons * rowsInGroup.length;
      }

      groupSummaries.push({
        groupName: group.groupNumber
          ? `#${group.groupNumber} ${group.name}`
          : group.name,
        courseName: group.course.name,
        studentCount: rowsInGroup.length,
        plannedLessons,
        oldPerLesson,
        newPerLesson,
        expectedIncome,
        teacherPayDelta,
      });
    }
  }

  const plan = buildMigrationPlan({ rows: allRows, reversedDeductions });

  console.log('');
  console.log(renderSummary(plan));

  section('GURUHLAR KESIMI (CEO qatlami 2)');
  printTable(
    [
      'guruh',
      'kurs',
      "o'quvchi",
      'sent. dars',
      'eski/dars',
      'yangi/dars',
      'kutilgan tushum',
      "o'qituvchi delta",
    ],
    groupSummaries
      .sort((a, b) => b.expectedIncome - a.expectedIncome)
      .map((g) => [
        g.groupName,
        g.courseName,
        g.studentCount,
        g.plannedLessons,
        som(g.oldPerLesson),
        som(g.newPerLesson),
        som(g.expectedIncome),
        som(g.teacherPayDelta),
      ]),
    ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r'],
  );

  section("ENG KATTA 20 TA BALANS O'ZGARISHI (CEO qatlami 4)");
  printTable(
    [
      'studentId',
      'ism',
      'eski balans',
      'prepaid qaytdi',
      'davr ichi bekor',
      'oylik hisobi',
      'yangi balans',
      "o'zgarish",
      'holat',
    ],
    plan.biggestChanges.map((s) => [
      s.studentId,
      s.studentName,
      som(s.oldBalance),
      som(s.prepaidRefund),
      som(s.reversedSeptember),
      som(s.monthlyCharge),
      som(s.newBalance),
      som(s.newBalance - s.oldBalance),
      s.state,
    ]),
    ['r', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'l'],
  );

  // ── to'liq o'quvchi ro'yxati CSV'ga (CEO qatlami 3) ─────────────────────
  const csv = renderStudentCsv(plan);
  const outPath = csvOutputPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csv, 'utf-8');

  console.log('');
  console.log(`To'liq o'quvchi ro'yxati (${plan.students.length} ta) yozildi:`);
  console.log(`  ${outPath}`);
  console.log(`Muhit: ${dbEnvLabel()}`);
  console.log(
    "Bu skript FAQAT o'qidi — bazaga hech qanday create/update/delete/upsert yozilmadi.",
  );
}

run(main);
