import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LessonTeacherOverridesService } from './lesson-teacher-overrides.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryAccrualService } from '../salary/salary-accrual.service';
import { EntityHistoryService } from '../common/entity-history';
import { MonthlyChargeService } from '../billing/monthly-charge.service';

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
