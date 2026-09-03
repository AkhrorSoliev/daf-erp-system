import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EntityHistoryService } from '../common/entity-history';

describe('SettingsService', () => {
  const COMPANY_ID = 1001;
  let service: SettingsService;
  let prisma: any;
  let redis: any;
  let entityHistoryService: any;

  beforeEach(() => {
    prisma = {
      setting: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    // Stateful, in-memory stand-in for Redis — a plain mockResolvedValue(null)
    // would make every get() a "miss" and defeat the very thing under test
    // (that a second read for the same company does NOT hit the DB again).
    const store = new Map<string, string>();
    redis = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      setex: jest.fn((key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve(1);
      }),
    };
    entityHistoryService = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
    };

    service = new SettingsService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      entityHistoryService as unknown as EntityHistoryService,
    );
  });

  describe('get', () => {
    it('never returns undefined — falls back to the coded default when nothing is stored', async () => {
      const value = await service.get(COMPANY_ID, 'payment.defaultModel');
      expect(value).toBe('MONTHLY');
    });

    it('company value wins over the coded default', async () => {
      prisma.setting.findMany.mockResolvedValue([
        { key: 'payment.chargeDayOfMonth', branchId: null, value: 10 },
      ]);
      const value = await service.get(COMPANY_ID, 'payment.chargeDayOfMonth');
      expect(value).toBe(10);
    });

    it('branch value wins over the company value', async () => {
      prisma.setting.findMany.mockResolvedValue([
        { key: 'payment.chargeDayOfMonth', branchId: null, value: 10 },
        { key: 'payment.chargeDayOfMonth', branchId: 5, value: 20 },
      ]);
      const branchValue = await service.get(
        COMPANY_ID,
        'payment.chargeDayOfMonth',
        5,
      );
      expect(branchValue).toBe(20);

      const otherBranchValue = await service.get(
        COMPANY_ID,
        'payment.chargeDayOfMonth',
        6,
      );
      expect(otherBranchValue).toBe(10);
    });

    it('only queries the DB once — subsequent reads for the same company hit the cache', async () => {
      await service.get(COMPANY_ID, 'payment.defaultModel');
      await service.get(COMPANY_ID, 'payment.excusedCreditEnabled');
      await service.get(COMPANY_ID, 'payment.chargeDayOfMonth', 5);
      expect(prisma.setting.findMany).toHaveBeenCalledTimes(1);
    });

    it('degrades to the DB when redis read fails, never throws', async () => {
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const value = await service.get(COMPANY_ID, 'payment.defaultModel');
      expect(value).toBe('MONTHLY');
      expect(prisma.setting.findMany).toHaveBeenCalled();
    });
  });

  describe('getMany', () => {
    it('returns every registered key in one query', async () => {
      prisma.setting.findMany.mockResolvedValue([
        { key: 'payment.excusedCreditEnabled', branchId: null, value: false },
      ]);
      const all = await service.getMany(COMPANY_ID);
      expect(prisma.setting.findMany).toHaveBeenCalledTimes(1);
      expect(all).toEqual({
        'payment.defaultModel': 'MONTHLY',
        'payment.excusedCreditEnabled': false,
        'payment.excusedCreditMonthlyCap': null,
        'payment.chargeDayOfMonth': 1,
      });
    });
  });

  describe('set', () => {
    it('rejects an invalid value with a Latin-Uzbek message and never writes', async () => {
      await expect(
        service.set(COMPANY_ID, 'payment.chargeDayOfMonth', 40, 1),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.setting.create).not.toHaveBeenCalled();
      expect(prisma.setting.update).not.toHaveBeenCalled();
    });

    it('creates a new row via findFirst + create — never upsert (nullable branchId)', async () => {
      prisma.setting.findFirst.mockResolvedValue(null);
      prisma.setting.create.mockResolvedValue({
        id: 'setting-1',
        key: 'payment.chargeDayOfMonth',
        branchId: null,
        value: 5,
      });

      const value = await service.set(
        COMPANY_ID,
        'payment.chargeDayOfMonth',
        5,
        42,
      );

      expect(value).toBe(5);
      expect(prisma.setting.findFirst).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, branchId: null, key: 'payment.chargeDayOfMonth' },
      });
      expect(prisma.setting.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_ID,
          branchId: null,
          key: 'payment.chargeDayOfMonth',
          value: 5,
          updatedById: 42,
        },
      });
      expect(entityHistoryService.recordCreate).toHaveBeenCalled();
    });

    it('updates the existing row by id when one is found', async () => {
      prisma.setting.findFirst.mockResolvedValue({
        id: 'setting-1',
        key: 'payment.excusedCreditEnabled',
        branchId: 5,
        value: true,
      });
      prisma.setting.update.mockResolvedValue({
        id: 'setting-1',
        key: 'payment.excusedCreditEnabled',
        branchId: 5,
        value: false,
      });

      await service.set(
        COMPANY_ID,
        'payment.excusedCreditEnabled',
        false,
        42,
        5,
      );

      expect(prisma.setting.update).toHaveBeenCalledWith({
        where: { id: 'setting-1' },
        data: { value: false, updatedById: 42 },
      });
      expect(entityHistoryService.recordUpdate).toHaveBeenCalled();
    });

    it('invalidates the company cache so the next read is not stale', async () => {
      prisma.setting.findFirst.mockResolvedValue(null);
      prisma.setting.create.mockResolvedValue({
        id: 'setting-1',
        key: 'payment.chargeDayOfMonth',
        branchId: null,
        value: 5,
      });

      await service.set(COMPANY_ID, 'payment.chargeDayOfMonth', 5, 42);

      expect(redis.del).toHaveBeenCalledWith(`settings:company:${COMPANY_ID}`);
    });

    it('a redis outage on write never fails the request', async () => {
      redis.del.mockRejectedValue(new Error('ECONNREFUSED'));
      prisma.setting.findFirst.mockResolvedValue(null);
      prisma.setting.create.mockResolvedValue({
        id: 'setting-1',
        key: 'payment.chargeDayOfMonth',
        branchId: null,
        value: 5,
      });

      await expect(
        service.set(COMPANY_ID, 'payment.chargeDayOfMonth', 5, 42),
      ).resolves.toBe(5);
    });
  });
});
