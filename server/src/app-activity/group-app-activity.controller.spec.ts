import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import * as groupScope from '../common/auth/group-branch-scope';
import { GroupAppActivityController } from './group-app-activity.controller';

jest.mock('../common/auth/group-branch-scope');

function mockExecutionContext(handler: unknown, roles: string[]) {
  return {
    getHandler: () => handler,
    getClass: () => GroupAppActivityController,
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  } as never;
}

describe('GroupAppActivityController', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const prisma = {
    group: {
      findFirst: jest.fn().mockResolvedValue({ level: 'A2' }),
    },
  };
  const stats = {
    guruhFaolligi: jest.fn().mockResolvedValue({ ok: 1 }),
    oquvchiFaolligi: jest.fn().mockResolvedValue({ ok: 2 }),
    guruhAzosiEkaniniTekshir: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new GroupAppActivityController(
    prisma as never,
    stats as never,
  );

  beforeEach(() => jest.clearAllMocks());

  for (const metod of ['guruh', 'oquvchi'] as const) {
    it(`${metod}: rollar CEO, Branch Director, Administrator, Teacher`, () => {
      expect(reflector.get<string[]>(ROLES_KEY, controller[metod])).toEqual([
        'CEO',
        'Branch Director',
        'Administrator',
        'Teacher',
      ]);
      expect(
        guard.canActivate(mockExecutionContext(controller[metod], ['Teacher'])),
      ).toBe(true);
      expect(() =>
        guard.canActivate(mockExecutionContext(controller[metod], ['Cashier'])),
      ).toThrow(ForbiddenException);
    });
  }

  it('guruh: qorovul chaqiriladi, keyin servis; davr 30', async () => {
    const res = await controller.guruh(
      'g1',
      { period: '30' },
      5,
      ['Teacher'],
      1,
    );
    expect(groupScope.assertCallerMayTouchGroup).toHaveBeenCalledWith(
      prisma,
      5,
      ['Teacher'],
      'g1',
      expect.any(String),
    );
    expect(stats.guruhFaolligi).toHaveBeenCalledWith(
      'g1',
      1,
      30,
      expect.any(Date),
    );
    expect(res).toEqual({ ok: 1 });
  });

  it('qorovul rad etsa servis chaqirilmaydi', async () => {
    (groupScope.assertCallerMayTouchGroup as jest.Mock).mockRejectedValueOnce(
      new ForbiddenException(),
    );
    await expect(
      controller.guruh('g1', {}, 5, ['Teacher'], 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(stats.guruhFaolligi).not.toHaveBeenCalled();
  });

  it('oquvchi: qorovul, a`zolik, keyin servis; standart davr 7; guruh darajasi uzatiladi', async () => {
    await controller.oquvchi('g1', 10001, {}, 5, ['Administrator'], 1);
    expect(groupScope.assertCallerMayTouchGroup).toHaveBeenCalled();
    expect(stats.guruhAzosiEkaniniTekshir).toHaveBeenCalledWith('g1', 10001);
    expect(prisma.group.findFirst).toHaveBeenCalledWith({
      where: { id: 'g1', companyId: 1, deletedAt: null },
      select: { level: true },
    });
    expect(stats.oquvchiFaolligi).toHaveBeenCalledWith(
      10001,
      1,
      7,
      expect.any(Date),
      'A2',
    );
  });

  it('oquvchi: qorovul rad etsa a`zolik ham, servis ham chaqirilmaydi', async () => {
    (groupScope.assertCallerMayTouchGroup as jest.Mock).mockRejectedValueOnce(
      new ForbiddenException(),
    );
    await expect(
      controller.oquvchi('g1', 10001, {}, 5, ['Administrator'], 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(stats.guruhAzosiEkaniniTekshir).not.toHaveBeenCalled();
    expect(stats.oquvchiFaolligi).not.toHaveBeenCalled();
  });
});
