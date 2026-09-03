/**
 * migrate-to-monthly — Oylik to'lovga o'tish MIGRATSIYASI.
 *
 * `--dry-run` (standart, majburiy birinchi): STRICTLY READ-ONLY. Bazadan
 * hozirgi (LESSON_PACK) holatni o'qiydi, sentabr oyi uchun "agar MONTHLY'ga
 * o'tilsa nima o'zgaradi" degan rejani hisoblab, konsolga sarhisob + guruh
 * kesimi chiqaradi va to'liq o'quvchi ro'yxatini CSV'ga yozadi. HECH QANDAY
 * `create`/`update`/`delete`/`upsert`/`$executeRaw` ishlatilmaydi.
 *
 * `--apply --ha-men-tasdiqlayman`: migratsiyani haqiqatda qo'llaydi.
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
import {
  applyMigrationForStudent,
  type ApplyMigrationDeps,
  type ApplyStudentResult,
  type EnrollmentToMigrate,
} from './lib/monthly-migration-apply';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { TransactionsReadService } from '../src/transactions/transactions-read.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';
import { EnrollmentBillingService } from '../src/billing/enrollment-billing.service';

/**
 * `--apply` uchun eng kichik DI grafigi. To'liq `AppModule` ko'tarilmaydi:
 * u Redis, Telegram va cron'larni ham yoqadi — migratsiya skriptida ular
 * na kerak, na xavfsiz.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    CashMovementsService,
    TransactionsWriteService,
    TransactionsReadService,
    TransactionsService,
    SalaryAccrualService,
    EnrollmentBillingService,
    MonthlyChargeService,
  ],
})
class MigrationModule {}

interface CliArgs {
  apply: boolean;
  /** Faqat birinchi N o'quvchini migratsiya qiladi. Prodda bosqichma-bosqich
   * chiqish uchun: avval `--limit=5`, natijani tekshirasiz, keyin limitsiz
   * qayta ishga tushirasiz — bajarilganlar takrorlanmaydi. */
  limit: number | null;
  /** `--apply` yolg'iz yetarli emas: xato bosilgan bayroq 370 o'quvchining
   * balansini qayta yozmasligi uchun ikkinchi, ataylab uzun tasdiq kerak. */
  confirmed: boolean;
  period: string;
}

function parseCliArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const confirmed = argv.includes('--ha-men-tasdiqlayman');
  const limitTok = argv.find((a) => a.startsWith('--limit='));
  const limit = limitTok ? Number(limitTok.split('=')[1]) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error(`--limit musbat butun son bo'lishi kerak: "${limitTok}"`);
  }
  const periodTok = argv.find((a) => a.startsWith('--period='));
  const period = periodTok
    ? periodTok.split('=')[1]
    : tashkentDateStr(new Date()).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(
      `--period noto'g'ri format: "${period}" (kutilgan YYYY-MM, masalan 2026-09)`,
    );
  }
  return { apply, confirmed, limit, period };
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


/** Qo'llash natijasi CSV'si — bashorat CSV'si bilan qator-qator solishtirish
 * uchun ayni ustunlar tartibida. */
function renderOutcomeCsv(rows: ApplyStudentResult[]): string {
  const head = [
    'studentId',
    'oldBalance',
    'prepaidRefund',
    'reversedSeptember',
    'monthlyCharge',
    'newBalance',
    'reversedDeductionCount',
    'accrualsRecomputed',
  ].join(',');
  const body = rows
    .map((r) =>
      [
        r.studentId,
        r.oldBalance,
        r.prepaidRefund,
        r.reversedSeptember,
        r.monthlyCharge,
        r.newBalance,
        r.reversedDeductionCount,
        r.accrualsRecomputed,
      ].join(','),
    )
    .join('\n');
  return `${head}\n${body}\n`;
}

interface RunApplyParams {
  plan: ReturnType<typeof buildMigrationPlan>;
  migrateByStudent: Map<
    number,
    { companyId: number; enrollments: EnrollmentToMigrate[] }
  >;
  year: number;
  month: number;
  period: string;
  limit: number | null;
}

/**
 * Migratsiyani HAQIQATDA qo'llaydi.
 *
 * Har o'quvchi — o'zining alohida Serializable tranzaksiyasida. Bittasi
 * yiqilsa qolgan 369 tasi davom etadi; xatolar oxirida ro'yxat bilan
 * chiqariladi va chiqish kodi 1 bo'ladi, shunda "jimgina yarim bajarildi"
 * degan holat bo'lmaydi.
 *
 * Qayta ishga tushirish xavfsiz: `applyMigrationForStudent` ning har qadami
 * idempotent, `@@unique([enrollmentId, periodYear, periodMonth])` esa
 * ikki marta hisoblashning oxirgi to'sig'i.
 */
async function runApply(params: RunApplyParams): Promise<void> {
  const { plan, migrateByStudent, year, month, period, limit } = params;

  const targets =
    limit === null
      ? [...migrateByStudent.entries()]
      : [...migrateByStudent.entries()].slice(0, limit);

  section(`MIGRATSIYA QO'LLANMOQDA — davr ${period} — ${dbEnvLabel()}`);
  console.log(
    `O'quvchi: ${targets.length} ta` +
      (limit === null ? '' : ` (jami ${migrateByStudent.size} tadan --limit)`) +
      '. Har biri alohida tranzaksiyada.',
  );
  console.log('');

  const app = await NestFactory.createApplicationContext(MigrationModule, {
    logger: ['error'],
  });
  const prismaService = app.get(PrismaService);
  const transactionsWrite = app.get(TransactionsWriteService);
  const enrollmentBilling = app.get(EnrollmentBillingService);
  const chargeService = app.get(MonthlyChargeService);
  const accrualService = app.get(SalaryAccrualService);

  const deps: ApplyMigrationDeps = {
    reverseTransaction: (originalId, p, tx) =>
      transactionsWrite.reverseTransaction(originalId, p, tx) as Promise<{
        amount: number;
      }>,
    refundPrepaidToBalance: (tx, p) =>
      enrollmentBilling.refundPrepaidToBalance(tx, p),
    createChargeForEnrollment: (tx, p) =>
      chargeService.createChargeForEnrollment(tx, p),
    reverseAccrualForAttendance: (p) =>
      accrualService.reverseAccrualForAttendance(p),
    createAccrual: (p) => accrualService.createAccrual(p),
  };

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const { gte: periodGte } = tashkentDayRangeUtc(`${period}-01`);
  const { lt: periodLt } = tashkentDayRangeUtc(
    `${period}-${String(daysInMonth).padStart(2, '0')}`,
  );

  const results: ApplyStudentResult[] = [];
  const failures: { studentId: number; message: string }[] = [];

  for (const [studentId, bucket] of targets) {
    try {
      const res = await prismaService.$transaction(
        (tx) =>
          applyMigrationForStudent({
            tx,
            deps,
            studentId,
            companyId: bucket.companyId,
            periodYear: year,
            periodMonth: month,
            periodGte,
            periodLt,
            enrollments: bucket.enrollments,
          }),
        { isolationLevel: 'Serializable', timeout: 30_000, maxWait: 15_000 },
      );
      results.push(res);
    } catch (err) {
      failures.push({
        studentId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await app.close();

  // ── tekshiruv ─────────────────────────────────────────────────────────
  const totalPrepaid = results.reduce((a, r) => a + r.prepaidRefund, 0);
  const totalReversed = results.reduce((a, r) => a + r.reversedSeptember, 0);
  const totalCharged = results.reduce((a, r) => a + r.monthlyCharge, 0);
  const totalDelta = results.reduce(
    (a, r) => a + (r.newBalance - r.oldBalance),
    0,
  );
  const expectedDelta = totalPrepaid + totalReversed - totalCharged;

  section('NATIJA');
  printTable(
    ["ko'rsatkich", 'qiymat'],
    [
      ["Muvaffaqiyatli o'quvchi", String(results.length)],
      ['Yiqilgan', String(failures.length)],
      ['Prepaid qaytarildi', som(totalPrepaid)],
      ['Davr ichi bekor qilindi', som(totalReversed)],
      ['Oylik hisoblandi', som(totalCharged)],
      ['Balanslar jami o`zgarishi', som(totalDelta)],
      ['Kutilgan o`zgarish', som(expectedDelta)],
    ],
    ['l', 'r'],
  );

  const outPath = path.join(
    __dirname,
    '..',
    '..',
    'docs',
    `migration-outcome-${tashkentDateStr(new Date())}.csv`,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderOutcomeCsv(results), 'utf-8');
  console.log('');
  console.log(`Natija CSV: ${outPath}`);
  console.log(`Bashorat CSV bilan qator-qator solishtiring.`);

  // Bashorat bilan haqiqat mos keldimi? `--limit` bilan ishlanganda taqqoslash
  // ma'nosiz — bashorat butun qamrov uchun, qo'llangani esa faqat bir qismi.
  const predictedCharge = plan.students.reduce(
    (a, st) => a + st.monthlyCharge,
    0,
  );
  if (limit === null && predictedCharge !== totalCharged) {
    console.log('');
    console.log(
      `DIQQAT: bashorat ${som(predictedCharge)} edi, haqiqatda ${som(totalCharged)} hisoblandi.`,
    );
  }

  if (totalDelta !== expectedDelta) {
    throw new Error(
      `Ledger tengligi buzildi: balanslar ${totalDelta}, kutilgan ${expectedDelta}.`,
    );
  }

  if (failures.length > 0) {
    section("YIQILGAN O'QUVCHILAR");
    for (const f of failures) {
      console.log(`  #${f.studentId}: ${f.message}`);
    }
    throw new Error(
      `${failures.length} ta o'quvchi migratsiya qilinmadi. ` +
        `Tuzatib, skriptni QAYTA ishga tushiring — bajarilganlar takrorlanmaydi.`,
    );
  }

  console.log('');
  console.log("Migratsiya tugadi. Hech qanday xato yo'q.");
}

async function main(prisma: PrismaClient) {
  const { apply, confirmed, limit, period } = parseCliArgs();

  if (apply && !confirmed) {
    throw new Error(
      "--apply yolg'iz ishlamaydi. 370 o'quvchining balansi qayta yoziladi.\n" +
        "Rostdan ham qo'llamoqchi bo'lsangiz, qo'shimcha bayroqni ham bering:\n" +
        '  npx ts-node scripts/migrate-to-monthly.ts --apply --ha-men-tasdiqlayman',
    );
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
  // `--apply` uchun: o'quvchi -> uning barcha yozilishlari. Bir o'quvchi
  // bitta tranzaksiyada migratsiya qilinadi, shuning uchun yozilishlari
  // birga turishi kerak.
  const migrateByStudent = new Map<
    number,
    { companyId: number; enrollments: EnrollmentToMigrate[] }
  >();

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
        status: true,
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
            companyId: true,
            statusEnum: true,
            exactDays: true,
            courseId: true,
            teachers: { select: { teacherId: true } },
            course: {
              select: {
                name: true,
                price: true,
                lessonPaymentCount: true,
                paymentModel: true,
              },
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

      const bucket = migrateByStudent.get(e.studentId) ?? {
        companyId: company.id,
        enrollments: [],
      };
      bucket.enrollments.push({
        enrollment: {
          id: e.id,
          studentId: e.studentId,
          groupId: e.groupId,
          status: e.status,
          startDate: e.startDate,
          group: {
            id: e.group.id,
            branchId: e.group.branchId,
            companyId: e.group.companyId,
            statusEnum: e.group.statusEnum,
            exactDays: e.group.exactDays,
            // Hisob yaratilayotganda kurs allaqachon MONTHLY bo'lgan
            // bo'ladi (5-qadam kursni oldin almashtiradi), shuning uchun
            // bu yerda MONTHLY deb beriladi — aks holda
            // createChargeForEnrollment o'z qorovulida to'xtardi.
            course: {
              price: e.group.course.price,
              paymentModel: PaymentModel.MONTHLY,
            },
          },
        },
        courseId: e.group.courseId,
        discountPercent: e.student.discountPercent,
      });
      migrateByStudent.set(e.studentId, bucket);
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

  if (apply) {
    await runApply({
      plan,
      migrateByStudent,
      year,
      month,
      period,
      limit,
    });
    return;
  }

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
