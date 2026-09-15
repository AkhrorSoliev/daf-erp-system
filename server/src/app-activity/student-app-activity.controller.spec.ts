import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import * as studentScope from '../common/auth/student-branch-scope';
import { StudentAppActivityController } from './student-app-activity.controller';

jest.mock('../common/auth/student-branch-scope');

function mockExecutionContext(handler: unknown, roles: string[]) {
  return {
    getHandler: () => handler,
    getClass: () => StudentAppActivityController,
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  } as never;
}

describe('StudentAppActivityController', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
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

  it('oquvchi: rollar CEO, Branch Director, Administrator', () => {
    expect(reflector.get<string[]>(ROLES_KEY, controller.oquvchi)).toEqual([
      'CEO',
      'Branch Director',
      'Administrator',
    ]);
    expect(
      guard.canActivate(
        mockExecutionContext(controller.oquvchi, ['Administrator']),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(mockExecutionContext(controller.oquvchi, ['Teacher'])),
    ).toThrow(ForbiddenException);
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
