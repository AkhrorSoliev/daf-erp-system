import { Test } from '@nestjs/testing';
import { TransactionsReadService } from './transactions-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';

describe('TransactionsReadService', () => {
  let service: TransactionsReadService;
  let prisma: {
    transaction: { findMany: jest.Mock; count: jest.Mock };
    attendance: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
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
      await service.findByStudent(10329, {} as TransactionQueryDto, 1001);

      const arg = prisma.transaction.findMany.mock.calls[0][0];
      expect(arg.select.metadata).toBe(true);
    });

    it('falls back to the single `type` param when `types` is absent', async () => {
      await service.findByStudent(
        10329,
        { type: 'PAYMENT' } as TransactionQueryDto,
        1001,
      );

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: { in: ['PAYMENT'] } }),
        }),
      );
    });

    it('computes FIFO PAYMENT destination across the full timeline', async () => {
      const ts = (s: string) => new Date(`${s}T00:00:00Z`);

      // Page returns one PAYMENT row.
      const pageRows = [
        {
          id: 'p1',
          type: 'PAYMENT',
          amount: 300000,
          balanceBefore: 0,
          balanceAfter: 300000,
          description: 'To\'lov',
          metadata: null,
          paymentId: 'pmt-1',
          payment: { id: 'pmt-1', method: 'CASH', status: 'COMPLETED' },
          attendanceId: null,
          enrollmentId: null,
          performedBy: null,
          createdAt: ts('2026-05-05'),
        },
      ];

      // Full timeline: payment 300k → deduction 287.5k (Sikl #1, 8 dars).
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

      // findMany call order: 1) page slice 2) computePaymentDestination
      // timeline. computeDeductionCoverage early-returns (no deductions
      // in the page) so it doesn't hit findMany.
      prisma.transaction.findMany
        .mockResolvedValueOnce(pageRows)
        .mockResolvedValueOnce(timeline);
      prisma.transaction.count.mockResolvedValueOnce(1);

      const res = await service.findByStudent(
        10329,
        {} as TransactionQueryDto,
        1001,
      );

      expect(res.data[0].destination).toEqual({
        allocations: [
          expect.objectContaining({
            deductionId: 'd1',
            amount: 287500,
            cycleSequenceNumber: 1,
            lessonsCovered: 8,
          }),
        ],
        remainderInBalance: 12500,
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
      );

      // Non-LESSON_DEDUCTION rows get coverage=null. PAYMENT rows pick up
      // an empty destination from the FIFO walk (no timeline available in
      // this test fixture — prisma is fully mocked).
      expect(res.data).toEqual([
        {
          id: 't1',
          type: 'PAYMENT',
          enrollmentId: null,
          coverage: null,
          destination: { allocations: [], remainderInBalance: 0 },
        },
      ]);
      expect(res.total).toBe(1);
      expect(res.page).toBe(2);
      expect(res.pageSize).toBe(5);
    });
  });

  describe('getLessonTrail', () => {
    it('scopes strictly to LESSON_DEDUCTION + LESSON_CONSUMPTION', async () => {
      await service.getLessonTrail(10329, 1001, {});

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

      const res = await service.getLessonTrail(10329, 1001, {});

      expect(res.data).toHaveLength(1);
      expect(res.data[0].coverage).toEqual({
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

      const res = await service.getLessonTrail(10329, 1001, {});

      expect(res.data[0].coverage?.cycleSequenceNumber).toBe(1);
      expect(res.data[1].coverage?.cycleSequenceNumber).toBe(2);
    });
  });
});
