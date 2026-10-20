import { ForbiddenException } from '@nestjs/common';
import * as groupScope from '../../common/auth/group-branch-scope';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { MusobaqaUstozController } from './musobaqa-ustoz.controller';

jest.mock('../../common/auth/group-branch-scope');

describe('MusobaqaUstozController', () => {
  const prisma = {};
  const servis = {
    guruhKorinishi: jest.fn().mockResolvedValue({ ok: 1 }),
  };
  const controller = new MusobaqaUstozController(
    prisma as never,
    servis as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('groups.view qobiliyati, standart rollar CEO, Branch Director, Administrator, Teacher', () => {
    expect(routeAccess(MusobaqaUstozController, 'guruh')).toEqual({
      kind: 'can',
      keys: ['groups.view'],
    });
    expect(defaultRolesOf(MusobaqaUstozController, 'guruh')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
      'Teacher',
    ]);
  });

  it('qorovul chaqiriladi, keyin servis; hafta uzatiladi', async () => {
    const res = await controller.guruh(
      'g1',
      { hafta: '2026-10-12' },
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
    expect(servis.guruhKorinishi).toHaveBeenCalledWith(
      'g1',
      1,
      '2026-10-12',
      expect.any(Date),
    );
    expect(res).toEqual({ ok: 1 });
  });

  it('qorovul rad etsa servis chaqirilmaydi', async () => {
    (groupScope.assertCallerMayTouchGroup as jest.Mock).mockRejectedValueOnce(
      new ForbiddenException('rad'),
    );
    await expect(
      controller.guruh('g1', {}, 5, ['Teacher'], 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(servis.guruhKorinishi).not.toHaveBeenCalled();
  });
});
