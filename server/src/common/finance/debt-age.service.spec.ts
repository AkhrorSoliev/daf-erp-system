import { Test, TestingModule } from '@nestjs/testing';
import { TransactionType } from '@prisma/client';
import { DebtAgeService } from './debt-age.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * The service is plumbing around `replayDebtOrigin` (tested on its own), so
 * what matters here is that the cache stays an optimisation: it must never be
 * able to fail the request, and — the defect this was written after — never be
 * able to make it slower than not caching at all.
 */
describe('DebtAgeService', () => {
  const NEVER = new Promise<never>(() => {});

  const build = async (redis: Partial<RedisService>) => {
    const prisma: any = {
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 10001 }]),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            studentId: 10001,
            type: TransactionType.LESSON_DEDUCTION,
            amount: -100_000,
            createdAt: new Date('2026-05-10T09:00:00Z'),
          },
        ]),
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DebtAgeService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    return { service: mod.get(DebtAgeService), prisma };
  };

  it('serves the cached map without touching the database', async () => {
    const cached = JSON.stringify({
      10001: { since: '2026-05-10T09:00:00.000Z', months: { '2026-05': 100_000 } },
    });
    const { service, prisma } = await build({
      get: jest.fn().mockResolvedValue(cached),
      setex: jest.fn(),
    } as any);

    const ages = await service.getDebtAges(1001);

    expect(ages.get(10001)?.months).toEqual({ '2026-05': 100_000 });
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('computes and still answers when the cache read fails', async () => {
    const { service, prisma } = await build({
      get: jest.fn().mockRejectedValue(new Error('redis down')),
      setex: jest.fn().mockResolvedValue('OK'),
    } as any);

    const ages = await service.getDebtAges(1001);

    expect(ages.get(10001)?.since).toBe('2026-05-10T09:00:00.000Z');
    expect(prisma.transaction.findMany).toHaveBeenCalled();
  });

  it('does not hang when Redis accepts the command and never answers', async () => {
    // ioredis queues commands while disconnected and only rejects when the
    // connection gives up — measured at ~40s for one read plus one write. The
    // race is what keeps a dead cache from costing more than no cache.
    const { service } = await build({
      get: jest.fn().mockReturnValue(NEVER),
      setex: jest.fn().mockReturnValue(NEVER),
    } as any);

    const started = Date.now();
    const ages = await service.getDebtAges(1001);

    expect(ages.size).toBe(1);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('leaves out students who owe nothing today', async () => {
    const { service } = await build({
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
    } as any);
    const svc: any = service;
    svc.prisma.transaction.findMany.mockResolvedValue([
      {
        studentId: 10001,
        type: TransactionType.LESSON_DEDUCTION,
        amount: -100_000,
        createdAt: new Date('2026-05-10T09:00:00Z'),
      },
      {
        studentId: 10001,
        type: TransactionType.PAYMENT,
        amount: 100_000,
        createdAt: new Date('2026-06-01T09:00:00Z'),
      },
    ]);

    const ages = await service.getDebtAges(1001);

    expect(ages.size).toBe(0);
  });
});
