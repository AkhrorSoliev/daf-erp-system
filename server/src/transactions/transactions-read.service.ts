import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TransactionType } from '@prisma/client';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import {
  computeEnrollmentCoverage,
  type CoveragePrismaLike,
} from '../billing/lesson-coverage.helper';
import {
  ReportBranchIds,
  branchIdWhere,
  studentBranchWhere,
  userBranchWhere,
} from '../common/finance/report-branch-scope';
import {
  replayStudentLedger,
  splitLessonSlices,
  type CreditAllocation,
  type LessonSlice,
} from '../common/finance/ledger-replay';
import { projectLessonDates } from '../common/finance/project-lesson-dates';
import { buildScheduleDayResolver } from '../attendance/shared/schedule-resolver';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';

/**
 * What the "To'lovlar" tab renders under a payment. `reconciled: false` means
 * the ledger chain did not add up — the UI must show the balance facts only
 * and suppress the allocation, never a patched-up number.
 */
export type PaymentDestination = CreditAllocation & {
  reconciled: boolean;
  /**
   * Oldindan to'langan (hali o'tilmagan) darslarning TAXMINIY oxirgi sanasi —
   * guruh jadvalidan proyeksiya. `null` = ayta olmaymiz (jadval noma'lum,
   * guruh tugagan, yoki kutilayotgan dars yo'q). Bu FAKT emas: bayram, bekor
   * qilingan dars yoki jadval o'zgarishi uni keyinga suradi. UI uni "taxminan"
   * deb belgilashi SHART.
   */
  projectedLastLessonDate: Date | null;
};

@Injectable()
export class TransactionsReadService {
  constructor(private prisma: PrismaService) {}

  /**
   * "Nega balans shunday?" summary for the student profile. Aggregates the
   * full ledger into a handful of numbers the To'lovlar tab can show in a
   * single card so admins don't have to scroll the feed (or ask Claude) to
   * understand a 253 000 so'm debt.
   *
   * Returns:
   *   - lessonsAttended      — count of LESSON_CONSUMPTION rows (active)
   *   - totalLessonCost      — sum of |amount| of LESSON_DEDUCTION (active)
   *   - totalPaid            — sum of COMPLETED PAYMENT amounts (active)
   *   - paymentCount         — number of COMPLETED payments
   *   - currentBalance       — student.balance (the canonical number)
   *   - perLessonCost        — primary enrollment's price / lessonPaymentCount
   *   - lastPaymentDate      — most recent COMPLETED PAYMENT createdAt
   *   - debtSinceDate        — start of the CURRENT debt spell (null if clear)
   *   - unpaidLessonsCount   — lessons consumed during that spell
   *
   * Pure projection — no mutation. The "active" filter excludes reversed
   * rows everywhere so the totals always reconcile with the live balance.
   */
  async getBalanceSummary(studentId: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) {
      // Caller (controller) translates this — keep service-level errors
      // generic.
      throw new Error("O'quvchi topilmadi");
    }

    // Chronological ledger walk — single round-trip covers every aggregate
    // we need including the "first time balance went negative" lookup.
    const ledger = await this.prisma.transaction.findMany({
      where: {
        studentId,
        companyId,
        reversedAt: null,
        // A reversal is written as a counter-row of the SAME type, and the
        // counter-row itself carries `reversedAt: null` — so filtering on
        // that field alone drops the original and KEEPS the reversal. The
        // card then counted the undo as a fresh lesson (189 consumption rows
        // across 95 students) and, via `Math.abs` below, as fresh lesson cost
        // (124 rows, 4 572 301 so'm across 65 students). A summary answers
        // "what stands today", so both halves of the pair must go.
        reversedTransactionId: null,
        type: {
          in: [
            TransactionType.PAYMENT,
            TransactionType.LESSON_DEDUCTION,
            TransactionType.LESSON_CONSUMPTION,
          ],
        },
        // PAYMENT rows must be COMPLETED — pending/failed gateway txns
        // shouldn't inflate "to'langan" totals.
        OR: [
          { type: TransactionType.LESSON_DEDUCTION },
          { type: TransactionType.LESSON_CONSUMPTION },
          { payment: { status: 'COMPLETED' } },
        ],
      },
      select: {
        type: true,
        amount: true,
        balanceAfter: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    let lessonsAttended = 0;
    let totalLessonCost = 0;
    let totalPaid = 0;
    let paymentCount = 0;
    let lastPaymentDate: Date | null = null;
    let debtSinceDate: Date | null = null;
    let unpaidLessonsCount = 0;

    for (const row of ledger) {
      if (row.type === TransactionType.PAYMENT) {
        totalPaid += row.amount;
        paymentCount += 1;
        if (!lastPaymentDate || row.createdAt > lastPaymentDate) {
          lastPaymentDate = row.createdAt;
        }
      } else if (row.type === TransactionType.LESSON_DEDUCTION) {
        // Signed, never `Math.abs`. A positive LESSON_DEDUCTION is money
        // going BACK to the student; treating it as more lesson cost is the
        // same defect the payment card had.
        if (row.amount < 0) totalLessonCost += -row.amount;
      } else if (row.type === TransactionType.LESSON_CONSUMPTION) {
        lessonsAttended += 1;
      }

      // The debt spell RESETS the moment the balance recovers. Counting from
      // the first time a student ever dipped made the figure only ever grow:
      // #10460 paid 800 000 so'm after their first dip and the card still read
      // "25 ta dars to'lovsiz" while they owed exactly one lesson.
      if (row.balanceAfter < 0) {
        if (debtSinceDate === null) debtSinceDate = row.createdAt;
      } else {
        debtSinceDate = null;
        unpaidLessonsCount = 0;
      }
      if (
        debtSinceDate !== null &&
        row.type === TransactionType.LESSON_CONSUMPTION
      ) {
        unpaidLessonsCount += 1;
      }
    }

    // Per-lesson cost comes from the primary active enrollment (matches the
    // PaymentsPreviewService convention — the "first ACTIVE enrollment"
    // gets to drive the per-lesson context shown to admins).
    const primaryEnrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        status: 'ACTIVE',
        deletedAt: null,
        group: { companyId, deletedAt: null },
      },
      select: {
        group: {
          select: {
            course: { select: { price: true, lessonPaymentCount: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const perLessonCost = primaryEnrollment
      ? Math.round(
          primaryEnrollment.group.course.price /
            (primaryEnrollment.group.course.lessonPaymentCount || 1),
        )
      : null;

    return {
      lessonsAttended,
      totalLessonCost,
      totalPaid,
      paymentCount,
      currentBalance: student.balance,
      perLessonCost,
      lastPaymentDate,
      debtSinceDate,
      unpaidLessonsCount,
    };
  }

  /**
   * Get paginated transaction history for a student.
   */
  async findByStudent(
    studentId: number,
    query: TransactionQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    // Gated on the STUDENT, not on each row's branch — and the difference
    // matters. This tab exists to explain the student's balance, so filtering
    // the rows would hide historical `branchId = null` movements and leave the
    // balance unexplained. The rule is: if you may see the student, you see
    // their whole ledger; if you may not, you see nothing.
    await this.assertStudentInScope(studentId, companyId, branchIds);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    // `types` (comma-separated) takes precedence over single `type` so the
    // student profile's "To'lovlar" tab can ask for {PAYMENT, REFUND,
    // ADJUSTMENT, INITIAL_BALANCE, BALANCE_WITHDRAWAL, LESSON_DEDUCTION} in
    // one call. LESSON_DEDUCTION is a money-flow row (it moves the balance)
    // so it belongs on this tab too — it is the one type intentionally
    // shared with the "Darslar" tab. LESSON_CONSUMPTION (amount=0) is not
    // requested here. Validation already happened in the DTO regex.
    const typesFilter = query.types
      ? (query.types.split(',') as TransactionType[])
      : query.type
        ? [query.type]
        : undefined;

    const where: Prisma.TransactionWhereInput = {
      studentId,
      companyId,
      ...(typesFilter && { type: { in: typesFilter } }),
      ...(query.startDate &&
        query.endDate && {
          createdAt: {
            gte: new Date(query.startDate),
            lte: new Date(query.endDate + 'T23:59:59.999Z'),
          },
        }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          description: true,
          // LESSON_DEDUCTION rows carry { mode, perLessonCost, lessonsCovered }
          // — the "To'lovlar" tab reads it to label the row ("5 ta dars uchun").
          metadata: true,
          paymentId: true,
          // Join Payment.method so the frontend can render a unified ledger
          // without a second round-trip — PAYMENT rows show Payme/Click/Cash,
          // other types get null.
          payment: {
            select: { id: true, method: true, status: true },
          },
          attendanceId: true,
          enrollmentId: true,
          performedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    // Attach coverage info to LESSON_DEDUCTION rows so the To'lovlar tab can
    // tell admins "this 287 500 so'm covered these 8 lessons".
    const coverageMap = await this.computeDeductionCoverage(rows);

    // Attach "destination" info to PAYMENT rows so the admin sees, on the
    // same row, where the money went — replayed against the stored ledger.
    const destinationMap = await this.computePaymentDestination(
      studentId,
      companyId,
      rows,
    );

    const data = rows.map((r) => ({
      ...r,
      coverage: coverageMap.get(r.id) ?? null,
      destination: destinationMap.get(r.id) ?? null,
    }));

    return { data, total, page, pageSize };
  }

  /**
   * For every PAYMENT row on the page, answer "where did this money go?" by
   * REPLAYING the student's stored ledger — not by re-deriving it.
   *
   * The previous implementation kept a FIFO queue of payments and funded only
   * the deductions that came AFTER each payment. A lesson taken on credit
   * (empty queue) fell through the loop and no later payment ever covered it,
   * so the money that actually cleared that debt was reported as
   * "remainderInBalance" — money the student did not have. Measured on
   * production: 540 of 569 students showed a wrong card, and one student read
   * their card as "I had 233 339 so'm" while sitting at −33 325.
   *
   * Three properties of this version, each load-bearing:
   *
   *   - EVERY balance-moving row is included. ADJUSTMENT alone accounted for
   *     316 rows across 254 students that the old walk could not see.
   *   - NO reversal filter. A reversal is written as a counter-row of the same
   *     type, so including both sides nets to zero and keeps the chain
   *     unbroken (0 breaks over 28 950 production rows; filtering the original
   *     only produced 99). This also kills the old `Math.abs` double-charge.
   *   - FAIL-CLOSED. If the replayed chain ever disagrees with the stored
   *     `balanceBefore` / `balanceAfter`, `reconciled` comes back false and the
   *     caller hides the allocation rather than showing a patched number.
   *
   * The per-lesson slice map is what keeps the date range honest: a payment
   * that funds part of a 5-lesson batch reports only the lessons it paid for.
   */
  private async computePaymentDestination(
    studentId: number,
    companyId: number,
    pageRows: Array<{ id: string; type: TransactionType }>,
  ): Promise<Map<string, PaymentDestination>> {
    const result = new Map<string, PaymentDestination>();

    const pageCreditIds = new Set(
      pageRows
        .filter((r) => r.type === TransactionType.PAYMENT)
        .map((r) => r.id),
    );
    if (pageCreditIds.size === 0) return result;

    // The student's complete money timeline. `amount: { not: 0 }` drops
    // LESSON_CONSUMPTION audit rows (amount = 0) — they move nothing and are
    // the one row type written without a balance lock.
    const timeline = await this.prisma.transaction.findMany({
      where: { studentId, companyId, amount: { not: 0 } },
      select: {
        id: true,
        type: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        enrollmentId: true,
        metadata: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const enrollmentIds = Array.from(
      new Set(
        timeline
          .filter(
            (t) =>
              t.type === TransactionType.LESSON_DEDUCTION && !!t.enrollmentId,
          )
          .map((t) => t.enrollmentId as string),
      ),
    );
    const { byDeduction } = await computeEnrollmentCoverage(
      this.prisma as unknown as CoveragePrismaLike,
      enrollmentIds,
    );

    const lessonSlices = new Map<string, LessonSlice[]>();
    for (const row of timeline) {
      if (row.type !== TransactionType.LESSON_DEDUCTION) continue;
      lessonSlices.set(
        row.id,
        splitLessonSlices(
          row.amount,
          row.metadata,
          byDeduction.get(row.id)?.consumedDates ?? [],
        ),
      );
    }

    const replay = replayStudentLedger(timeline, lessonSlices);

    // Kutilayotgan darslarni sanaga aylantirish — faqat sahifadagi to'lovlar
    // uchun, ya'ni odatda 0–1 ta guruh so'roviga tushadi.
    const enrollmentByDeduction = new Map<string, string | null>(
      timeline
        .filter((t) => t.type === TransactionType.LESSON_DEDUCTION)
        .map((t) => [t.id, t.enrollmentId]),
    );

    for (const id of pageCreditIds) {
      const alloc = replay.byCredit.get(id);
      if (!alloc) continue;
      const projectedLastLessonDate = await this.projectPendingLessonEnd(
        studentId,
        alloc,
        enrollmentByDeduction,
      );
      result.set(id, {
        ...alloc,
        reconciled: replay.reconciled,
        projectedLastLessonDate,
      });
    }

    return result;
  }

  /**
   * "Oldindan to'langan darslar qachongacha yetadi?" — kutilayotgan darslarni
   * guruh jadvali bo'yicha oldinga suradi va OXIRGISINING sanasini qaytaradi.
   *
   * FAIL-CLOSED, xuddi replay'ning o'zi kabi: bir nechta guruh aralashsa,
   * jadval noma'lum bo'lsa yoki proyeksiya kutilgan sondan kam dars topsa —
   * `null` qaytadi va UI oralikni umuman ko'rsatmaydi. Yarim javob bu yerda
   * eng yomon variant: "04.09 gacha yetadi" degan yozuv, aslida oxiri
   * noma'lum bo'lsa, aynan biz tuzatayotgan nuqsonning yangi ko'rinishi.
   */
  private async projectPendingLessonEnd(
    studentId: number,
    alloc: CreditAllocation,
    enrollmentByDeduction: Map<string, string | null>,
  ): Promise<Date | null> {
    if (alloc.pendingLessonCount <= 0) return null;

    // Bir necha guruhning kutilayotgan darslari bitta to'lovda aralashsa,
    // ularni bitta sana bilan ifodalab bo'lmaydi.
    const enrollmentIds = new Set(
      alloc.pendingDeductionIds.map((d) => enrollmentByDeduction.get(d) ?? null),
    );
    if (enrollmentIds.size !== 1) return null;
    const enrollmentId = [...enrollmentIds][0];
    if (!enrollmentId) return null;

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, deletedAt: null },
      select: {
        group: {
          select: {
            id: true,
            branchId: true,
            exactDays: true,
            endDate: true,
            scheduleSnapshots: {
              select: { exactDays: true, validFrom: true, validTo: true },
            },
          },
        },
      },
    });
    const group = enrollment?.group;
    if (!group || group.exactDays.length === 0) return null;

    // Proyeksiya o'quvchining OXIRGI darsidan boshlanadi — bu to'lovning
    // oxirgi darsidan emas. Aks holda keyinroq kelgan pul bilan to'langan
    // darslar ustiga qayta proyeksiya qilinardi.
    const lastAttendance = await this.prisma.attendance.findFirst({
      where: { studentId, groupId: group.id },
      select: { date: true },
      orderBy: { date: 'desc' },
    });
    const anchor = lastAttendance?.date ?? alloc.lastLessonDate;
    if (!anchor) return null;
    const anchorStr = tashkentDateStr(anchor);

    // Oldinga qancha qarash kerakligini bilmasdan bayram/bekor oynasini
    // so'rab bo'lmaydi: haftada 3 dars deb hisoblasak ham, zaxira bilan
    // olamiz. Ortiqcha kun so'rash arzon, kam so'rash — noto'g'ri sana.
    const horizonDays = Math.min(730, alloc.pendingLessonCount * 14 + 30);
    const horizonEnd = new Date(
      anchor.getTime() + horizonDays * 24 * 60 * 60 * 1000,
    );

    const [holidayDates, cancellations] = await Promise.all([
      buildHolidayDateSet(this.prisma, anchor, horizonEnd, group.branchId),
      this.prisma.lessonCancellation.findMany({
        where: { groupId: group.id, deletedAt: null, date: { gte: anchor } },
        select: { date: true },
      }),
    ]);
    const skipDates = new Set(holidayDates);
    for (const c of cancellations) skipDates.add(tashkentDateStr(c.date));

    const projected = projectLessonDates({
      afterDateStr: anchorStr,
      count: alloc.pendingLessonCount,
      resolveScheduleDays: buildScheduleDayResolver(
        group.scheduleSnapshots,
        group.exactDays,
      ),
      skipDates,
      lastPossibleDateStr: group.endDate
        ? tashkentDateStr(group.endDate)
        : null,
    });

    // Kutilgan sondan kam topildi — oxirini aytolmaymiz.
    if (projected.length < alloc.pendingLessonCount) return null;
    return new Date(`${projected[projected.length - 1]}T00:00:00.000Z`);
  }

  /**
   * Get paginated transaction history for a teacher.
   */
  async findByTeacher(
    teacherId: number,
    query: TransactionQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    await this.assertTeacherInScope(teacherId, companyId, branchIds);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.TransactionWhereInput = {
      teacherId,
      companyId,
      ...(query.type && { type: query.type }),
      ...(query.startDate &&
        query.endDate && {
          createdAt: {
            gte: new Date(query.startDate),
            lte: new Date(query.endDate + 'T23:59:59.999Z'),
          },
        }),
    };

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          description: true,
          salaryPaymentId: true,
          performedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Lesson-trail report: lesson deductions + per-lesson consumption rows for
   * one student, enriched with attendance metadata. The endpoint is scoped
   * strictly to LESSON_DEDUCTION and LESSON_CONSUMPTION. LESSON_DEDUCTION is
   * intentionally shared with the "To'lovlar" tab (it is a money-flow row);
   * LESSON_CONSUMPTION (amount=0) is exclusive to this "Darslar" tab.
   * Paginated because active students can produce hundreds of
   * LESSON_CONSUMPTION rows.
   */
  async getLessonTrail(
    studentId: number,
    companyId: number,
    branchIds: ReportBranchIds,
    options: {
      contractId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    await this.assertStudentInScope(studentId, companyId, branchIds);

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;

    const where: Prisma.TransactionWhereInput = {
      studentId,
      companyId,
      type: {
        in: [TransactionType.LESSON_DEDUCTION, TransactionType.LESSON_CONSUMPTION],
      },
      ...(options.contractId && { contractId: options.contractId }),
      ...(options.from &&
        options.to && {
          createdAt: {
            gte: new Date(options.from),
            lte: new Date(options.to + 'T23:59:59.999Z'),
          },
        }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          description: true,
          metadata: true,
          attendanceId: true,
          enrollmentId: true,
          contractId: true,
          reversedTransactionId: true,
          createdAt: true,
          payment: {
            select: { method: true, receiptNumber: true },
          },
          contract: {
            select: { contractNumber: true },
          },
          performedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    // Pull attendance rows in one round-trip so we can enrich LESSON_DEDUCTION
    // and LESSON_CONSUMPTION rows with the lesson date + group name.
    const attendanceIds = rows
      .map((r) => r.attendanceId)
      .filter((id): id is string => !!id);
    const attendances = attendanceIds.length
      ? await this.prisma.attendance.findMany({
          where: { id: { in: attendanceIds } },
          select: {
            id: true,
            date: true,
            group: {
              select: { id: true, name: true, course: { select: { name: true } } },
            },
          },
        })
      : [];
    const attendanceMap = new Map(attendances.map((a) => [a.id, a]));

    // Coverage map: for each LESSON_DEDUCTION row on the page, compute which
    // LESSON_CONSUMPTION rows it covered via FIFO allocation across the full
    // enrollment history (not just the page slice). Answers the admin's
    // question "qaysi 8 darsni bu 287 500 so'm qopladi?".
    const coverageMap = await this.computeDeductionCoverage(rows);

    const data = rows.map((r) => {
      const attendance = r.attendanceId ? attendanceMap.get(r.attendanceId) : null;
      const coverage = coverageMap.get(r.id) ?? null;
      return {
        id: r.id,
        type: r.type,
        amount: r.amount,
        balanceBefore: r.balanceBefore,
        balanceAfter: r.balanceAfter,
        description: r.description,
        metadata: r.metadata,
        contractNumber: r.contract?.contractNumber ?? null,
        paymentMethod: r.payment?.method ?? null,
        paymentReceipt: r.payment?.receiptNumber ?? null,
        lessonDate: attendance?.date ?? null,
        groupName: attendance?.group.name ?? null,
        courseName: attendance?.group.course.name ?? null,
        isReversal: !!r.reversedTransactionId,
        performedBy: r.performedBy,
        createdAt: r.createdAt,
        coverage,
      };
    });

    return { data, total, page, pageSize };
  }

  /**
   * For every LESSON_DEDUCTION row on the page, return its cycle coverage
   * (cycleSequenceNumber, coveredCount, capacity, first/last covered date).
   *
   * Thin wrapper over the shared FIFO engine (`lesson-coverage.helper.ts`):
   * derives the involved enrollment ids from the page rows and delegates the
   * allocation. The helper computes coverage across the FULL enrollment
   * history (not just the paginated slice) and excludes reversed rows.
   */
  private async computeDeductionCoverage(
    pageRows: Array<{
      id: string;
      type: TransactionType;
      enrollmentId: string | null;
    }>,
  ) {
    const enrollmentIds = Array.from(
      new Set(
        pageRows
          .filter(
            (r) =>
              r.type === TransactionType.LESSON_DEDUCTION && !!r.enrollmentId,
          )
          .map((r) => r.enrollmentId as string),
      ),
    );

    const { byDeduction } = await computeEnrollmentCoverage(
      this.prisma as unknown as CoveragePrismaLike,
      enrollmentIds,
    );
    return byDeduction;
  }

  /**
   * "May this caller see this student at all?"
   *
   * Per-entity ledgers are gated by ENTITY access rather than by row
   * attribution — see `findByStudent`. Out of scope reads as "not found" so the
   * id itself leaks nothing.
   */
  private async assertStudentInScope(
    studentId: number,
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<void> {
    if (branchIds == null) return; // CEO, every branch
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        companyId,
        deletedAt: null,
        ...studentBranchWhere(branchIds),
      },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
  }

  /** Teacher twin of `assertStudentInScope` (D6 — one teacher, one branch). */
  private async assertTeacherInScope(
    teacherId: number,
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<void> {
    if (branchIds == null) return;
    const teacher = await this.prisma.user.findFirst({
      where: {
        id: teacherId,
        companyId,
        deletedAt: null,
        AND: [userBranchWhere(branchIds)],
      },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException("O'qituvchi topilmadi");
  }

  /**
   * Get all transactions (admin view) with filters.
   */
  async findAll(
    query: TransactionQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    // Cross-student aggregate list → filter by the ROW's own branch, from the
    // resolved scope. `query.branchId` was a widening parameter here.
    //
    // A `branchId = null` row is therefore invisible in any branch view. That
    // is the intended "unassigned" semantics for an aggregate list: such a row
    // belongs to no branch and shows up only company-wide.
    const where: Prisma.TransactionWhereInput = {
      companyId,
      ...branchIdWhere(branchIds),
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.teacherId && { teacherId: query.teacherId }),
      ...(query.type && { type: query.type }),
      ...(query.startDate &&
        query.endDate && {
          createdAt: {
            gte: new Date(query.startDate),
            lte: new Date(query.endDate + 'T23:59:59.999Z'),
          },
        }),
    };

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          description: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          teacher: { select: { id: true, firstName: true, lastName: true } },
          performedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          branchId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Audit log for the "yo'qolgan o'quvchi" write-off flow.
   * Returns only active (non-reversed) DEBT_WRITE_OFF rows, enriched with
   * the metadata each entry carries (cycleNumber, cycleAbsentCount,
   * perLessonCost, actualWriteOff, previousBalance, newBalance, reason).
   *
   * Branch Directors should be scoped to their own branches at the
   * controller layer (pass branchIds; we fan-in `branchId IN (...)`).
   */
  async findDebtWriteOffs(
    companyId: number,
    options: {
      /**
       * The caller's resolved scope. `null` is a CEO — every branch; `[]` is a
       * caller entitled to none, and must return nothing. It used to be
       * `number[] | undefined` applied behind a `length > 0` check, so `[]`
       * silently removed the predicate and showed every branch instead.
       */
      branchIds?: ReportBranchIds;
      from?: string;
      to?: string;
      performedById?: number;
      page?: number;
      pageSize?: number;
      includeReversed?: boolean;
    } = {},
  ) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;

    const where: Prisma.TransactionWhereInput = {
      companyId,
      type: TransactionType.DEBT_WRITE_OFF,
      ...(options.includeReversed ? {} : { reversedAt: null }),
      ...branchIdWhere(options.branchIds),
      ...(options.performedById && { performedById: options.performedById }),
      ...(options.from &&
        options.to && {
          createdAt: {
            gte: new Date(options.from),
            lte: new Date(options.to + 'T23:59:59.999Z'),
          },
        }),
    };

    const [data, total, sumAggregate] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          description: true,
          metadata: true,
          enrollmentId: true,
          branchId: true,
          createdAt: true,
          reversedAt: true,
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          performedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);

    return {
      data,
      total,
      totalAmount: sumAggregate._sum.amount ?? 0,
      page,
      pageSize,
    };
  }
}
