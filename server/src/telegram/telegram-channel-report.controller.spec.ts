import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TelegramChannelReportController } from './telegram-channel-report.controller';
import { TelegramService } from './telegram.service';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { LevelTestResultsService } from '../level-test/level-test-results.service';

describe('TelegramChannelReportController', () => {
  let controller: TelegramChannelReportController;

  const levelTests = {
    stats: jest.fn().mockResolvedValue({ started: 7, finished: 3 }),
  };

  const gateStats = {
    getSummary: jest.fn().mockResolvedValue({
      blocked: 120,
      joined: 84,
      left: 9,
      conversionRate: 70,
      waiting: 36,
    }),
    getList: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  };

  const telegram = {
    getChannelMemberCount: jest.fn().mockResolvedValue(2614),
    isChannelGateEnabled: jest.fn().mockReturnValue(true),
    getRequiredChannel: jest.fn().mockReturnValue('@daffergana'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T10:00:00Z'));
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TelegramChannelReportController],
      providers: [
        { provide: TelegramService, useValue: telegram },
        { provide: TelegramChannelGateStatsService, useValue: gateStats },
        { provide: LevelTestResultsService, useValue: levelTests },
      ],
    }).compile();

    controller = moduleRef.get(TelegramChannelReportController);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('route access', () => {
    it.each(['summary', 'list', 'levelTestStats'] as const)(
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
    it.each(['summary', 'list', 'levelTestStats'] as const)(
      '%s admits the CEO and the Branch Director by default, nobody else',
      (method) => {
        expect(defaultRolesOf(TelegramChannelReportController, method)).toEqual(
          ['Branch Director', 'CEO'],
        );
      },
    );
  });

  describe('summary', () => {
    it('adds the channel member count and the gate state to the cohort figures', async () => {
      const res = await controller.summary('2026-07');

      expect(res).toEqual({
        blocked: 120,
        joined: 84,
        left: 9,
        conversionRate: 70,
        waiting: 36,
        channelMembers: 2614,
        gateEnabled: true,
        channel: '@daffergana',
        month: '2026-07',
      });
      expect(gateStats.getSummary).toHaveBeenCalledWith('2026-07');
    });

    it('no month means the current Tashkent month', async () => {
      const res = await controller.summary();

      expect(gateStats.getSummary).toHaveBeenCalledWith('2026-09');
      expect(res.month).toBe('2026-09');
    });

    it('answers even when the channel count is unavailable', async () => {
      telegram.getChannelMemberCount.mockResolvedValueOnce(null);
      const res = await controller.summary('2026-07');
      expect(res.channelMembers).toBeNull();
    });

    it.each([
      ['salom', "Oy YYYY-MM ko'rinishida bo'lishi kerak"],
      ['2026-04', 'Bot hisoboti may 2026 dan boshlanadi'],
      ['2026-10', "Kelajak oyni tanlab bo'lmaydi"],
    ])('refuses month %s', async (month, message) => {
      await expect(controller.summary(month)).rejects.toThrow(
        new BadRequestException(message),
      );
      expect(gateStats.getSummary).not.toHaveBeenCalled();
    });
  });

  describe('levelTestStats', () => {
    it('reads the given month and echoes it back', async () => {
      const res = await controller.levelTestStats('2026-07');
      expect(levelTests.stats).toHaveBeenCalledWith(
        expect.any(Number),
        '2026-07',
      );
      expect(res).toEqual({ started: 7, finished: 3, month: '2026-07' });
    });

    it('no month means the current Tashkent month', async () => {
      await controller.levelTestStats();
      expect(levelTests.stats).toHaveBeenCalledWith(
        expect.any(Number),
        '2026-09',
      );
    });

    it('refuses a bad month before reading anything', async () => {
      await expect(controller.levelTestStats('2026-04')).rejects.toThrow(
        BadRequestException,
      );
      expect(levelTests.stats).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('passes the month, page and size to the service', async () => {
      await controller.list('2026-07', '2', '20');
      expect(gateStats.getList).toHaveBeenCalledWith({
        month: '2026-07',
        page: 2,
        pageSize: 20,
      });
    });

    it('no month means the current Tashkent month', async () => {
      await controller.list();
      expect(gateStats.getList).toHaveBeenCalledWith({
        month: '2026-09',
        page: 1,
        pageSize: 10,
      });
    });

    it('caps pageSize at 50', async () => {
      await controller.list('2026-07', '1', '999');
      expect(gateStats.getList).toHaveBeenCalledWith({
        month: '2026-07',
        page: 1,
        pageSize: 50,
      });
    });

    it('falls back to the defaults on unreadable numbers', async () => {
      await controller.list('2026-07', 'abc', 'xyz');
      expect(gateStats.getList).toHaveBeenCalledWith({
        month: '2026-07',
        page: 1,
        pageSize: 10,
      });
    });

    it('refuses a bad month before reading anything', async () => {
      await expect(controller.list('2026-04')).rejects.toThrow(
        BadRequestException,
      );
      expect(gateStats.getList).not.toHaveBeenCalled();
    });
  });
});
