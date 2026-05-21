import { Test, TestingModule } from '@nestjs/testing';
import { TelegramGroupDigestBufferService } from './telegram-group-digest-buffer.service';
import { RedisService } from '../redis/redis.service';
import { TG_GROUP_BATCH_KEY_PREFIX } from './constants';

describe('TelegramGroupDigestBufferService', () => {
  let service: TelegramGroupDigestBufferService;
  let exec: jest.Mock;
  let chain: {
    rpush: jest.Mock;
    expire: jest.Mock;
    lrange: jest.Mock;
    del: jest.Mock;
    exec: jest.Mock;
  };
  const redis = { multi: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    exec = jest.fn();
    chain = {
      rpush: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      lrange: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      exec,
    };
    redis.multi.mockReturnValue(chain);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupDigestBufferService,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = module.get(TelegramGroupDigestBufferService);
  });

  describe('push', () => {
    it('rpushes a JSON entry and refreshes the TTL', async () => {
      exec.mockResolvedValue([]);
      await service.push(1001, {
        kind: 'student',
        branchId: 1,
        studentId: 10042,
        name: 'Ali Valiyev',
      });
      const key = `${TG_GROUP_BATCH_KEY_PREFIX}1001`;
      expect(chain.rpush).toHaveBeenCalledWith(key, expect.any(String));
      const stored = JSON.parse((chain.rpush.mock.calls[0][1]) as string);
      expect(stored).toMatchObject({ kind: 'student', name: 'Ali Valiyev' });
      expect(stored.at).toEqual(expect.any(String)); // timestamp stamped
      expect(chain.expire).toHaveBeenCalledWith(key, expect.any(Number));
    });

    it('swallows redis errors (best-effort)', async () => {
      exec.mockRejectedValue(new Error('redis down'));
      await expect(
        service.push(1001, {
          kind: 'group',
          branchId: 2,
          name: 'B1',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('drain', () => {
    it('returns parsed entries and clears the buffer', async () => {
      const entry = JSON.stringify({
        kind: 'payment',
        at: '2026-05-21T10:00:00.000Z',
        branchId: null,
        studentName: 'A B',
        amount: 500_000,
        method: 'CASH',
      });
      exec.mockResolvedValue([
        [null, [entry]],
        [null, 1],
      ]);
      const result = await service.drain(1001);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ kind: 'payment', amount: 500_000 });
      expect(chain.del).toHaveBeenCalledWith(`${TG_GROUP_BATCH_KEY_PREFIX}1001`);
    });

    it('returns an empty array when the buffer is empty', async () => {
      exec.mockResolvedValue([
        [null, []],
        [null, 0],
      ]);
      expect(await service.drain(1001)).toEqual([]);
    });

    it('skips corrupt entries instead of dropping the whole digest', async () => {
      const good = JSON.stringify({
        kind: 'group',
        at: '2026-05-21T10:00:00.000Z',
        branchId: 2,
        name: 'B1',
      });
      exec.mockResolvedValue([
        [null, ['{ not json', good]],
        [null, 2],
      ]);
      const result = await service.drain(1001);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ kind: 'group', name: 'B1' });
    });

    it('returns an empty array on redis failure', async () => {
      exec.mockRejectedValue(new Error('redis down'));
      expect(await service.drain(1001)).toEqual([]);
    });
  });
});
