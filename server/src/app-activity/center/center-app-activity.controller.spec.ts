import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CenterAppActivityController } from './center-app-activity.controller';

function mockExecutionContext(handler: unknown, roles: string[]) {
  return {
    getHandler: () => handler,
    getClass: () => CenterAppActivityController,
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  } as never;
}

describe('CenterAppActivityController', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const markaz = {
    umumiy: jest.fn().mockResolvedValue({ ok: 1 }),
    oquvchilar: jest.fn().mockResolvedValue({ ok: 2 }),
    telefonlar: jest.fn().mockResolvedValue({ ok: 3 }),
  };
  const controller = new CenterAppActivityController(markaz as never);

  beforeEach(() => jest.clearAllMocks());

  it("sinf darajasida rollar: CEO, Branch Director, Administrator — o'qituvchi yo'q", () => {
    expect(
      reflector.get<string[]>(ROLES_KEY, CenterAppActivityController),
    ).toEqual(['CEO', 'Branch Director', 'Administrator']);
    for (const metod of ['umumiy', 'oquvchilar', 'telefonlar'] as const) {
      expect(
        guard.canActivate(
          mockExecutionContext(controller[metod], ['Administrator']),
        ),
      ).toBe(true);
      expect(() =>
        guard.canActivate(mockExecutionContext(controller[metod], ['Teacher'])),
      ).toThrow(ForbiddenException);
    }
  });

  it("umumiy: davr va scope servisga o'zgarishsiz o'tadi", async () => {
    const res = await controller.umumiy({ period: '30' }, 1001, null);
    expect(markaz.umumiy).toHaveBeenCalledWith(
      1001,
      null,
      30,
      expect.any(Date),
    );
    expect(res).toEqual({ ok: 1 });
  });

  it("oquvchilar: DTO so'rovga o'giriladi, scope [] ham o'tadi (servis bo'sh qaytaradi)", async () => {
    await controller.oquvchilar(
      { status: ['QIZIL', 'SARIQ'], kirgan: 'yoq', page: 2 },
      1001,
      [],
    );
    expect(markaz.oquvchilar).toHaveBeenCalledWith(
      1001,
      [],
      expect.objectContaining({
        davr: 7,
        status: ['QIZIL', 'SARIQ'],
        kirgan: false,
        page: 2,
        pageSize: 50,
        sort: 'holat',
        dir: 'asc',
      }),
      expect.any(Date),
    );
  });

  it("telefonlar: o'sha filtr bilan", async () => {
    await controller.telefonlar(
      { groupId: '5f2f9d1c-3b2e-4c1a-9c0e-1a2b3c4d5e6f' },
      1001,
      [1],
    );
    expect(markaz.telefonlar).toHaveBeenCalledWith(
      1001,
      [1],
      expect.objectContaining({
        groupId: '5f2f9d1c-3b2e-4c1a-9c0e-1a2b3c4d5e6f',
      }),
      expect.any(Date),
    );
  });
});
