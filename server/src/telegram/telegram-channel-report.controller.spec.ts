import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TelegramChannelReportController } from './telegram-channel-report.controller';
import { TelegramService } from './telegram.service';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('TelegramChannelReportController', () => {
  let controller: TelegramChannelReportController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const gateStats = {
    getSummary: jest.fn().mockResolvedValue({
      blocked: 100,
      joinedViaGate: 70,
      leftAfterJoin: 25,
      organicJoins: 12,
      stillMemberViaGate: 45,
      waiting: 30,
      conversionRate: 70,
    }),
    getList: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  };

  const telegram = {
    getChannelMemberCount: jest.fn().mockResolvedValue(2560),
    isChannelGateEnabled: jest.fn().mockReturnValue(true),
    getRequiredChannel: jest.fn().mockReturnValue('@daffergana'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TelegramChannelReportController],
      providers: [
        { provide: TelegramService, useValue: telegram },
        { provide: TelegramChannelGateStatsService, useValue: gateStats },
        Reflector,
        RolesGuard,
      ],
    }).compile();

    controller = moduleRef.get(TelegramChannelReportController);
    reflector = moduleRef.get(Reflector);
    guard = moduleRef.get(RolesGuard);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => TelegramChannelReportController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as any;
  }

  describe('rol himoyasi', () => {
    it('sinf darajasida @Roles(CEO, Branch Director) bor', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        TelegramChannelReportController,
      );
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });

    it.each(['CEO', 'Branch Director'])('%s ga ruxsat beradi', (role) => {
      const ctx = mockExecutionContext(controller.summary, [role]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    // Administrator ATAYLAB rad etiladi — /reports bo'limi ham unga yopiq.
    it.each(['Administrator', 'Teacher', 'Cashier'])(
      '%s ni rad etadi',
      (role) => {
        const ctx = mockExecutionContext(controller.summary, [role]);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      },
    );
  });

  describe('summary', () => {
    it("kanal a'zolari soni va gate holatini qo'shib qaytaradi", async () => {
      const res = await controller.summary();

      expect(res).toEqual(
        expect.objectContaining({
          blocked: 100,
          joinedViaGate: 70,
          stillMemberViaGate: 45,
          conversionRate: 70,
          channelMembers: 2560,
          gateEnabled: true,
          channel: '@daffergana',
        }),
      );
    });

    it("'YYYY-MM' oyni to'g'ri oraliqqa aylantiradi", async () => {
      await controller.summary('2026-07');

      const range = gateStats.getSummary.mock.calls[0][0];
      expect(range.from.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      // Iyul 31 kun — oxirgi kun 31-i bo'lishi shart (keyingi oyga o'tib ketmasin)
      expect(range.to.toISOString()).toBe('2026-07-31T23:59:59.999Z');
    });

    it("fevralning oxirgi kunini to'g'ri hisoblaydi", async () => {
      await controller.summary('2026-02');

      const range = gateStats.getSummary.mock.calls[0][0];
      expect(range.to.toISOString()).toBe('2026-02-28T23:59:59.999Z');
    });

    it("noto'g'ri oy formatida davr filtri qo'llanmaydi", async () => {
      await controller.summary('salom');
      expect(gateStats.getSummary).toHaveBeenCalledWith(undefined);
    });

    it('kanal soni olinmasa ham xato bermaydi', async () => {
      telegram.getChannelMemberCount.mockResolvedValueOnce(null);
      const res = await controller.summary();
      expect(res.channelMembers).toBeNull();
    });
  });

  describe('list', () => {
    it('pageSize ni 50 bilan cheklaydi', async () => {
      await controller.list('1', '999');
      expect(gateStats.getList).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
    });

    it("noto'g'ri qiymatlarda standart qiymatlarga qaytadi", async () => {
      await controller.list('abc', 'xyz');
      expect(gateStats.getList).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    });
  });
});
