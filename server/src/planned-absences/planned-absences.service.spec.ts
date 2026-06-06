import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlannedAbsenceKind } from '@prisma/client';
import { PlannedAbsencesService } from './planned-absences.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceValidationService } from '../attendance/attendance-validation.service';
import { EntityHistoryService } from '../common/entity-history';

describe('PlannedAbsencesService', () => {
  let service: PlannedAbsencesService;
  let prisma: {
    enrollment: { findFirst: jest.Mock };
    attendance: { findUnique: jest.Mock };
    plannedAbsence: {
      upsert: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
  };
  let validation: { validateLessonDate: jest.Mock };
  let entityHistory: { recordCreate: jest.Mock; recordDelete: jest.Mock };

  const parsedDate = new Date('2026-06-10T00:00:00.000Z');
  const dto = { studentId: 10001, kind: PlannedAbsenceKind.SABABSIZ };

  beforeEach(async () => {
    prisma = {
      enrollment: { findFirst: jest.fn() },
      attendance: { findUnique: jest.fn() },
      plannedAbsence: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    };
    validation = {
      validateLessonDate: jest
        .fn()
        .mockResolvedValue({ parsedDate, group: {} }),
    };
    entityHistory = {
      recordCreate: jest.fn().mockResolvedValue(undefined),
      recordDelete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannedAbsencesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AttendanceValidationService, useValue: validation },
        { provide: EntityHistoryService, useValue: entityHistory },
      ],
    }).compile();

    service = module.get(PlannedAbsencesService);
  });

  describe('upsert', () => {
    it('creates a pre-mark when the student is enrolled and no attendance exists', async () => {
      prisma.enrollment.findFirst.mockResolvedValue({ id: 'enr1' });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.plannedAbsence.upsert.mockResolvedValue({
        id: 'pa1',
        kind: dto.kind,
      });

      const result = await service.upsert(
        'g1',
        '2026-06-10',
        dto,
        99,
        ['Administrator'],
        1,
      );

      // Reuses attendance lesson-date validation, forwarding the roles so the
      // admin time-window bypass applies.
      expect(validation.validateLessonDate).toHaveBeenCalledWith(
        'g1',
        '2026-06-10',
        1,
        ['Administrator'],
      );
      expect(prisma.plannedAbsence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            groupId_studentId_date: {
              groupId: 'g1',
              studentId: 10001,
              date: parsedDate,
            },
          },
          create: expect.objectContaining({
            createdById: 99,
            companyId: 1,
            kind: dto.kind,
          }),
        }),
      );
      // Cross-entity audit: Group + Student.
      expect(entityHistory.recordCreate).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 'pa1', kind: dto.kind });
    });

    it('rejects when the student is not enrolled / before their startDate', async () => {
      prisma.enrollment.findFirst.mockResolvedValue(null);

      await expect(
        service.upsert('g1', '2026-06-10', dto, 99, ['Administrator'], 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.plannedAbsence.upsert).not.toHaveBeenCalled();
    });

    it('rejects when attendance was already taken for the lesson', async () => {
      prisma.enrollment.findFirst.mockResolvedValue({ id: 'enr1' });
      prisma.attendance.findUnique.mockResolvedValue({ id: 'att1' });

      await expect(
        service.upsert('g1', '2026-06-10', dto, 99, ['Administrator'], 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.plannedAbsence.upsert).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an unconsumed pre-mark and records cross-entity history', async () => {
      prisma.plannedAbsence.findFirst.mockResolvedValue({
        id: 'pa1',
        groupId: 'g1',
        studentId: 10001,
        date: parsedDate,
        kind: PlannedAbsenceKind.SABABLI,
      });
      prisma.plannedAbsence.delete.mockResolvedValue({});

      const res = await service.remove('pa1', 99, 1);

      expect(prisma.plannedAbsence.findFirst).toHaveBeenCalledWith({
        where: { id: 'pa1', companyId: 1, consumedAt: null },
        select: expect.any(Object),
      });
      expect(prisma.plannedAbsence.delete).toHaveBeenCalledWith({
        where: { id: 'pa1' },
      });
      expect(entityHistory.recordDelete).toHaveBeenCalledTimes(2);
      expect(res).toEqual({ message: "Oldindan belgilash o'chirildi" });
    });

    it('throws NotFound when the pre-mark is missing or already consumed', async () => {
      prisma.plannedAbsence.findFirst.mockResolvedValue(null);

      await expect(service.remove('pa1', 99, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.plannedAbsence.delete).not.toHaveBeenCalled();
    });
  });
});
