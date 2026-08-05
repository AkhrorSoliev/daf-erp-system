import { Test } from '@nestjs/testing';
import { TransactionsReadService } from './transactions-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';

describe('TransactionsReadService', () => {
  let service: TransactionsReadService;
  let prisma: {
    transaction: { findMany: jest.Mock; count: jest.Mock };
    attendance: { findMany: jest.Mock };
    student: { findFirst: jest.Mock };
    enrollment: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      student: { findFirst: jest.fn().mockResolvedValue(null) },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionsReadService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(TransactionsReadService);
  });

  describe('findByStudent', () => {
    it('filters by the comma-separated types list including LESSON_DEDUCTION', async () => {
      await service.findByStudent(
        10329,
        { types: 'PAYMENT,REFUND,LESSON_DEDUCTION' } as TransactionQueryDto,
        1001,
        null
      );

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId: 10329,
            companyId: 1001,
            type: { in: ['PAYMENT', 'REFUND', 'LESSON_DEDUCTION'] },
          }),
        }),
      );
    });

    it('selects metadata so LESSON_DEDUCTION rows can be labelled on the tab', async () => {
      await service.findByStudent(10329, {} as TransactionQueryDto, 1001, null);

      const arg = prisma.transaction.findMany.mock.calls[0][0];
      expect(arg.select.metadata).toBe(true);
    });

    it('falls back to the single `type` param when `types` is absent', async () => {
      await service.findByStudent(
        10329,
        { type: 'PAYMENT' } as TransactionQueryDto,
        1001,
       null);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: { in: ['PAYMENT'] } }),
        }),
      );
    });

    it('aggregates PAYMENT destination into a flat toLessons + remainder summary', async () => {
      const ts = (s: string) => new Date(`${s}T00:00:00Z`);

      const pageRows = [
        {
          id: 'p1',
          type: 'PAYMENT',
          amount: 300000,
          balanceBefore: 0,
          balanceAfter: 300000,
          description: "To'lov",
          metadata: null,
          paymentId: 'pmt-1',
          payment: { id: 'pmt-1', method: 'CASH', status: 'COMPLETED' },
          attendanceId: null,
          enrollmentId: null,
          performedBy: null,
          createdAt: ts('2026-05-05'),
        },
      ];

      // Timeline drives the FIFO walk: 300k payment → 287.5k deduction
      // (8 lessons), leaves 12.5k on balance.
      const timeline = [
        { ...pageRows[0] },
        {
          id: 'd1',
          type: 'LESSON_DEDUCTION',
          amount: -287500,
          enrollmentId: 'enr-1',
          metadata: { lessonsCovered: 8 },
          createdAt: ts('2026-05-05'),
        },
      ];

      // The deduction-dates helper runs a second findMany over
      // LESSON_DEDUCTION + LESSON_CONSUMPTION rows for the enrollments
      // touched by the timeline. Same deduction + two consumption rows so
      // first/last covered dates come back populated.
      const enrollmentTxs = [
        {
          id: 'd1',
          type: 'LESSON_DEDUCTION',
          enrollmentId: 'enr-1',
          attendanceId: null,
          metadata: { lessonsCovered: 8 },
          createdAt: ts('2026-05-05'),
        },
        {
          id: 'c1',
          type: 'LESSON_CONSUMPTION',
          enrollmentId: 'enr-1',
          attendanceId: 'a1',
          metadata: null,
          createdAt: ts('2026-05-05'),
        },
        {
          id: 'c2',
          type: 'LESSON_CONSUMPTION',
          enrollmentId: 'enr-1',
          attendanceId: 'a2',
          metadata: null,
          createdAt: ts('2026-05-13'),
        },
      ];

      // findMany call order:
      // 1) page slice 2) destination timeline 3) computeDeductionDates
      prisma.transaction.findMany
        .mockResolvedValueOnce(pageRows)
        .mockResolvedValueOnce(timeline)
        .mockResolvedValueOnce(enrollmentTxs);
      prisma.transaction.count.mockResolvedValueOnce(1);
      prisma.attendance.findMany.mockResolvedValueOnce([
        { id: 'a1', date: ts('2026-05-05') },
        { id: 'a2', date: ts('2026-05-13') },
      ]);

      const res = await service.findByStudent(
        10329,
        {} as TransactionQueryDto,
        1001,
       null);

      expect(res.data[0].destination).toEqual({
        toLessons: 287500,
        remainderInBalance: 12500,
        firstLessonDate: ts('2026-05-05'),
        lastLessonDate: ts('2026-05-13'),
      });
    });

    it('returns the paginated envelope', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        { id: 't1', type: 'PAYMENT', enrollmentId: null },
      ]);
      prisma.transaction.count.mockResolvedValue(1);

      const res = await service.findByStudent(
        10329,
        { page: 2, pageSize: 5 } as TransactionQueryDto,
        1001,
       null);

      // Non-LESSON_DEDUCTION rows get coverage=null. PAYMENT rows pick up
      // a zero-summary destination (no LESSON_DEDUCTION fired in the
      // fully-mocked timeline).
      expect(res.data).toEqual([
        {
          id: 't1',
          type: 'PAYMENT',
          enrollmentId: null,
          coverage: null,
          destination: {
            toLessons: 0,
            remainderInBalance: 0,
            firstLessonDate: null,
            lastLessonDate: null,
          },
        },
      ]);
      expect(res.total).toBe(1);
      expect(res.page).toBe(2);
      expect(res.pageSize).toBe(5);
    });
  });

  describe('getBalanceSummary', () => {
    const ts = (s: string) => new Date(`${s}T00:00:00Z`);

    it('captures firstNegativeDate and counts unpaid lessons when student is in debt', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10260, balance: -253000 });
      // Ledger ordered ASC: payment, deduction, consumption, then the
      // attendance that pushes balance below zero, then more consumptions
      // after that point.
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          type: 'PAYMENT',
          amount: 300000,
          balanceAfter: 300000,
          createdAt: ts('2026-05-05'),
        },
        {
          type: 'LESSON_DEDUCTION',
          amount: -287500,
          balanceAfter: 12500,
          createdAt: ts('2026-05-05'),
        },
        {
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          balanceAfter: 12500,
          createdAt: ts('2026-05-05'),
        },
        {
          type: 'LESSON_DEDUCTION',
          amount: -34500,
          balanceAfter: -22000,
          createdAt: ts('2026-05-20'),
        },
        {
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          balanceAfter: -22000,
          createdAt: ts('2026-05-20'),
        },
        {
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          balanceAfter: -56500,
          createdAt: ts('2026-05-21'),
        },
      ]);
      prisma.enrollment.findFirst.mockResolvedValue({
        group: { course: { price: 690000, lessonPaymentCount: 20 } },
      });

      const res = await service.getBalanceSummary(10260, 1001);

      expect(res).toEqual({
        lessonsAttended: 3,
        totalLessonCost: 322000,
        totalPaid: 300000,
        paymentCount: 1,
        currentBalance: -253000,
        perLessonCost: 34500,
        lastPaymentDate: ts('2026-05-05'),
        firstNegativeDate: ts('2026-05-20'),
        // The deduction at 2026-05-20 took balance below zero. The
        // consumption at that same instant and the one on 05-21 both fall
        // on/after firstNegativeDate.
        unpaidLessonsCount: 2,
      });
    });

    it('returns null firstNegativeDate when the balance has never been negative', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001, balance: 155000 });
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          type: 'PAYMENT',
          amount: 500000,
          balanceAfter: 500000,
          createdAt: ts('2026-05-01'),
        },
        {
          type: 'LESSON_DEDUCTION',
          amount: -345000,
          balanceAfter: 155000,
          createdAt: ts('2026-05-01'),
        },
        {
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          balanceAfter: 155000,
          createdAt: ts('2026-05-01'),
        },
      ]);
      prisma.enrollment.findFirst.mockResolvedValue({
        group: { course: { price: 414000, lessonPaymentCount: 12 } },
      });

      const res = await service.getBalanceSummary(10001, 1001);

      expect(res.firstNegativeDate).toBeNull();
      expect(res.unpaidLessonsCount).toBe(0);
      expect(res.lessonsAttended).toBe(1);
      expect(res.totalPaid).toBe(500000);
      expect(res.perLessonCost).toBe(34500);
    });

    it('throws when student is not found', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(service.getBalanceSummary(99999, 1001)).rejects.toThrow();
    });
  });

  describe('getLessonTrail', () => {
    it('scopes strictly to LESSON_DEDUCTION + LESSON_CONSUMPTION', async () => {
      await service.getLessonTrail(10329, 1001, null, {});

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: { in: ['LESSON_DEDUCTION', 'LESSON_CONSUMPTION'] },
          }),
        }),
      );
    });

    it('enriches LESSON_DEDUCTION rows with FIFO coverage info', async () => {
      const date = (s: string) => new Date(`${s}T00:00:00Z`);
      const ts = (s: string) => new Date(`${s}T00:00:00Z`);

      // Page slice (returned by first findMany call).
      const pageRows = [
        {
          id: 'd1',
          type: 'LESSON_DEDUCTION',
          amount: -287500,
          balanceBefore: 300000,
          balanceAfter: 12500,
          description: null,
          metadata: { mode: 'PARTIAL', lessonsCovered: 8 },
          attendanceId: null,
          enrollmentId: 'enr-1',
          contractId: null,
          reversedTransactionId: null,
          createdAt: ts('2026-05-05'),
          payment: null,
          contract: null,
          performedBy: null,
        },
      ];

      // Full enrollment history (returned by second findMany call inside
      // computeDeductionCoverage).
      const fullHistory = [
        { ...pageRows[0] },
        {
          id: 'c1',
          type: 'LESSON_CONSUMPTION',
          enrollmentId: 'enr-1',
          attendanceId: 'a1',
          metadata: null,
          createdAt: ts('2026-05-05'),
        },
        {
          id: 'c2',
          type: 'LESSON_CONSUMPTION',
          enrollmentId: 'enr-1',
          attendanceId: 'a2',
          metadata: null,
          createdAt: ts('2026-05-07'),
        },
        {
          id: 'c3',
          type: 'LESSON_CONSUMPTION',
          enrollmentId: 'enr-1',
          attendanceId: 'a3',
          metadata: null,
          createdAt: ts('2026-05-08'),
        },
      ];

      prisma.transaction.findMany
        .mockResolvedValueOnce(pageRows) // page slice
        .mockResolvedValueOnce(fullHistory); // enrichment scan
      prisma.transaction.count.mockResolvedValueOnce(1);
      prisma.attendance.findMany.mockResolvedValueOnce([
        { id: 'a1', date: date('2026-05-05') },
        { id: 'a2', date: date('2026-05-07') },
        { id: 'a3', date: date('2026-05-08') },
      ]);

      const res = await service.getLessonTrail(10329, 1001, null, {});

      expect(res.data).toHaveLength(1);
      expect(res.data[0].coverage).toEqual({
        enrollmentId: 'enr-1',
        cycleSequenceNumber: 1,
        coveredCount: 3,
        capacity: 8,
        firstCoveredDate: date('2026-05-05'),
        lastCoveredDate: date('2026-05-08'),
      });
    });

    it('assigns cycleSequenceNumber per enrollment in chronological order', async () => {
      const ts = (s: string) => new Date(`${s}T00:00:00Z`);

      const pageRows = [
        {
          id: 'd1',
          type: 'LESSON_DEDUCTION',
          amount: -207000,
          balanceBefore: 0,
          balanceAfter: 0,
          description: null,
          metadata: { mode: 'PARTIAL', lessonsCovered: 6 },
          attendanceId: null,
          enrollmentId: 'enr-1',
          contractId: null,
          reversedTransactionId: null,
          createdAt: ts('2026-05-05'),
          payment: null,
          contract: null,
          performedBy: null,
        },
        {
          id: 'd2',
          type: 'LESSON_DEDUCTION',
          amount: -34500,
          balanceBefore: 0,
          balanceAfter: 0,
          description: null,
          metadata: { mode: 'SINGLE_UNCOVERED', lessonsCovered: 1 },
          attendanceId: null,
          enrollmentId: 'enr-1',
          contractId: null,
          reversedTransactionId: null,
          createdAt: ts('2026-05-20'),
          payment: null,
          contract: null,
          performedBy: null,
        },
      ];

      prisma.transaction.findMany
        .mockResolvedValueOnce(pageRows)
        .mockResolvedValueOnce(pageRows); // no consumption rows
      prisma.transaction.count.mockResolvedValueOnce(2);

      const res = await service.getLessonTrail(10329, 1001, null, {});

      expect(res.data[0].coverage?.cycleSequenceNumber).toBe(1);
      expect(res.data[1].coverage?.cycleSequenceNumber).toBe(2);
    });
  });
});
