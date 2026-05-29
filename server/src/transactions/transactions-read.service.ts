import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TransactionType } from '@prisma/client';
import { TransactionQueryDto } from './dto/transaction-query.dto';

@Injectable()
export class TransactionsReadService {
  constructor(private prisma: PrismaService) {}

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
   * For every PAYMENT row on the page, compute where the money went via
   * FIFO allocation over the student's full timeline (all completed
   * payments + non-reversed lesson deductions, ASC).
   *
   * Returns for each PAYMENT:
   *   - allocations: which deduction batches consumed slices of this
   *     payment, plus the cycle number + capacity of each batch
   *   - remainderInBalance: leftover slice that's still sitting on the
   *     student's balance at the end of the walk
   *
   * REVERSED payments and reversed deductions are excluded from the walk —
   * they don't affect the real money trail.
   */
  private async computePaymentDestination(
    studentId: number,
    pageRows: Array<{ id: string; type: TransactionType }>,
  ): Promise<
    Map<
      string,
      {
        allocations: Array<{
          deductionId: string;
          amount: number;
          cycleSequenceNumber: number;
          lessonsCovered: number;
        }>;
        remainderInBalance: number;
      }
    >
  > {
    const result = new Map<
      string,
      {
        allocations: Array<{
          deductionId: string;
          amount: number;
          cycleSequenceNumber: number;
          lessonsCovered: number;
        }>;
        remainderInBalance: number;
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

    // Cycle sequence number per deduction — same per-enrollment ASC count
    // used by computeDeductionCoverage.
    const cycleSeqMap = new Map<string, number>();
    const perEnrollmentCount = new Map<string, number>();
    for (const tx of timeline) {
      if (tx.type !== TransactionType.LESSON_DEDUCTION || !tx.enrollmentId)
        continue;
      const next = (perEnrollmentCount.get(tx.enrollmentId) ?? 0) + 1;
      perEnrollmentCount.set(tx.enrollmentId, next);
      cycleSeqMap.set(tx.id, next);
    }

    // FIFO queue of remaining payment amounts.
    const queue: Array<{ paymentId: string; remaining: number }> = [];

    for (const tx of timeline) {
      if (tx.type === TransactionType.PAYMENT) {
        queue.push({ paymentId: tx.id, remaining: Number(tx.amount) || 0 });
        // Seed an empty entry for every page payment so the UI can render
        // "no allocations yet — fully on balance".
        if (paymentIdsInPage.includes(tx.id) && !result.has(tx.id)) {
          result.set(tx.id, { allocations: [], remainderInBalance: 0 });
        }
        continue;
      }

      // LESSON_DEDUCTION — consume from queue head FIFO.
      let needed = Math.abs(tx.amount);
      const md = (tx.metadata ?? {}) as Record<string, unknown>;
      const lessonsCovered = Number(md.lessonsCovered) || 0;
      const cycleSeq = cycleSeqMap.get(tx.id) ?? 0;

      while (needed > 0 && queue.length > 0) {
        const head = queue[0];
        const take = Math.min(needed, head.remaining);

        if (paymentIdsInPage.includes(head.paymentId)) {
          const entry = result.get(head.paymentId) ?? {
            allocations: [],
            remainderInBalance: 0,
          };
          // Merge consecutive allocations to the same deduction (shouldn't
          // happen often, but defends against split-fill ordering).
          const last = entry.allocations[entry.allocations.length - 1];
          if (last && last.deductionId === tx.id) {
            last.amount += take;
          } else {
            entry.allocations.push({
              deductionId: tx.id,
              amount: take,
              cycleSequenceNumber: cycleSeq,
              lessonsCovered,
            });
          }
          result.set(head.paymentId, entry);
        }

        head.remaining -= take;
        needed -= take;
        if (head.remaining === 0) queue.shift();
      }
      // If `needed` > 0 at this point, the deduction outran available
      // payments (i.e. the student went into debt). The leftover comes from
      // an INITIAL_BALANCE or pushes balance negative; either way it's not
      // funded by a page-payment.
    }

    // Anything left in the queue is still on balance — surface as
    // remainderInBalance on the corresponding page payments.
    for (const head of queue) {
      if (!paymentIdsInPage.includes(head.paymentId)) continue;
      const entry = result.get(head.paymentId) ?? {
        allocations: [],
        remainderInBalance: 0,
      };
      entry.remainderInBalance += head.remaining;
      result.set(head.paymentId, entry);
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
