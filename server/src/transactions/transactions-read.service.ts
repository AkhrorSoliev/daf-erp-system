import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TransactionType } from '@prisma/client';
import { TransactionQueryDto } from './dto/transaction-query.dto';

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
   *   - firstNegativeDate    — first ledger row where balanceAfter < 0
   *   - unpaidLessonsCount   — LESSON_CONSUMPTION rows on/after firstNegativeDate
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
      orderBy: { createdAt: 'asc' },
    });

    let lessonsAttended = 0;
    let totalLessonCost = 0;
    let totalPaid = 0;
    let paymentCount = 0;
    let lastPaymentDate: Date | null = null;
    let firstNegativeDate: Date | null = null;
    let unpaidLessonsCount = 0;

    for (const row of ledger) {
      if (row.type === TransactionType.PAYMENT) {
        totalPaid += row.amount;
        paymentCount += 1;
        if (!lastPaymentDate || row.createdAt > lastPaymentDate) {
          lastPaymentDate = row.createdAt;
        }
      } else if (row.type === TransactionType.LESSON_DEDUCTION) {
        totalLessonCost += Math.abs(row.amount);
      } else if (row.type === TransactionType.LESSON_CONSUMPTION) {
        lessonsAttended += 1;
      }

      if (firstNegativeDate === null && row.balanceAfter < 0) {
        firstNegativeDate = row.createdAt;
      }
      if (
        firstNegativeDate !== null &&
        row.type === TransactionType.LESSON_CONSUMPTION &&
        row.createdAt >= firstNegativeDate
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
      firstNegativeDate,
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
  ) {
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
    // same row, where the money went: FIFO across the student's full
    // payment + deduction timeline.
    const destinationMap = await this.computePaymentDestination(
      studentId,
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
   * For every PAYMENT row on the page, compute a flat "where did the money
   * go?" summary admins can scan in one glance:
   *
   *   - toLessons          — total so'm the payment funded for lessons
   *   - remainderInBalance — leftover that's still sitting on the balance
   *   - firstLessonDate    — earliest covered lesson date across allocations
   *   - lastLessonDate     — latest covered lesson date across allocations
   *
   * Implementation: FIFO-allocate each PAYMENT slice against the student's
   * full LESSON_DEDUCTION timeline, then aggregate by payment. Per-deduction
   * coverage dates come from the same FIFO-over-consumptions logic used by
   * the LESSON_DEDUCTION coverage map. Reversed rows are excluded.
   *
   * Earlier iterations exposed per-Sikl bullet allocations on the UI, but
   * admins found "Sikl #3" / "Sikl #4" jargon confusing — especially when
   * the same payment funded two different cycle numbers and the next
   * payment funded different ones again. The summary shape drops the
   * jargon entirely.
   */
  private async computePaymentDestination(
    studentId: number,
    pageRows: Array<{ id: string; type: TransactionType }>,
  ): Promise<
    Map<
      string,
      {
        toLessons: number;
        remainderInBalance: number;
        firstLessonDate: Date | null;
        lastLessonDate: Date | null;
      }
    >
  > {
    const result = new Map<
      string,
      {
        toLessons: number;
        remainderInBalance: number;
        firstLessonDate: Date | null;
        lastLessonDate: Date | null;
      }
    >();

    const paymentIdsInPage = pageRows
      .filter((r) => r.type === TransactionType.PAYMENT)
      .map((r) => r.id);
    if (paymentIdsInPage.length === 0) return result;

    // Full student timeline: PAYMENT (COMPLETED, not reversed) + non-reversed
    // LESSON_DEDUCTION rows, oldest first.
    const timeline = await this.prisma.transaction.findMany({
      where: {
        studentId,
        type: {
          in: [TransactionType.PAYMENT, TransactionType.LESSON_DEDUCTION],
        },
        reversedAt: null,
        OR: [
          { type: TransactionType.LESSON_DEDUCTION },
          { payment: { status: 'COMPLETED' } },
        ],
      },
      select: {
        id: true,
        type: true,
        amount: true,
        enrollmentId: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Per-deduction covered date range — fetched once for every enrollment
    // referenced by the timeline so we can aggregate first/last dates on
    // the payment side without re-walking consumptions per page-PAYMENT.
    const enrollmentIdsInTimeline = Array.from(
      new Set(
        timeline
          .filter(
            (t) =>
              t.type === TransactionType.LESSON_DEDUCTION && !!t.enrollmentId,
          )
          .map((t) => t.enrollmentId as string),
      ),
    );
    const deductionDates =
      enrollmentIdsInTimeline.length > 0
        ? await this.computeDeductionDates(enrollmentIdsInTimeline)
        : new Map<string, { firstDate: Date | null; lastDate: Date | null }>();

    // Seed an empty entry for every page payment so the UI gets a stable
    // shape even when nothing has been deducted yet.
    for (const id of paymentIdsInPage) {
      result.set(id, {
        toLessons: 0,
        remainderInBalance: 0,
        firstLessonDate: null,
        lastLessonDate: null,
      });
    }

    // FIFO queue of remaining payment amounts.
    const queue: Array<{ paymentId: string; remaining: number }> = [];

    const widenDateRange = (
      paymentId: string,
      first: Date | null,
      last: Date | null,
    ) => {
      const entry = result.get(paymentId);
      if (!entry) return;
      if (first) {
        if (
          entry.firstLessonDate === null ||
          first.getTime() < entry.firstLessonDate.getTime()
        ) {
          entry.firstLessonDate = first;
        }
      }
      if (last) {
        if (
          entry.lastLessonDate === null ||
          last.getTime() > entry.lastLessonDate.getTime()
        ) {
          entry.lastLessonDate = last;
        }
      }
    };

    for (const tx of timeline) {
      if (tx.type === TransactionType.PAYMENT) {
        queue.push({ paymentId: tx.id, remaining: Number(tx.amount) || 0 });
        continue;
      }

      // LESSON_DEDUCTION — drain from queue head FIFO.
      let needed = Math.abs(tx.amount);
      const dates = deductionDates.get(tx.id) ?? {
        firstDate: null,
        lastDate: null,
      };

      while (needed > 0 && queue.length > 0) {
        const head = queue[0];
        const take = Math.min(needed, head.remaining);

        if (paymentIdsInPage.includes(head.paymentId)) {
          const entry = result.get(head.paymentId)!;
          entry.toLessons += take;
          widenDateRange(head.paymentId, dates.firstDate, dates.lastDate);
        }

        head.remaining -= take;
        needed -= take;
        if (head.remaining === 0) queue.shift();
      }
    }

    // Anything left in the queue is still on balance — surface as
    // remainderInBalance on the corresponding page payments.
    for (const head of queue) {
      if (!paymentIdsInPage.includes(head.paymentId)) continue;
      const entry = result.get(head.paymentId)!;
      entry.remainderInBalance += head.remaining;
    }

    return result;
  }

  /**
   * Per-deduction first/last covered lesson date for a set of enrollments.
   * Same FIFO-over-consumptions logic as computeDeductionCoverage, scoped
   * down to just the dates we need for the PAYMENT destination summary.
   */
  private async computeDeductionDates(
    enrollmentIds: string[],
  ): Promise<Map<string, { firstDate: Date | null; lastDate: Date | null }>> {
    const result = new Map<
      string,
      { firstDate: Date | null; lastDate: Date | null }
    >();
    if (enrollmentIds.length === 0) return result;

    const allTxs = await this.prisma.transaction.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        type: {
          in: [
            TransactionType.LESSON_DEDUCTION,
            TransactionType.LESSON_CONSUMPTION,
          ],
        },
        reversedAt: null,
      },
      select: {
        id: true,
        type: true,
        enrollmentId: true,
        attendanceId: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const consumptionAttIds = allTxs
      .filter(
        (t) =>
          t.type === TransactionType.LESSON_CONSUMPTION && !!t.attendanceId,
      )
      .map((t) => t.attendanceId as string);
    const attendanceDates = consumptionAttIds.length
      ? await this.prisma.attendance.findMany({
          where: { id: { in: consumptionAttIds } },
          select: { id: true, date: true },
        })
      : [];
    const attDateMap = new Map(attendanceDates.map((a) => [a.id, a.date]));

    const byEnrollment = new Map<string, typeof allTxs>();
    for (const tx of allTxs) {
      if (!tx.enrollmentId) continue;
      const list = byEnrollment.get(tx.enrollmentId) ?? [];
      list.push(tx);
      byEnrollment.set(tx.enrollmentId, list);
    }

    for (const [, txs] of byEnrollment) {
      const buckets: Array<{
        deductionId: string;
        capacity: number;
        consumedDates: Date[];
      }> = [];
      for (const tx of txs) {
        if (tx.type === TransactionType.LESSON_DEDUCTION) {
          const md = (tx.metadata ?? {}) as Record<string, unknown>;
          const capacity = Number(md.lessonsCovered) || 0;
          buckets.push({ deductionId: tx.id, capacity, consumedDates: [] });
          result.set(tx.id, { firstDate: null, lastDate: null });
        } else if (tx.type === TransactionType.LESSON_CONSUMPTION) {
          const bucket = buckets.find(
            (b) => b.consumedDates.length < b.capacity,
          );
          if (!bucket) continue;
          const date = tx.attendanceId
            ? attDateMap.get(tx.attendanceId)
            : undefined;
          bucket.consumedDates.push(date ?? tx.createdAt);
        }
      }
      for (const bucket of buckets) {
        const entry = result.get(bucket.deductionId);
        if (!entry) continue;
        const sorted = [...bucket.consumedDates].sort(
          (a, b) => a.getTime() - b.getTime(),
        );
        entry.firstDate = sorted[0] ?? null;
        entry.lastDate = sorted[sorted.length - 1] ?? null;
      }
    }
    return result;
  }

  /**
   * Get paginated transaction history for a teacher.
   */
  async findByTeacher(
    teacherId: number,
    query: TransactionQueryDto,
    companyId: number,
  ) {
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
    options: {
      contractId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
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
   * For every LESSON_DEDUCTION row on the page, compute:
   *   - cycleSequenceNumber — index among non-reversed deductions for this
   *     enrollment (1-based)
   *   - coveredCount — how many LESSON_CONSUMPTION rows this batch paid for
   *   - firstCoveredDate / lastCoveredDate — date range of those lessons
   *
   * Allocation is FIFO across the FULL enrollment history (not just the
   * paginated slice): we walk all deductions + consumptions ASC and pour
   * each consumption into the oldest non-full deduction bucket. Reversed
   * rows are excluded.
   */
  private async computeDeductionCoverage(
    pageRows: Array<{
      id: string;
      type: TransactionType;
      enrollmentId: string | null;
    }>,
  ): Promise<
    Map<
      string,
      {
        cycleSequenceNumber: number;
        coveredCount: number;
        capacity: number;
        firstCoveredDate: Date | null;
        lastCoveredDate: Date | null;
      }
    >
  > {
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

    const result = new Map<
      string,
      {
        cycleSequenceNumber: number;
        coveredCount: number;
        capacity: number;
        firstCoveredDate: Date | null;
        lastCoveredDate: Date | null;
      }
    >();
    if (enrollmentIds.length === 0) return result;

    const allTxs = await this.prisma.transaction.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        type: {
          in: [
            TransactionType.LESSON_DEDUCTION,
            TransactionType.LESSON_CONSUMPTION,
          ],
        },
        reversedAt: null,
      },
      select: {
        id: true,
        type: true,
        enrollmentId: true,
        attendanceId: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // One round-trip for all consumption attendance dates.
    const consumptionAttIds = allTxs
      .filter(
        (t) =>
          t.type === TransactionType.LESSON_CONSUMPTION && !!t.attendanceId,
      )
      .map((t) => t.attendanceId as string);
    const attendanceDates = consumptionAttIds.length
      ? await this.prisma.attendance.findMany({
          where: { id: { in: consumptionAttIds } },
          select: { id: true, date: true },
        })
      : [];
    const attDateMap = new Map(attendanceDates.map((a) => [a.id, a.date]));

    // Group by enrollment, allocate FIFO.
    const byEnrollment = new Map<string, typeof allTxs>();
    for (const tx of allTxs) {
      if (!tx.enrollmentId) continue;
      const list = byEnrollment.get(tx.enrollmentId) ?? [];
      list.push(tx);
      byEnrollment.set(tx.enrollmentId, list);
    }

    for (const [, txs] of byEnrollment) {
      let cycleSeq = 0;
      const buckets: Array<{
        deductionId: string;
        capacity: number;
        consumedDates: Date[];
      }> = [];

      for (const tx of txs) {
        if (tx.type === TransactionType.LESSON_DEDUCTION) {
          cycleSeq += 1;
          const md = (tx.metadata ?? {}) as Record<string, unknown>;
          const capacity = Number(md.lessonsCovered) || 0;
          buckets.push({ deductionId: tx.id, capacity, consumedDates: [] });
          result.set(tx.id, {
            cycleSequenceNumber: cycleSeq,
            coveredCount: 0,
            capacity,
            firstCoveredDate: null,
            lastCoveredDate: null,
          });
        } else if (tx.type === TransactionType.LESSON_CONSUMPTION) {
          const bucket = buckets.find(
            (b) => b.consumedDates.length < b.capacity,
          );
          if (!bucket) continue;
          const date = tx.attendanceId
            ? attDateMap.get(tx.attendanceId)
            : undefined;
          bucket.consumedDates.push(date ?? tx.createdAt);
        }
      }

      // Settle final stats per bucket.
      for (const bucket of buckets) {
        const entry = result.get(bucket.deductionId);
        if (!entry) continue;
        const sorted = [...bucket.consumedDates].sort(
          (a, b) => a.getTime() - b.getTime(),
        );
        entry.coveredCount = sorted.length;
        entry.firstCoveredDate = sorted[0] ?? null;
        entry.lastCoveredDate = sorted[sorted.length - 1] ?? null;
      }
    }

    return result;
  }

  /**
   * Get all transactions (admin view) with filters.
   */
  async findAll(query: TransactionQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.TransactionWhereInput = {
      companyId,
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.teacherId && { teacherId: query.teacherId }),
      ...(query.type && { type: query.type }),
      ...(query.branchId && { branchId: query.branchId }),
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
      branchId?: number;
      branchIds?: number[];
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
      ...(options.branchId && { branchId: options.branchId }),
      ...(options.branchIds &&
        options.branchIds.length > 0 && {
          branchId: { in: options.branchIds },
        }),
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
