import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LessonTeacherOverridesService } from './lesson-teacher-overrides.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryAccrualService } from '../salary/salary-accrual.service';
import { EntityHistoryService } from '../common/entity-history';
import { MonthlyChargeService } from '../billing/monthly-charge.service';
import { LessonAdmissionService } from '../billing/lesson-admission.service';
import { SettingsService } from '../settings/settings.service';

describe('LessonTeacherOverridesService', () => {
  let service: LessonTeacherOverridesService;
  let prisma: any;
  let tx: any;
  let history: any;
  let salaryAccrual: any;
  let monthlyCharge: any;

  beforeEach(async () => {
    tx = {
      group: { findFirst: jest.fn() },
      lessonCancellation: { findFirst: jest.fn().mockResolvedValue(null) },
      lessonReschedule: { findFirst: jest.fn().mockResolvedValue(null) },
      lessonTeacherOverride: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      enrollment: { findFirst: jest.fn() },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
      // Trial-lesson months (contract 3.5): none by default.
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // `recomputeAccruals` guruh kursining `paymentModel` ini o'qiydi.
    // Standart — LESSON_PACK, ya'ni eski yo'l.
    tx.group.findUnique = jest.fn().mockResolvedValue({
      course: { paymentModel: 'LESSON_PACK' },
    });
    prisma = {
      ...tx,
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 10042 }, { id: 10043 }]),
      },
      $transaction: jest.fn((cb) => cb(tx)),
    };
    salaryAccrual = {
      createAccrual: jest.fn(),
      reverseAccrualForAttendance: jest.fn(),
    };
    monthlyCharge = { findChargeForLesson: jest.fn().mockResolvedValue(null) };
    history = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonTeacherOverridesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SalaryAccrualService, useValue: salaryAccrual },
        { provide: EntityHistoryService, useValue: history },
        { provide: MonthlyChargeService, useValue: monthlyCharge },
        // The real first-lesson rule (ADR-0048 §4); it reads through `tx`.
        LessonAdmissionService,
        { provide: SettingsService, useValue: {} },
      ],
    }).compile();

    service = module.get(LessonTeacherOverridesService);
  });

  describe('upsert — date validation', () => {
    const validDto = { teacherIds: [10042] };
    // 2026-05-13 is a Wednesday
    const wednesday = '2026-05-13';

    it('throws NotFoundException when group is missing', async () => {
      tx.group.findFirst.mockResolvedValue(null);
      await expect(
        service.upsert('group-1', wednesday, validDto, 1, 99),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a date that has an active cancellation', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        exactDays: ['wednesday'],
      });
      tx.lessonCancellation.findFirst.mockResolvedValue({ id: 'cancel-1' });
      await expect(
        service.upsert('group-1', wednesday, validDto, 1, 99),
      ).rejects.toThrow(/bekor qilingan/);
    });

    it('rejects a date that is the originalDate of an active reschedule', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        exactDays: ['wednesday'],
      });
      tx.lessonReschedule.findFirst.mockResolvedValue({
        newDate: new Date('2026-05-20T00:00:00Z'),
      });
      await expect(
        service.upsert('group-1', wednesday, validDto, 1, 99),
      ).rejects.toThrow(/boshqa kunga ko'chirilgan/);
    });

    it('rejects a non-lesson day that is not a reschedule.newDate', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        exactDays: ['monday'], // wednesday not in schedule
      });
      tx.lessonReschedule.findFirst
        .mockResolvedValueOnce(null) // movedAway check
        .mockResolvedValueOnce(null); // movedHere check
      await expect(
        service.upsert('group-1', wednesday, validDto, 1, 99),
      ).rejects.toThrow(/dars kuni emas/);
    });

    it('accepts a date that is in exactDays', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        exactDays: ['wednesday'],
      });
      tx.lessonTeacherOverride.findFirst.mockResolvedValue(null);
      tx.lessonTeacherOverride.create.mockResolvedValue({ id: 'override-1' });
      tx.groupTeacher.findMany.mockResolvedValue([{ teacherId: 10001 }]);

      await service.upsert('group-1', wednesday, validDto, 1, 99);

      expect(tx.lessonTeacherOverride.create).toHaveBeenCalled();
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          entityId: 'group-1',
        }),
      );
    });

    it('accepts a date that is the newDate of an active reschedule (lesson moved here)', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        exactDays: ['monday'], // wednesday not normally a lesson day
      });
      tx.lessonReschedule.findFirst
        .mockResolvedValueOnce(null) // movedAway: nothing
        .mockResolvedValueOnce({ id: 'rs-1' }); // movedHere: lesson lands here
      tx.lessonTeacherOverride.findFirst.mockResolvedValue(null);
      tx.lessonTeacherOverride.create.mockResolvedValue({ id: 'override-1' });
      tx.groupTeacher.findMany.mockResolvedValue([{ teacherId: 10001 }]);

      await service.upsert('group-1', wednesday, validDto, 1, 99);

      expect(tx.lessonTeacherOverride.create).toHaveBeenCalled();
    });
  });

  describe('upsert — entity history', () => {
    const wednesday = '2026-05-13';
    const validDto = { teacherIds: [10042] };

    beforeEach(() => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        exactDays: ['wednesday'],
      });
      tx.groupTeacher.findMany.mockResolvedValue([{ teacherId: 10001 }]);
    });

    it('records UPDATE history when an existing override is being replaced', async () => {
      tx.lessonTeacherOverride.findFirst.mockResolvedValue({
        id: 'existing',
        teacherIds: [10044],
      });
      tx.lessonTeacherOverride.update.mockResolvedValue({ id: 'existing' });

      await service.upsert('group-1', wednesday, validDto, 1, 99);

      expect(history.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          entityId: 'group-1',
        }),
      );
    });

    it('records CREATE history when no prior override exists', async () => {
      tx.lessonTeacherOverride.findFirst.mockResolvedValue(null);
      tx.lessonTeacherOverride.create.mockResolvedValue({ id: 'override-1' });

      await service.upsert('group-1', wednesday, validDto, 1, 99);

      expect(history.recordCreate).toHaveBeenCalled();
    });
  });

  // I2 — o'rinbosar ustoz OYLIK kursda ham haq olishi kerak.
  //
  // Avval bu yerda `if (!cons) continue;` turardi va u pulni
  // `LESSON_CONSUMPTION.metadata.perLessonCost` dan olardi. Oylik yo'l esa
  // bitta ham `LESSON_CONSUMPTION` yozmaydi, ya'ni oylik guruhdagi HAR BIR
  // o'rinbosar tayinlash jimgina NOLGA hisoblanardi.
  describe('recomputeAccruals — MONTHLY kurs', () => {
    const wednesday = '2026-05-13';

    beforeEach(() => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        exactDays: ['wednesday'],
      });
      tx.group.findUnique.mockResolvedValue({
        course: { paymentModel: 'MONTHLY' },
      });
      tx.lessonTeacherOverride.findFirst.mockResolvedValue(null);
      tx.lessonTeacherOverride.create.mockResolvedValue({ id: 'override-1' });
      tx.groupTeacher.findMany.mockResolvedValue([{ teacherId: 10001 }]);
      tx.attendance.findMany.mockResolvedValue([
        { id: 'att-1', studentId: 30001 },
      ]);
      // `resolveBilledEnrollmentId`: attendanceId'ga bog'langan qator yo'q
      // (oylik hisobda `attendanceId` yozilmaydi) -> yozilish ro'yxatidan.
      tx.transaction.findFirst.mockResolvedValue(null);
      tx.enrollment.findMany = jest
        .fn()
        .mockResolvedValue([{ id: 'enr-1', status: 'ACTIVE' }]);
    });

    it('muzlatilgan `EnrollmentMonthlyCharge.perLessonCost` bilan haq yozadi', async () => {
      monthlyCharge.findChargeForLesson.mockResolvedValue({
        perLessonCost: 34_615,
        transactionId: 'mon-tx-1',
      });

      await service.upsert(
        'group-1',
        wednesday,
        { teacherIds: [10042] },
        1,
        99,
      );

      expect(monthlyCharge.findChargeForLesson).toHaveBeenCalledWith(
        tx,
        'enr-1',
        expect.any(Date),
      );
      expect(salaryAccrual.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: 10042,
          studentId: 30001,
          attendanceId: 'att-1',
          perLessonCost: 34_615,
          deductionTransactionId: 'mon-tx-1',
        }),
      );
      // LESSON_CONSUMPTION so'rovi umuman yuborilmaydi — oylik yo'lda
      // bunday qator yo'q.
      expect(tx.transaction.findMany).not.toHaveBeenCalled();
    });

    it('muzlatilgan `plannedLessons` ni `lessonDivisor` sifatida uzatadi', async () => {
      // 13 — ATAYLAB 12 dan farqli son. `createAccrual` bo'luvchi
      // berilmasa kursning `lessonPaymentCount` (12) iga qaytadi, shuning
      // uchun uzatish yo'qolsa bu test yiqiladi.
      monthlyCharge.findChargeForLesson.mockResolvedValue({
        perLessonCost: 30_769,
        plannedLessons: 13,
        transactionId: 'mon-tx-1',
      });

      await service.upsert(
        'group-1',
        wednesday,
        { teacherIds: [10042] },
        1,
        99,
      );

      expect(salaryAccrual.createAccrual).toHaveBeenCalledTimes(1);
      expect(salaryAccrual.createAccrual.mock.calls[0][0].lessonDivisor).toBe(
        13,
      );
    });

    it('oylik hisob topilmasa haq yozmaydi va xatoni jurnalga tushiradi', async () => {
      const errorSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      monthlyCharge.findChargeForLesson.mockResolvedValue(null);

      await service.upsert(
        'group-1',
        wednesday,
        { teacherIds: [10042] },
        1,
        99,
      );

      expect(salaryAccrual.createAccrual).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  // Contract 3.5 (ADR-0048 §3): a student who left on the trial-lesson rule got
  // the whole month back (its dates are in `frozenOutDates`) and the teacher's
  // pay for it was reversed (`reverseTrialAccruals`). `findChargeForLesson`
  // ignores `frozenOutDates`, so a substitute override used to write that pay
  // again for the newly added teacher.
  describe('recomputeAccruals — trial lesson (3.5)', () => {
    // A Wednesday after contract 3.5 took effect (01.10.2026).
    const lessonDay = '2026-10-14';

    beforeEach(() => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        exactDays: ['wednesday'],
      });
      tx.group.findUnique.mockResolvedValue({
        course: { paymentModel: 'MONTHLY' },
      });
      tx.lessonTeacherOverride.findFirst.mockResolvedValue(null);
      tx.lessonTeacherOverride.create.mockResolvedValue({ id: 'override-1' });
      tx.groupTeacher.findMany.mockResolvedValue([{ teacherId: 10001 }]);
      tx.attendance.findMany.mockResolvedValue([
        { id: 'att-1', studentId: 30001 },
      ]);
      tx.transaction.findFirst.mockResolvedValue(null);
      // The student was removed from the group.
      tx.enrollment.findMany = jest
        .fn()
        .mockResolvedValue([{ id: 'enr-1', status: 'DROPPED' }]);
      monthlyCharge.findChargeForLesson.mockResolvedValue({
        perLessonCost: 34_615,
        plannedLessons: 13,
        transactionId: 'mon-tx-1',
        frozenOutDates: ['2026-10-07', '2026-10-14', '2026-10-21'],
      });
      // The departed enrollment's charge that gave this day back.
      tx.enrollmentMonthlyCharge.findMany.mockResolvedValue([
        { enrollmentId: 'enr-1', studentId: 30001 },
      ]);
    });

    it('writes no pay for the substitute on a departed trial student', async () => {
      tx.transaction.findMany.mockResolvedValue([
        {
          metadata: {
            kind: 'monthly-release',
            enrollmentId: 'enr-1',
            period: '2026-10',
            policy: 'STUDENT_CANCELLED',
            trialLesson: true,
          },
        },
      ]);

      await service.upsert(
        'group-1',
        lessonDay,
        { teacherIds: [10042] },
        1,
        99,
      );

      expect(salaryAccrual.createAccrual).not.toHaveBeenCalled();
      // The removed teacher's pay, if any, is still reversed.
      expect(salaryAccrual.reverseAccrualForAttendance).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: 10001, studentId: 30001 }),
      );
      // Departed enrollments only: an ACTIVE student unfrozen on a lesson day
      // attends it free, and the teacher is still paid for it. And only one
      // still in the group that day (00:00 Tashkent): a student taken out and
      // put back the same month pays for the day on the new enrollment, while
      // the old one's charge has it frozen out as an ordinary departure.
      expect(tx.enrollmentMonthlyCharge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            groupId: 'group-1',
            frozenOutDates: { has: lessonDay },
            enrollment: {
              status: { not: 'ACTIVE' },
              statusChangedAt: { gte: new Date('2026-10-13T19:00:00.000Z') },
            },
          }),
        }),
      );
    });

    // A quality claim gives the whole month back too, but the teacher's pay
    // does not decrease (ADR-0044); the centre's top-up would not front a
    // student below its new-student gate, so the substitute keeps live pay.
    it("keeps the substitute's pay on a quality-claim departure", async () => {
      tx.transaction.findMany.mockResolvedValue([
        {
          metadata: {
            kind: 'monthly-release',
            enrollmentId: 'enr-1',
            period: '2026-10',
            policy: 'QUALITY_CLAIM',
          },
        },
      ]);

      await service.upsert(
        'group-1',
        lessonDay,
        { teacherIds: [10042] },
        1,
        99,
      );

      expect(salaryAccrual.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: 10042,
          attendanceId: 'att-1',
          perLessonCost: 34_615,
          deductionTransactionId: 'mon-tx-1',
        }),
      );
    });
  });

  // LESSON_PACK yo'li o'zgarmasligi — qat'iy cheklov. Oylik bo'luvchi
  // faqat oylik shoxda tug'iladi; bu yerda `createAccrual` uni OLMASLIGI
  // kerak, aks holda kursning `lessonPaymentCount` i chetlab o'tilardi.
  describe('recomputeAccruals — LESSON_PACK kurs', () => {
    const wednesday = '2026-05-13';

    beforeEach(() => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        exactDays: ['wednesday'],
      });
      tx.lessonTeacherOverride.findFirst.mockResolvedValue(null);
      tx.lessonTeacherOverride.create.mockResolvedValue({ id: 'override-1' });
      tx.groupTeacher.findMany.mockResolvedValue([{ teacherId: 10001 }]);
      tx.attendance.findMany.mockResolvedValue([
        { id: 'att-1', studentId: 30001 },
      ]);
      tx.transaction.findMany.mockResolvedValue([
        {
          attendanceId: 'att-1',
          metadata: { perLessonCost: 33_333 },
          createdAt: new Date('2026-05-13T04:30:00.000Z'),
        },
      ]);
      // 1-chaqiruv — `resolveBilledEnrollmentId` (darsni hisoblagan
      // yozilish), 2-chaqiruv — `resolveFundingDeductionId` dagi
      // LESSON_DEDUCTION.
      tx.transaction.findFirst
        .mockResolvedValueOnce({ enrollmentId: 'enr-1' })
        .mockResolvedValueOnce({ id: 'ded-1' });
      tx.salaryAccrual = { findFirst: jest.fn().mockResolvedValue(null) };
    });

    it("`lessonDivisor` uzatilmaydi — 12 talik yo'l o'zgarmaydi", async () => {
      await service.upsert(
        'group-1',
        wednesday,
        { teacherIds: [10042] },
        1,
        99,
      );

      expect(salaryAccrual.createAccrual).toHaveBeenCalledTimes(1);
      const arg = salaryAccrual.createAccrual.mock.calls[0][0];
      expect(arg.perLessonCost).toBe(33_333);
      expect(arg.deductionTransactionId).toBe('ded-1');
      expect(arg.lessonDivisor).toBeUndefined();
      // Oylik hisob bu yo'lda umuman so'ralmaydi.
      expect(monthlyCharge.findChargeForLesson).not.toHaveBeenCalled();
    });
  });

  // ADR-0048 §4 (R4): from 01.10.2026, a debtor ABSENT at their first lesson
  // of the month in a monthly group earns the teacher nothing until their
  // payments reach it; that payment writes the accrual
  // (`accrueDeferredFirstLessons`). An override re-accrues the lesson for the
  // teachers it adds, so the same rule must hold there.
  describe("recomputeAccruals — a debtor's first lesson (R4)", () => {
    // The first Wednesday of October 2026: the first lesson of the month.
    const lessonDay = '2026-10-07';
    // October's charge: four Wednesdays for 450 000. The three after the
    // first lesson hold 337 500 of it, so the lesson is paid once the balance
    // is at least −337 500.
    const octoberCharge = {
      enrollmentId: 'enr-1',
      groupId: 'group-1',
      periodYear: 2026,
      periodMonth: 10,
      coveredDates: ['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28'],
      frozenOutDates: [],
      coveredLessons: 4,
      perLessonCost: 112_500,
      discountPercent: 0,
      chargedAmount: 450_000,
    };
    const givenStudent = (status: string, balance: number) => {
      tx.attendance.findMany.mockResolvedValue([
        { id: 'att-1', studentId: 30001, status },
      ]);
      tx.student = {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(where.id === 30001 ? { balance } : null),
        ),
      };
    };

    beforeEach(() => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        exactDays: ['wednesday'],
      });
      tx.group.findUnique.mockResolvedValue({
        course: { paymentModel: 'MONTHLY' },
      });
      tx.lessonTeacherOverride.findFirst.mockResolvedValue(null);
      tx.lessonTeacherOverride.create.mockResolvedValue({ id: 'override-1' });
      tx.groupTeacher.findMany.mockResolvedValue([{ teacherId: 10001 }]);
      tx.transaction.findFirst.mockResolvedValue(null);
      tx.enrollment.findMany = jest
        .fn()
        .mockResolvedValue([{ id: 'enr-1', status: 'ACTIVE' }]);
      tx.enrollmentMonthlyCharge = {
        findMany: jest.fn().mockResolvedValue([octoberCharge]),
      };
      monthlyCharge.findChargeForLesson.mockResolvedValue({
        perLessonCost: 112_500,
        plannedLessons: 4,
        transactionId: 'mon-tx-1',
      });
    });

    it('pays the substitute nothing while the month is unpaid', async () => {
      givenStudent('ABSENT', -450_000);

      await service.upsert(
        'group-1',
        lessonDay,
        { teacherIds: [10042] },
        1,
        99,
      );

      expect(salaryAccrual.createAccrual).not.toHaveBeenCalled();
      // The replaced teacher's pay, if any, is still taken back.
      expect(salaryAccrual.reverseAccrualForAttendance).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: 10001, studentId: 30001 }),
      );
    });

    it("pays the group's own teacher nothing when the override is removed", async () => {
      givenStudent('ABSENT', -450_000);
      tx.lessonTeacherOverride.findFirst.mockResolvedValue({
        id: 'override-1',
        groupId: 'group-1',
        date: new Date(`${lessonDay}T00:00:00Z`),
        teacherIds: [10042],
      });
      tx.lessonTeacherOverride.update.mockResolvedValue({});

      await service.remove('override-1', 1, 99);

      expect(salaryAccrual.createAccrual).not.toHaveBeenCalled();
      expect(salaryAccrual.reverseAccrualForAttendance).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: 10042, studentId: 30001 }),
      );
    });

    // Only an ABSENT the payments do not reach waits: a debtor who came, and
    // an absent student whose payments reach the lesson, are paid as usual.
    it.each([
      ['PRESENT', -450_000],
      ['ABSENT', -337_500],
    ] as const)(
      'pays the substitute for %s at balance %d',
      async (status, balance) => {
        givenStudent(status, balance);

        await service.upsert(
          'group-1',
          lessonDay,
          { teacherIds: [10042] },
          1,
          99,
        );

        expect(salaryAccrual.createAccrual).toHaveBeenCalledWith(
          expect.objectContaining({
            teacherId: 10042,
            attendanceId: 'att-1',
            perLessonCost: 112_500,
            deductionTransactionId: 'mon-tx-1',
          }),
        );
      },
    );
  });

  describe('remove', () => {
    it('throws NotFoundException when override is missing', async () => {
      tx.lessonTeacherOverride.findFirst.mockResolvedValue(null);
      await expect(service.remove('override-x', 1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('soft-deletes and records DELETE history under Group', async () => {
      tx.lessonTeacherOverride.findFirst.mockResolvedValue({
        id: 'override-1',
        groupId: 'group-1',
        date: new Date('2026-05-13T00:00:00Z'),
        teacherIds: [10042],
      });
      tx.lessonTeacherOverride.update.mockResolvedValue({});
      tx.groupTeacher.findMany.mockResolvedValue([{ teacherId: 10001 }]);

      await service.remove('override-1', 1, 99);

      expect(tx.lessonTeacherOverride.update).toHaveBeenCalledWith({
        where: { id: 'override-1' },
        data: expect.objectContaining({ deletedById: 99 }),
      });
      expect(history.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          entityId: 'group-1',
        }),
      );
    });
  });
});
