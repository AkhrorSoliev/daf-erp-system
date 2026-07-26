import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceStatus, LessonDeductionMode } from '@prisma/client';
import { LessonBillingService } from './lesson-billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryAccrualService } from '../salary/salary-accrual.service';

/**
 * Tests cover the 6-row status transition matrix and the 3 financial
 * branches (full cycle / partial / insufficient balance) plus reverse +
 * idempotency. Each scenario corresponds to one of Misol 1-9 from the
 * planning doc.
 */
describe('LessonBillingService', () => {
  let service: LessonBillingService;
  let prisma: any;
  let transactionsService: any;
  let salaryAccrualService: any;
  let tx: any;

  const baseGroup = {
    course: { price: 400_000, lessonPaymentCount: 12 },
    teachers: [{ teacherId: 20001 }],
    contracts: [{ id: 'contract-1' }],
  };

  // perLessonCost = round(400_000 / 12) = 33_333

  beforeEach(async () => {
    transactionsService = {
      deductLessonFee: jest.fn().mockResolvedValue({ id: 'ded-1' }),
      recordLessonConsumption: jest.fn().mockResolvedValue({ id: 'cons-1' }),
      reverseLessonConsumption: jest.fn().mockResolvedValue({ id: 'rev-1' }),
      reverseTransaction: jest.fn().mockResolvedValue({ id: 'rev-ded-1' }),
    };
    salaryAccrualService = {
      createAccrual: jest.fn().mockResolvedValue(null),
      reverseAccrualForAttendance: jest.fn().mockResolvedValue(null),
    };

    // tx is the same object as prisma — so $queryRaw and findUnique etc.
    // share the same jest.fn instances across the inner and outer scope.
    tx = {
      $queryRaw: jest.fn(),
      transaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        // `settleDeferredAccruals` walks deferred SINGLE_UNCOVERED rows;
        // default to none so unrelated tests don't trip on its query.
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      enrollment: { update: jest.fn().mockResolvedValue({}) },
      group: { findUnique: jest.fn().mockResolvedValue(baseGroup) },
      student: { findUnique: jest.fn() },
      // `settleDeferredAccruals` resolves the deduction's linked Attendance
      // to look up groupId + date for the teacher resolver. Default null
      // because most tests don't trigger that branch.
      attendance: { findUnique: jest.fn().mockResolvedValue(null) },
      groupTeacher: { findMany: jest.fn().mockResolvedValue(baseGroup.teachers) },
      // Default: no per-lesson substitute override → resolver falls back
      // to GroupTeacher list above. Tests that exercise the override
      // branch explicitly mockResolvedValue([{ teacherIds: [...] }])
      // for this call.
      lessonTeacherOverride: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    prisma = tx;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonBillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: SalaryAccrualService, useValue: salaryAccrualService },
      ],
    }).compile();

    service = module.get<LessonBillingService>(LessonBillingService);
  });

  const baseParams = {
    attendanceId: 'att-1',
    enrollmentId: 'enroll-1',
    studentId: 10001,
    groupId: 'group-1',
    branchId: 1,
    lessonDate: new Date('2026-04-15T00:00:00Z'),
    companyId: 1,
    performedById: 99,
  };

  // ============================================================
  // Status transition matrix (P0.3)
  // ============================================================

  describe('transition matrix — no-op cases', () => {
    it('null → EXCUSED does nothing', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.EXCUSED,
      });
      expect(transactionsService.deductLessonFee).not.toHaveBeenCalled();
      expect(transactionsService.recordLessonConsumption).not.toHaveBeenCalled();
    });

    it('EXCUSED → EXCUSED does nothing', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: AttendanceStatus.EXCUSED,
        newStatus: AttendanceStatus.EXCUSED,
      });
      expect(transactionsService.deductLessonFee).not.toHaveBeenCalled();
    });

    it('PRESENT → LATE does nothing (both billable, billing already happened)', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: AttendanceStatus.PRESENT,
        newStatus: AttendanceStatus.LATE,
      });
      expect(transactionsService.deductLessonFee).not.toHaveBeenCalled();
      expect(transactionsService.reverseLessonConsumption).not.toHaveBeenCalled();
    });

    it('LATE → ABSENT does nothing (both billable now)', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: AttendanceStatus.LATE,
        newStatus: AttendanceStatus.ABSENT,
      });
      expect(transactionsService.deductLessonFee).not.toHaveBeenCalled();
      expect(transactionsService.reverseLessonConsumption).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Misol 1 — full cycle (Aziz pays 400k)
  // ============================================================

  describe('Misol 1 — full cycle billing on first PRESENT', () => {
    beforeEach(() => {
      tx.$queryRaw.mockResolvedValue([{ id: 'enroll-1', prepaidLessonsRemaining: 0 }]);
      tx.student.findUnique.mockResolvedValue({ balance: 400_000 });
    });

    it('deducts full course price when balance covers it', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(transactionsService.deductLessonFee).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 400_000,
          mode: LessonDeductionMode.FULL_CYCLE,
          lessonsCovered: 12,
        }),
        tx,
      );
    });

    it('sets prepaid to lessonPaymentCount - 1 (this lesson burns one)', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'enroll-1' },
        data: { prepaidLessonsRemaining: 11 },
      });
    });

    it('writes the LESSON_CONSUMPTION audit row', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(transactionsService.recordLessonConsumption).toHaveBeenCalledWith(
        expect.objectContaining({
          attendanceId: 'att-1',
          enrollmentId: 'enroll-1',
          perLessonCost: 33_333,
        }),
        tx,
      );
    });

    it('writes salary accrual linked to the deduction', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(salaryAccrualService.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: 20001,
          studentId: 10001,
          deductionTransactionId: 'ded-1',
        }),
      );
    });
  });

  // ============================================================
  // Misol 2 — partial billing (Aziz pays 200k)
  // ============================================================

  describe('Misol 2 — partial billing when balance < full cycle', () => {
    beforeEach(() => {
      tx.$queryRaw.mockResolvedValue([{ id: 'enroll-1', prepaidLessonsRemaining: 0 }]);
      tx.student.findUnique.mockResolvedValue({ balance: 200_000 });
    });

    it('deducts floor(balance / perLessonCost) × perLessonCost', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      // floor(200_000 / 33_333) = 6, deducts 6 × 33_333 = 199_998
      expect(transactionsService.deductLessonFee).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 199_998,
          mode: LessonDeductionMode.PARTIAL,
          lessonsCovered: 6,
        }),
        tx,
      );
    });

    it('sets prepaid to lessonsCovered - 1 (this lesson burns one)', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'enroll-1' },
        data: { prepaidLessonsRemaining: 5 },
      });
    });
  });

  // ============================================================
  // Insufficient balance — SINGLE_UNCOVERED deduction, deferred accrual (B.1)
  //
  // The previous "no-op when broke" branch is gone: every attended lesson
  // now writes a real deduction (balance is allowed to go negative) so the
  // UI can show the actual accumulating debt instead of a static
  // one-lesson ceiling. Teacher salary is held in metadata until a
  // payment lands and clears the uncovered amount.
  // ============================================================

  describe('insufficient balance — SINGLE_UNCOVERED, deferred accrual', () => {
    beforeEach(() => {
      tx.$queryRaw.mockResolvedValue([{ id: 'enroll-1', prepaidLessonsRemaining: 0 }]);
      tx.student.findUnique.mockResolvedValue({ balance: 1_000 });
    });

    it('deducts the per-lesson cost with mode=SINGLE_UNCOVERED and salaryDeferred=true', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(transactionsService.deductLessonFee).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 33_333,
          mode: LessonDeductionMode.SINGLE_UNCOVERED,
          lessonsCovered: 1,
          salaryDeferred: true,
          uncoveredAmount: 33_333,
        }),
        tx,
      );
    });

    it('writes the LESSON_CONSUMPTION audit row (idempotency anchor)', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(transactionsService.recordLessonConsumption).toHaveBeenCalledWith(
        expect.objectContaining({
          attendanceId: 'att-1',
          enrollmentId: 'enroll-1',
        }),
        tx,
      );
    });

    it('does NOT write a salary accrual (deferred until payment lands)', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(salaryAccrualService.createAccrual).not.toHaveBeenCalled();
    });

    it('does NOT change the prepaid counter (no batch was refilled)', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(tx.enrollment.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Prepaid available — just decrement, no balance touch
  // ============================================================

  describe('prepaid available — burn one unit', () => {
    beforeEach(() => {
      tx.$queryRaw.mockResolvedValue([{ id: 'enroll-1', prepaidLessonsRemaining: 5 }]);
      tx.transaction.findFirst.mockImplementation(({ where }: any) => {
        // Idempotency check returns null; coverage tx lookup returns the deduction
        if (where.type === 'LESSON_CONSUMPTION') return null;
        if (where.type === 'LESSON_DEDUCTION') return { id: 'previous-batch' };
        return null;
      });
    });

    it('decrements prepaid without calling deductLessonFee', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(transactionsService.deductLessonFee).not.toHaveBeenCalled();
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'enroll-1' },
        data: { prepaidLessonsRemaining: { decrement: 1 } },
      });
    });

    it('uses previous LESSON_DEDUCTION as the coverage tx for accrual', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(salaryAccrualService.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({ deductionTransactionId: 'previous-batch' }),
      );
    });
  });

  // ============================================================
  // Misol 8 — idempotency (re-save attendance)
  // ============================================================

  describe('Misol 8 — idempotency', () => {
    it('skips billing when LESSON_CONSUMPTION already exists', async () => {
      tx.transaction.findFirst.mockResolvedValueOnce({ id: 'existing-cons' });
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(transactionsService.deductLessonFee).not.toHaveBeenCalled();
      expect(transactionsService.recordLessonConsumption).not.toHaveBeenCalled();
      expect(tx.enrollment.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Misol 9 — reverse (billable → EXCUSED)
  // Under the "lesson held = lesson paid" rule, only EXCUSED is non-billable.
  // PRESENT/LATE/ABSENT → EXCUSED triggers the reverse path.
  // ============================================================

  describe('Misol 9 — reverse on PRESENT/LATE/ABSENT → EXCUSED', () => {
    it('reverses consumption + restores prepaid +1 + reverses accrual', async () => {
      tx.transaction.findFirst.mockResolvedValueOnce({ id: 'cons-existing' });
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: AttendanceStatus.PRESENT,
        newStatus: AttendanceStatus.EXCUSED,
      });
      expect(transactionsService.reverseLessonConsumption).toHaveBeenCalledWith(
        'cons-existing',
        expect.objectContaining({ performedById: 99 }),
        tx,
      );
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'enroll-1' },
        data: { prepaidLessonsRemaining: { increment: 1 } },
      });
      expect(salaryAccrualService.reverseAccrualForAttendance).toHaveBeenCalled();
    });

    // Misol 7: pul yetmagan, consumption yo'q → prepaid +1 QILMAYDI.
    it('Misol 7 — no consumption found: does NOT increment prepaid (no free lesson)', async () => {
      tx.transaction.findFirst.mockResolvedValueOnce(null);
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: AttendanceStatus.PRESENT,
        newStatus: AttendanceStatus.EXCUSED,
      });
      expect(transactionsService.reverseLessonConsumption).not.toHaveBeenCalled();
      expect(tx.enrollment.update).not.toHaveBeenCalled();
      // Accrual reverse still attempted (returns null inside the service if missing)
      expect(salaryAccrualService.reverseAccrualForAttendance).toHaveBeenCalled();
    });

    // F-03 regression: a debtor's SINGLE_UNCOVERED lesson (Path D) writes a real
    // balance-decreasing LESSON_DEDUCTION *and* a consumption row. Reversing it
    // must undo the deduction (restore balance) and must NOT hand back a prepaid
    // unit the student never paid for. The old code saw only the consumption row
    // and always did `prepaid += 1`, leaving a phantom debt + a free lesson.
    it('debtor SINGLE_UNCOVERED reverse: reverses the deduction, NO prepaid increment', async () => {
      tx.transaction.findFirst
        .mockResolvedValueOnce({ id: 'cons-existing' }) // consumption lookup
        .mockResolvedValueOnce({
          id: 'ded-uncovered',
          metadata: { mode: LessonDeductionMode.SINGLE_UNCOVERED },
        }); // uncovered deduction lookup
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: AttendanceStatus.PRESENT,
        newStatus: AttendanceStatus.EXCUSED,
      });
      expect(transactionsService.reverseLessonConsumption).toHaveBeenCalledWith(
        'cons-existing',
        expect.objectContaining({ performedById: 99 }),
        tx,
      );
      // The debt-creating deduction is reversed → balance restored.
      expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
        'ded-uncovered',
        expect.objectContaining({ performedById: 99 }),
        tx,
      );
      // No free prepaid lesson.
      expect(tx.enrollment.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Retroactive billing (catch-up after a payment lands)
  // ============================================================

  describe('processRetroactiveBillingForStudent', () => {
    // The mock for $queryRaw is shared across calls in beforeEach. Each test
    // wires it explicitly to control how many unpaid attendances are found
    // for each enrollment.
    const studentId = 10001;
    const companyId = 1;
    const enrollmentId = 'enroll-1';
    const groupId = 'group-1';

    function setupOneEnrollmentWith(
      unpaidDates: string[],
      enrollmentRows: Array<{
        id: string;
        groupId: string;
        group: { branchId: number };
      }> = [{ id: enrollmentId, groupId, group: { branchId: 1 } }],
    ) {
      // First call returns enrollments via findMany (NOT $queryRaw — keep
      // it explicit). Mock the active-enrollment lookup.
      tx.enrollment.findMany = jest.fn().mockResolvedValue(enrollmentRows);
      // The unpaid-attendance query inside the service uses $queryRaw —
      // model the rows it returns. Per-enrollment, we shift one batch off.
      const queues: Array<Array<{ id: string; date: Date }>> = [
        unpaidDates.map((d, i) => ({ id: `att-${i + 1}`, date: new Date(d) })),
      ];
      tx.$queryRaw = jest.fn().mockImplementation(() => {
        const next = queues.shift();
        return Promise.resolve(next ?? []);
      });
    }

    it('returns { billedAttendances: 0 } when student has no enrollments', async () => {
      tx.enrollment.findMany = jest.fn().mockResolvedValue([]);
      const result = await service.processRetroactiveBillingForStudent(tx, {
        studentId,
        companyId,
      });
      expect(result.billedAttendances).toBe(0);
      expect(transactionsService.deductLessonFee).not.toHaveBeenCalled();
    });

    it('returns 0 when student has enrollments but no unpaid attendance', async () => {
      setupOneEnrollmentWith([]);
      const result = await service.processRetroactiveBillingForStudent(tx, {
        studentId,
        companyId,
      });
      expect(result.billedAttendances).toBe(0);
      expect(transactionsService.deductLessonFee).not.toHaveBeenCalled();
    });

    /**
     * Shared harness — wires up tx mocks so the live bill() flow can run
     * against an in-memory state machine. Tracks balance, prepaid, and which
     * attendances have a recorded consumption.
     */
    function wireLiveBillingMocks(initialBalance: number) {
      let balance = initialBalance;
      let prepaid = 0;
      const consumedAttIds = new Set<string>();
      let lastDeductionId: string | null = null;
      let deductionCounter = 0;

      tx.student.findUnique = jest
        .fn()
        .mockImplementation(() => Promise.resolve({ balance }));
      tx.enrollment.findUnique = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ prepaidLessonsRemaining: prepaid }),
        );

      // Inside bill() the SELECT FOR UPDATE on Enrollment is a $queryRaw —
      // intercept by checking the SQL for "FOR UPDATE". Fall through to
      // the unpaid-attendance query for everything else.
      const innerQueryRaw = tx.$queryRaw;
      tx.$queryRaw = jest.fn().mockImplementation((strings: any) => {
        const sql = Array.isArray(strings)
          ? strings.join(' ')
          : String(strings);
        if (sql.includes('FOR UPDATE')) {
          return Promise.resolve([
            {
              id: enrollmentId,
              prepaidLessonsRemaining: prepaid,
              startDate: null,
            },
          ]);
        }
        return innerQueryRaw(strings);
      });

      // findFirst inside bill() does TWO things:
      //   1. idempotency check (LESSON_CONSUMPTION on attendanceId)
      //   2. recent-batch lookup (LESSON_DEDUCTION on enrollmentId, when
      //      prepaid > 0 path runs)
      tx.transaction.findFirst = jest.fn().mockImplementation(({ where }: any) => {
        if (where?.type === 'LESSON_CONSUMPTION') {
          return Promise.resolve(
            consumedAttIds.has(where.attendanceId) ? { id: 'cons-x' } : null,
          );
        }
        if (where?.type === 'LESSON_DEDUCTION') {
          return Promise.resolve(lastDeductionId ? { id: lastDeductionId } : null);
        }
        return Promise.resolve(null);
      });

      transactionsService.deductLessonFee = jest.fn().mockImplementation((args: any) => {
        balance -= args.amount;
        deductionCounter += 1;
        lastDeductionId = `ded-${deductionCounter}`;
        return Promise.resolve({ id: lastDeductionId });
      });
      transactionsService.recordLessonConsumption = jest
        .fn()
        .mockImplementation((args: any) => {
          consumedAttIds.add(args.attendanceId);
          return Promise.resolve({ id: `cons-${consumedAttIds.size}` });
        });

      tx.enrollment.update = jest.fn().mockImplementation(({ data }: any) => {
        if (typeof data.prepaidLessonsRemaining === 'number') {
          prepaid = data.prepaidLessonsRemaining;
        } else if (data.prepaidLessonsRemaining?.decrement) {
          prepaid -= data.prepaidLessonsRemaining.decrement;
        }
        return Promise.resolve({});
      });

      return {
        getBalance: () => balance,
        getPrepaid: () => prepaid,
        getConsumed: () => consumedAttIds,
      };
    }

    it('settles 9 unpaid lessons after a full-cycle payment', async () => {
      setupOneEnrollmentWith([
        '2026-03-02',
        '2026-03-04',
        '2026-03-06',
        '2026-03-09',
        '2026-03-11',
        '2026-03-13',
        '2026-03-16',
        '2026-03-18',
        '2026-03-20',
      ]);

      const state = wireLiveBillingMocks(400_000);

      const result = await service.processRetroactiveBillingForStudent(tx, {
        studentId,
        companyId,
      });

      expect(result.billedAttendances).toBe(9);
      expect(transactionsService.deductLessonFee).toHaveBeenCalledTimes(1);
      expect(transactionsService.deductLessonFee).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: LessonDeductionMode.FULL_CYCLE,
          amount: 400_000,
          lessonsCovered: 12,
        }),
        expect.anything(),
      );
      expect(transactionsService.recordLessonConsumption).toHaveBeenCalledTimes(
        9,
      );
      expect(salaryAccrualService.createAccrual).toHaveBeenCalledTimes(9);
      // 12 prepaid units after refill, 9 consumed (1 inside bill() refill +
      // 8 standalone decrements) → 3 remaining.
      expect(state.getPrepaid()).toBe(3);
      expect(state.getBalance()).toBe(0);
    });

    it('bills every unpaid lesson — covered ones partial, the rest SINGLE_UNCOVERED into negative', async () => {
      // 4 unpaid lessons; balance covers exactly 1 (perLessonCost = 33_333).
      // The previous behaviour stopped at the first uncovered lesson; now
      // every attended lesson is billed so the ledger shows the real debt.
      setupOneEnrollmentWith([
        '2026-03-02',
        '2026-03-04',
        '2026-03-06',
        '2026-03-09',
      ]);
      const state = wireLiveBillingMocks(33_333);

      const result = await service.processRetroactiveBillingForStudent(tx, {
        studentId,
        companyId,
      });

      expect(result.billedAttendances).toBe(4);
      expect(transactionsService.deductLessonFee).toHaveBeenCalledTimes(4);
      // First lesson: balance exactly covers it (PARTIAL, lessonsCovered=1).
      expect(transactionsService.deductLessonFee).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          mode: LessonDeductionMode.PARTIAL,
          amount: 33_333,
          lessonsCovered: 1,
        }),
        expect.anything(),
      );
      // Remaining three drop into SINGLE_UNCOVERED — balance goes negative.
      for (const n of [2, 3, 4]) {
        expect(transactionsService.deductLessonFee).toHaveBeenNthCalledWith(
          n,
          expect.objectContaining({
            mode: LessonDeductionMode.SINGLE_UNCOVERED,
            amount: 33_333,
            salaryDeferred: true,
          }),
          expect.anything(),
        );
      }
      expect(transactionsService.recordLessonConsumption).toHaveBeenCalledTimes(
        4,
      );
      // 33_333 (initial) − 33_333 (PARTIAL) − 3 × 33_333 (SINGLE_UNCOVERED) = −99_999.
      expect(state.getBalance()).toBe(-99_999);
    });

    it('settles deferred salary accruals when balance is non-negative after payment', async () => {
      // No legacy unpaid attendances. Two SINGLE_UNCOVERED deductions
      // already exist (total uncovered = 60k). A payment brings the
      // balance back to 0 — both rows should accrue and clear.
      tx.enrollment.findMany = jest
        .fn()
        .mockResolvedValue([{ id: enrollmentId, groupId, group: { branchId: 1 } }]);
      tx.$queryRaw = jest.fn().mockResolvedValue([]);

      const deferredRows = [
        {
          id: 'ded-1',
          attendanceId: 'att-1',
          enrollmentId,
          branchId: 1,
          metadata: { uncoveredAmount: 30_000, perLessonCost: 30_000 },
        },
        {
          id: 'ded-2',
          attendanceId: 'att-2',
          enrollmentId,
          branchId: 1,
          metadata: { uncoveredAmount: 30_000, perLessonCost: 30_000 },
        },
      ];
      tx.transaction.findMany = jest.fn().mockResolvedValue(deferredRows);
      tx.transaction.update = jest.fn().mockResolvedValue({});
      tx.attendance.findUnique = jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({
          date: new Date(where.id === 'att-1' ? '2026-04-01' : '2026-04-03'),
          groupId,
        }),
      );
      tx.student.findUnique = jest
        .fn()
        .mockResolvedValue({ balance: 0 });

      await service.processRetroactiveBillingForStudent(tx, {
        studentId,
        companyId,
      });

      expect(salaryAccrualService.createAccrual).toHaveBeenCalledTimes(2);
      expect(salaryAccrualService.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({
          deductionTransactionId: 'ded-1',
          attendanceId: 'att-1',
        }),
      );
      expect(salaryAccrualService.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({
          deductionTransactionId: 'ded-2',
          attendanceId: 'att-2',
        }),
      );
      // Both rows flagged settled.
      expect(tx.transaction.update).toHaveBeenCalledTimes(2);
    });

    it('bubbles up carried-over accruals from deferred settlement (sink wiring)', async () => {
      tx.enrollment.findMany = jest
        .fn()
        .mockResolvedValue([{ id: enrollmentId, groupId, group: { branchId: 1 } }]);
      tx.$queryRaw = jest.fn().mockResolvedValue([]);
      tx.transaction.findMany = jest.fn().mockResolvedValue([
        {
          id: 'ded-1',
          attendanceId: 'att-1',
          enrollmentId,
          branchId: 1,
          metadata: { uncoveredAmount: 30_000, perLessonCost: 30_000 },
        },
      ]);
      tx.transaction.update = jest.fn().mockResolvedValue({});
      tx.attendance.findUnique = jest
        .fn()
        .mockResolvedValue({ date: new Date('2026-04-01'), groupId });
      tx.student.findUnique = jest.fn().mockResolvedValue({ balance: 0 });

      // Simulate createAccrual hitting the closed-period redirect: it pushes
      // a carry-over event into whatever sink it was handed.
      salaryAccrualService.createAccrual.mockImplementation((p: any) => {
        p.carriedOverSink?.push({
          teacherId: 20001,
          studentId,
          groupId,
          amount: 9_000,
          lessonDate: p.lessonDate,
          creditPeriodDate: new Date('2026-06-08'),
          companyId,
        });
        return Promise.resolve({});
      });

      const result = await service.processRetroactiveBillingForStudent(tx, {
        studentId,
        companyId,
      });

      // The sink is threaded down to createAccrual...
      expect(salaryAccrualService.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({ carriedOverSink: expect.any(Array) }),
      );
      // ...and bubbles all the way back up to the return value.
      expect(result.carriedOver).toHaveLength(1);
      expect(result.carriedOver[0]).toMatchObject({
        teacherId: 20001,
        amount: 9_000,
      });
    });

    it('partially settles deferred accruals (oldest first) when balance is still negative', async () => {
      // Old row 30k + new row 50k = 80k total uncovered.
      // Balance is -30k → 50k of debt has been covered.
      // FIFO: oldest 30k clears fully (accrual fires), newest 50k shrinks
      // by the remaining 20k to 30k (no accrual yet).
      tx.enrollment.findMany = jest
        .fn()
        .mockResolvedValue([{ id: enrollmentId, groupId, group: { branchId: 1 } }]);
      tx.$queryRaw = jest.fn().mockResolvedValue([]);

      const oldRow = {
        id: 'ded-old',
        attendanceId: 'att-old',
        enrollmentId,
        branchId: 1,
        metadata: { uncoveredAmount: 30_000, perLessonCost: 30_000 },
      };
      const newRow = {
        id: 'ded-new',
        attendanceId: 'att-new',
        enrollmentId,
        branchId: 1,
        metadata: { uncoveredAmount: 50_000, perLessonCost: 50_000 },
      };
      tx.transaction.findMany = jest.fn().mockResolvedValue([oldRow, newRow]);
      tx.transaction.update = jest.fn().mockResolvedValue({});
      tx.attendance.findUnique = jest.fn().mockResolvedValue({
        date: new Date('2026-04-01'),
        groupId,
      });
      tx.student.findUnique = jest
        .fn()
        .mockResolvedValue({ balance: -30_000 });

      await service.processRetroactiveBillingForStudent(tx, {
        studentId,
        companyId,
      });

      // Oldest row fully covered → accrual + clear flag.
      expect(salaryAccrualService.createAccrual).toHaveBeenCalledTimes(1);
      expect(salaryAccrualService.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({ deductionTransactionId: 'ded-old' }),
      );
      // Two updates: oldest row cleared, newest row's uncovered shrunk.
      expect(tx.transaction.update).toHaveBeenCalledTimes(2);
      expect(tx.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ded-old' },
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              uncoveredAmount: 0,
              salaryDeferred: false,
            }),
          }),
        }),
      );
      expect(tx.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ded-new' },
          data: expect.objectContaining({
            metadata: expect.objectContaining({ uncoveredAmount: 30_000 }),
          }),
        }),
      );
    });

    it('opens a Serializable tx in runRetroactiveBilling', async () => {
      // Arrange a no-enrollments fast path so the tx body returns 0.
      tx.enrollment.findMany = jest.fn().mockResolvedValue([]);
      prisma.$transaction = jest.fn().mockImplementation((cb) => cb(prisma));

      const result = await service.runRetroactiveBilling({
        studentId,
        companyId,
      });

      expect(result.billedAttendances).toBe(0);
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: 'Serializable' }),
      );
    });
  });
});
