import { BadRequestException } from '@nestjs/common';
import { StudentBarredLessonsController } from './student-barred-lessons.controller';
import { defaultRolesOf } from '../common/permissions/testing';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn().mockResolvedValue(undefined),
}));
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';

describe('StudentBarredLessonsController', () => {
  const prisma = {
    enrollment: { findFirst: jest.fn() },
  };
  const barred = { flags: jest.fn() };
  const charge = {
    outstandingForStudent: jest.fn(),
    releasedDays: jest.fn(),
    restore: jest.fn(),
  };
  const entityHistory = { recordUpdate: jest.fn() };
  const controller = new StudentBarredLessonsController(
    prisma as never,
    barred as never,
    charge as never,
    entityHistory as never,
  );
  const dto = {
    enrollmentId: '8d3a3c8e-6e0e-4c8e-9b0e-0b6f2b6a1f11',
    attendedDays: ['2026-10-05', '2026-10-07'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    barred.flags.mockResolvedValue({ restoreDialog: true });
    prisma.enrollment.findFirst.mockResolvedValue({ group: { name: '#031' } });
    charge.releasedDays.mockResolvedValue([
      { period: '2026-10', days: ['2026-10-05', '2026-10-07', '2026-10-09'] },
    ]);
    charge.restore.mockResolvedValue({ charged: 69231, lessons: 2 });
  });

  it('is open to Administrator, Branch Director and CEO by default, on both routes', () => {
    for (const method of ['list', 'restore']) {
      expect(defaultRolesOf(StudentBarredLessonsController, method)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    }
  });

  it('checks the caller against the student branch before anything', async () => {
    await controller.list(10001, 1001, 7);
    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith(
      prisma,
      7,
      10001,
      1001,
    );
  });

  it('offers nothing while the return-dialog switch is off', async () => {
    barred.flags.mockResolvedValue({ restoreDialog: false });
    expect(await controller.list(10001, 1001, 7)).toEqual({
      enabled: false,
      items: [],
    });
    expect(charge.outstandingForStudent).not.toHaveBeenCalled();
    await expect(
      controller.restore(10001, dto, 1001, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(charge.restore).not.toHaveBeenCalled();
  });

  it('lists what the pauses released when the switch is on', async () => {
    charge.outstandingForStudent.mockResolvedValue([{ enrollmentId: 'e1' }]);
    expect(await controller.list(10001, 1001, 7)).toEqual({
      enabled: true,
      items: [{ enrollmentId: 'e1' }],
    });
  });

  it('restores the chosen days and writes the decision to the history', async () => {
    const out = await controller.restore(10001, dto, 1001, 7);
    expect(out).toEqual({ restoredLessons: 2, charged: 69231 });
    expect(charge.restore).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentId: dto.enrollmentId,
        attendedDays: dto.attendedDays,
        performedById: 7,
      }),
    );
    expect(entityHistory.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 10001,
        oldValues: { 'Hisobdan chiqarilgan darslar': '3 ta' },
        newValues: {
          'Hisobdan chiqarilgan darslar': expect.stringContaining('1 ta'),
        },
      }),
    );
  });

  it('"hech biriga kelmagan" (no days) still leaves a trace', async () => {
    charge.restore.mockResolvedValue({ charged: 0, lessons: 0 });
    await controller.restore(10001, { ...dto, attendedDays: [] }, 1001, 7);
    expect(charge.restore).toHaveBeenCalledWith(
      expect.objectContaining({ attendedDays: [] }),
    );
    expect(entityHistory.recordUpdate).toHaveBeenCalledTimes(1);
  });

  it('refuses an enrollment that is not the student’s', async () => {
    prisma.enrollment.findFirst.mockResolvedValue(null);
    await expect(
      controller.restore(10001, dto, 1001, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(charge.restore).not.toHaveBeenCalled();
  });
});
