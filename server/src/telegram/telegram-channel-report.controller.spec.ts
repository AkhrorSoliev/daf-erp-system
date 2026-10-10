import { Test, TestingModule } from '@nestjs/testing';
import { TelegramChannelReportController } from './telegram-channel-report.controller';
import { TelegramService } from './telegram.service';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('TelegramChannelReportController', () => {
  let controller: TelegramChannelReportController;

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
      ],
    }).compile();

    controller = moduleRef.get(TelegramChannelReportController);
  });

  describe('route access', () => {
    it.each(['summary', 'list'] as const)(
      '%s is gated by the student reports capability',
      (method) => {
        expect(routeAccess(TelegramChannelReportController, method)).toEqual({
          kind: 'can',
          keys: ['reports.students'],
        });
      },
    );

    // The Administrator is refused ON PURPOSE: the /reports section is closed
    // to them in the menu too.
    it.each(['summary', 'list'] as const)(
      '%s admits the CEO and the Branch Director by default, nobody else',
      (method) => {
        expect(defaultRolesOf(TelegramChannelReportController, method)).toEqual(
          ['Branch Director', 'CEO'],
        );
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
      // Toshkent iyuli: 01.07 00:00 dan 01.08 00:00 gacha (chegaradan tashqari).
      expect(range.from.toISOString()).toBe('2026-06-30T19:00:00.000Z');
      expect(range.to.toISOString()).toBe('2026-07-31T19:00:00.000Z');
    });

    it("fevralning oxirgi kunini to'g'ri hisoblaydi", async () => {
      await controller.summary('2026-02');

      const range = gateStats.getSummary.mock.calls[0][0];
      // 2026 kabisa yili emas — fevral 28 kun, mart 1-idan oldin tugaydi.
      expect(range.to.toISOString()).toBe('2026-02-28T19:00:00.000Z');
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
