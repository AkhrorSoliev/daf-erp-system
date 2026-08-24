import { Test } from '@nestjs/testing';
import { TransactionsReadService } from './transactions-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';

describe('TransactionsReadService', () => {
  let service: TransactionsReadService;
  let prisma: {
    transaction: { findMany: jest.Mock; count: jest.Mock };
    attendance: { findMany: jest.Mock; findFirst: jest.Mock };
    student: { findFirst: jest.Mock };
    enrollment: { findFirst: jest.Mock };
    lessonCancellation: { findMany: jest.Mock };
    holiday: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendance: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      student: { findFirst: jest.fn().mockResolvedValue(null) },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
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
        null,
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
        null,
      );

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: { in: ['PAYMENT'] } }),
        }),
      );
    });

    it('reports where a payment went, replayed against the stored balances', async () => {
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

      // 300k payment → 287.5k deduction (8 lessons) → 12.5k never spent.
      const timeline = [
        { ...pageRows[0] },
        {
          id: 'd1',
          type: 'LESSON_DEDUCTION',
          amount: -287500,
          balanceBefore: 300000,
          balanceAfter: 12500,
          enrollmentId: 'enr-1',
          metadata: { lessonsCovered: 8 },
        },
      ];

      const enrollmentTxs = [
        {
          id: 'd1',
          type: 'LESSON_DEDUCTION',
          amount: -287500,
          enrollmentId: 'enr-1',
          attendanceId: null,
          metadata: { lessonsCovered: 8 },
          createdAt: ts('2026-05-05'),
        },
        {
          id: 'c1',
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          enrollmentId: 'enr-1',
          attendanceId: 'a1',
          metadata: null,
          createdAt: ts('2026-05-05'),
        },
        {
          id: 'c2',
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          enrollmentId: 'enr-1',
          attendanceId: 'a2',
          metadata: null,
          createdAt: ts('2026-05-13'),
        },
      ];

      // Keyed on the WHERE shape rather than on call order — the previous
      // mockResolvedValueOnce chain silently fed the wrong rows to the wrong
      // query as soon as the service issued one more round-trip.
      prisma.transaction.findMany.mockImplementation((args: any) => {
        const where = args?.where ?? {};
        if (where.enrollmentId) return Promise.resolve(enrollmentTxs);
        if (where.amount) return Promise.resolve(timeline);
        return Promise.resolve(pageRows);
      });
      prisma.transaction.count.mockResolvedValueOnce(1);
      prisma.attendance.findMany.mockResolvedValueOnce([
        { id: 'a1', date: ts('2026-05-05') },
        { id: 'a2', date: ts('2026-05-13') },
      ]);

      const res = await service.findByStudent(
        10329,
        {} as TransactionQueryDto,
        1001,
        null,
      );

      expect(res.data[0].destination).toEqual({
        amount: 300000,
        toPreviousDebt: 0,
        debtLessonCount: 0,
        debtFirstLessonDate: null,
        debtLastLessonDate: null,
        toLessons: 287500,
        lessonCount: 8,
        heldLessonCount: 2,
        pendingLessonCount: 6,
        pendingDeductionIds: ['d1'],
        firstLessonDate: ts('2026-05-05'),
        lastLessonDate: ts('2026-05-13'),
        toOther: 0,
        unspent: 12500,
        reconciled: true,
        // Enrollment topilmadi (mock `null`) — oxirini aytolmaymiz.
        projectedLastLessonDate: null,
      });
    });

    it('projects when the prepaid lessons ahead will run out', async () => {
      const ts = (v: string) => new Date(`${v}T00:00:00Z`);
      // #10601: 440 000 so'm 10 darslik paketni to'ladi, 3 tasi o'tilgan.
      // Karta "10 ta darsga yetdi · 12.08 — 19.08" deb yozardi — son 10 ta
      // darsni, sana esa 3 tasini tasvirlardi. Endi qolgan 7 tasi guruh
      // jadvaliga (du/chor/juma) proyeksiya qilinadi.
      const pageRows = [
        {
          id: 'p1',
          type: 'PAYMENT',
          amount: 333330,
          balanceBefore: 0,
          balanceAfter: 333330,
          enrollmentId: null,
          metadata: null,
        },
      ];
      const timeline = [
        { ...pageRows[0] },
        {
          id: 'd1',
          type: 'LESSON_DEDUCTION',
          amount: -333330,
          balanceBefore: 333330,
          balanceAfter: 0,
          enrollmentId: 'enr-1',
          metadata: { lessonsCovered: 10, perLessonCost: 33333 },
        },
      ];
      const enrollmentTxs = [
        {
          id: 'd1',
          type: 'LESSON_DEDUCTION',
          amount: -333330,
          enrollmentId: 'enr-1',
          attendanceId: null,
          metadata: { lessonsCovered: 10, perLessonCost: 33333 },
          createdAt: ts('2026-08-12'),
        },
        ...['a1', 'a2', 'a3'].map((attendanceId, i) => ({
          id: `c${i + 1}`,
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          enrollmentId: 'enr-1',
          attendanceId,
          metadata: null,
          createdAt: ts(['2026-08-12', '2026-08-17', '2026-08-19'][i]),
        })),
      ];

      prisma.transaction.findMany.mockImplementation((args: any) => {
        const where = args?.where ?? {};
        if (where.enrollmentId) return Promise.resolve(enrollmentTxs);
        if (where.amount) return Promise.resolve(timeline);
        return Promise.resolve(pageRows);
      });
      prisma.transaction.count.mockResolvedValueOnce(1);
      prisma.attendance.findMany.mockResolvedValueOnce([
        { id: 'a1', date: ts('2026-08-12') },
        { id: 'a2', date: ts('2026-08-17') },
        { id: 'a3', date: ts('2026-08-19') },
      ]);
      prisma.enrollment.findFirst.mockResolvedValue({
        group: {
          id: 'g1',
          branchId: 1,
          exactDays: ['monday', 'wednesday', 'friday'],
          endDate: null,
          scheduleSnapshots: [],
        },
      });
      // Proyeksiya o'quvchining OXIRGI darsidan boshlanadi.
      prisma.attendance.findFirst.mockResolvedValue({ date: ts('2026-08-19') });

      const res = await service.findByStudent(
        10601,
        {} as TransactionQueryDto,
        1001,
        null,
      );

      const dest = res.data[0].destination!;
      expect(dest.lessonCount).toBe(10);
      expect(dest.heldLessonCount).toBe(3);
      expect(dest.pendingLessonCount).toBe(7);
      expect(dest.lastLessonDate).toEqual(ts('2026-08-19'));
      // 21, 24, 26, 28, 31 avgust + 2, 4 sentyabr = 7 ta dars.
      expect(dest.projectedLastLessonDate).toEqual(ts('2026-09-04'));
    });

    it('refuses to project when a holiday pushes past what we can see', async () => {
      const ts = (v: string) => new Date(`${v}T00:00:00Z`);
      // Bayram sanani suradi — proyeksiya uni hisobga olishi SHART, aks holda
      // karta darslar tugagan kunni erta ko'rsatadi.
      const pageRows = [
        {
          id: 'p1',
          type: 'PAYMENT',
          amount: 66666,
          balanceBefore: 0,
          balanceAfter: 66666,
          enrollmentId: null,
          metadata: null,
        },
      ];
      const timeline = [
        { ...pageRows[0] },
        {
          id: 'd1',
          type: 'LESSON_DEDUCTION',
          amount: -66666,
          balanceBefore: 66666,
          balanceAfter: 0,
          enrollmentId: 'enr-1',
          metadata: { lessonsCovered: 2, perLessonCost: 33333 },
        },
      ];
      prisma.transaction.findMany.mockImplementation((args: any) => {
        const where = args?.where ?? {};
        if (where.enrollmentId)
          return Promise.resolve([
            {
              id: 'd1',
              type: 'LESSON_DEDUCTION',
              amount: -66666,
              enrollmentId: 'enr-1',
              attendanceId: null,
              metadata: { lessonsCovered: 2, perLessonCost: 33333 },
              createdAt: ts('2026-08-19'),
            },
          ]);
        if (where.amount) return Promise.resolve(timeline);
        return Promise.resolve(pageRows);
      });
      prisma.transaction.count.mockResolvedValueOnce(1);
      prisma.enrollment.findFirst.mockResolvedValue({
        group: {
          id: 'g1',
          branchId: 1,
          exactDays: ['monday', 'wednesday', 'friday'],
          endDate: null,
          scheduleSnapshots: [],
        },
      });
      prisma.attendance.findFirst.mockResolvedValue({ date: ts('2026-08-19') });
      // 21.08 — bir kunlik bayram.
      prisma.holiday.findMany.mockResolvedValue([
        { date: ts('2026-08-21'), endDate: ts('2026-08-21') },
      ]);

      const res = await service.findByStudent(
        10601,
        {} as TransactionQueryDto,
        1001,
        null,
      );

      // 21.08 bayram → 24.08 va 26.08 ga suriladi.
      expect(res.data[0].destination!.projectedLastLessonDate).toEqual(
        ts('2026-08-26'),
      );
    });

    it('walks the whole ledger, not just PAYMENT + LESSON_DEDUCTION', async () => {
      // The old walk filtered the timeline down to two types and dropped
      // `reversedAt` rows asymmetrically. Both are what made the card lie.
      prisma.transaction.findMany.mockResolvedValue([
        {
          id: 'p1',
          type: 'PAYMENT',
          amount: 100000,
          balanceBefore: 0,
          balanceAfter: 100000,
          enrollmentId: null,
          metadata: null,
        },
      ]);
      await service.findByStudent(10329, {} as TransactionQueryDto, 1001, null);

      const timelineCall = prisma.transaction.findMany.mock.calls.find(
        (c) => c[0]?.where?.amount,
      );
      expect(timelineCall).toBeDefined();
      expect(timelineCall![0].where).toEqual({
        studentId: 10329,
        companyId: 1001,
        amount: { not: 0 },
      });
      expect(timelineCall![0].orderBy).toEqual([
        { createdAt: 'asc' },
        { id: 'asc' },
      ]);
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
        null,
      );

      // The fully-mocked row carries no balances, so the chain cannot be
      // verified and no allocation is emitted — fail-closed by design.
      expect(res.data).toEqual([
        {
          id: 't1',
          type: 'PAYMENT',
          enrollmentId: null,
          coverage: null,
          destination: null,
        },
      ]);
      expect(res.total).toBe(1);
      expect(res.page).toBe(2);
      expect(res.pageSize).toBe(5);
    });
  });

  describe('getBalanceSummary', () => {
    const ts = (s: string) => new Date(`${s}T00:00:00Z`);

    it('captures debtSinceDate and counts unpaid lessons when student is in debt', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 10260,
        balance: -253000,
      });
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
        debtSinceDate: ts('2026-05-20'),
        // The deduction at 2026-05-20 took the balance below zero; the
        // consumption at that same instant and the one on 05-21 both fall
        // inside the spell.
        unpaidLessonsCount: 2,
      });
    });

    it('restarts the debt spell when a payment clears the balance', async () => {
      // The old walk latched on the FIRST dip and never let go, so a student
      // who paid off their debt and later fell one lesson short still read
      // "25 ta dars to'lovsiz". Only the CURRENT spell counts.
      prisma.student.findFirst.mockResolvedValue({
        id: 10460,
        balance: -33325,
      });
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          balanceAfter: -33333,
          createdAt: ts('2026-06-06'),
        },
        {
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          balanceAfter: -66666,
          createdAt: ts('2026-06-09'),
        },
        {
          type: 'PAYMENT',
          amount: 400000,
          balanceAfter: 333334,
          createdAt: ts('2026-06-25'),
        },
        {
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          balanceAfter: 300001,
          createdAt: ts('2026-06-27'),
        },
        {
          type: 'LESSON_CONSUMPTION',
          amount: 0,
          balanceAfter: -33325,
          createdAt: ts('2026-08-04'),
        },
      ]);
      prisma.enrollment.findFirst.mockResolvedValue(null);

      const res = await service.getBalanceSummary(10460, 1001);

      expect(res.debtSinceDate).toEqual(ts('2026-08-04'));
      expect(res.unpaidLessonsCount).toBe(1);
    });

    it('returns null debtSinceDate when the balance has never been negative', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 10001,
        balance: 155000,
      });
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

      expect(res.debtSinceDate).toBeNull();
      expect(res.unpaidLessonsCount).toBe(0);
      expect(res.lessonsAttended).toBe(1);
      expect(res.totalPaid).toBe(500000);
      expect(res.perLessonCost).toBe(34500);
    });

    it('excludes BOTH halves of a reversal pair from the summary', async () => {
      // A reversal is a counter-row of the same type carrying
      // `reversedAt: null`. Filtering on that field alone kept the undo and
      // dropped the original, so the card counted the reversal as a fresh
      // lesson and — via the old `Math.abs` — as fresh lesson cost.
      prisma.student.findFirst.mockResolvedValue({ id: 10519, balance: 0 });
      prisma.enrollment.findFirst.mockResolvedValue(null);

      await service.getBalanceSummary(10519, 1001);

      const where = prisma.transaction.findMany.mock.calls[0][0].where;
      expect(where.reversedAt).toBeNull();
      expect(where.reversedTransactionId).toBeNull();
    });

    it('never adds a positive LESSON_DEDUCTION to the lesson cost', async () => {
      // Money going BACK to the student is not more lesson cost.
      prisma.student.findFirst.mockResolvedValue({ id: 10284, balance: 0 });
      prisma.enrollment.findFirst.mockResolvedValue(null);
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          type: 'LESSON_DEDUCTION',
          amount: -100000,
          balanceAfter: -100000,
          createdAt: ts('2026-05-01'),
        },
        {
          type: 'LESSON_DEDUCTION',
          amount: 40000,
          balanceAfter: -60000,
          createdAt: ts('2026-05-02'),
        },
      ]);

      const res = await service.getBalanceSummary(10284, 1001);

      expect(res.totalLessonCost).toBe(100000);
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
        // Per-dars sanalari — pulni paket darajasida emas, dars darajasida
        // taqsimlash uchun `ledger-replay` shularni oladi.
        consumedDates: [
          date('2026-05-05'),
          date('2026-05-07'),
          date('2026-05-08'),
        ],
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
