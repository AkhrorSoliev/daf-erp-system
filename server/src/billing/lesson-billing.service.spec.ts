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
    };
    salaryAccrualService = {
      createAccrual: jest.fn().mockResolvedValue(null),
      reverseAccrualForAttendance: jest.fn().mockResolvedValue(null),
    };

    // tx is the same object as prisma — so $queryRaw and findUnique etc.
    // share the same jest.fn instances across the inner and outer scope.
    tx = {
      $queryRaw: jest.fn(),
      transaction: { findFirst: jest.fn().mockResolvedValue(null) },
      enrollment: { update: jest.fn().mockResolvedValue({}) },
      group: { findUnique: jest.fn().mockResolvedValue(baseGroup) },
      student: { findUnique: jest.fn() },
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
  // Insufficient balance — no billing, no accrual (B.1)
  // ============================================================

  describe('insufficient balance — no consumption, no accrual', () => {
    beforeEach(() => {
      tx.$queryRaw.mockResolvedValue([{ id: 'enroll-1', prepaidLessonsRemaining: 0 }]);
      tx.student.findUnique.mockResolvedValue({ balance: 1_000 });
    });

    it('does not deduct, does not write consumption, does not accrue', async () => {
      await service.processAttendanceBilling(tx, {
        ...baseParams,
        oldStatus: null,
        newStatus: AttendanceStatus.PRESENT,
      });
      expect(transactionsService.deductLessonFee).not.toHaveBeenCalled();
      expect(transactionsService.recordLessonConsumption).not.toHaveBeenCalled();
      expect(salaryAccrualService.createAccrual).not.toHaveBeenCalled();
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
  });
});
