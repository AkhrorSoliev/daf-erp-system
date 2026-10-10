import { ForbiddenException } from '@nestjs/common';
import * as studentScope from '../common/auth/student-branch-scope';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { StudentAppActivityController } from './student-app-activity.controller';

jest.mock('../common/auth/student-branch-scope');

describe('StudentAppActivityController', () => {
  const prisma = {};
  const stats = {
    guruhFaolligi: jest.fn().mockResolvedValue({ ok: 1 }),
    oquvchiFaolligi: jest.fn().mockResolvedValue({ ok: 2 }),
    guruhAzosiEkaniniTekshir: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new StudentAppActivityController(
    prisma as never,
    stats as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('oquvchi: gated by the student details capability, default roles CEO, Branch Director, Administrator', () => {
    expect(routeAccess(StudentAppActivityController, 'oquvchi')).toEqual({
      kind: 'can',
      keys: ['students.details'],
    });
    expect(defaultRolesOf(StudentAppActivityController, 'oquvchi')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });

  it('oquvchi: qorovul chaqiriladi, keyin servis; davr 30', async () => {
    const res = await controller.oquvchi(10001, { period: '30' }, 5, 1);
    expect(studentScope.assertCallerMayTouchStudent).toHaveBeenCalledWith(
      prisma,
      5,
      10001,
      1,
    );
    expect(stats.oquvchiFaolligi).toHaveBeenCalledWith(
      10001,
      1,
      30,
      expect.any(Date),
    );
    expect(res).toEqual({ ok: 2 });
  });

  it('qorovul rad etsa servis chaqirilmaydi', async () => {
    (
      studentScope.assertCallerMayTouchStudent as jest.Mock
    ).mockRejectedValueOnce(new ForbiddenException());
    await expect(controller.oquvchi(10001, {}, 5, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(stats.oquvchiFaolligi).not.toHaveBeenCalled();
  });
});
