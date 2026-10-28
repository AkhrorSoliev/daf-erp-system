import { BadRequestException } from '@nestjs/common';
import { TaxSettingsService } from './tax-settings.service';

describe('TaxSettingsService', () => {
  const store: Record<string, unknown> = {};
  const settings = {
    get: jest.fn((_c: number, key: string) =>
      Promise.resolve(store[key] ?? []),
    ),
    setMany: jest.fn((_c: number, entries: [string, unknown][]) => {
      for (const [k, v] of entries) store[k] = v;
      return Promise.resolve();
    }),
  };
  const redis = {
    scanStream: jest.fn(() => ({ async *[Symbol.asyncIterator]() {} })),
    del: jest.fn(),
  };
  const service = new TaxSettingsService(settings as never, redis as never);

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    jest.clearAllMocks();
  });

  it('counts filled keys', async () => {
    store['tax.turnoverPercent'] = [{ fromMonth: '2026-10', value: 4 }];
    const view = await service.read(1);
    expect(view.total).toBe(8);
    expect(view.filled).toBe(1);
  });

  it('writes only tax keys, in one setMany', async () => {
    await service.update(
      1,
      { values: { 'fees.qr': [{ fromMonth: '2026-10', value: 1 }] } },
      7,
    );
    expect(settings.setMany).toHaveBeenCalledWith(
      1,
      [['fees.qr', [{ fromMonth: '2026-10', value: 1 }]]],
      7,
    );
  });

  it('invalidates the profit cache after the write, not before', async () => {
    await service.update(
      1,
      { values: { 'fees.qr': [{ fromMonth: '2026-10', value: 1 }] } },
      7,
    );
    expect(redis.scanStream).toHaveBeenCalledTimes(1);
    expect(settings.setMany.mock.invocationCallOrder[0]).toBeLessThan(
      redis.scanStream.mock.invocationCallOrder[0],
    );
  });

  it('refuses a foreign key and an empty patch', async () => {
    await expect(
      service.update(1, { values: { 'payment.defaultModel': 'MONTHLY' } }, 7),
    ).rejects.toThrow(BadRequestException);
    await expect(service.update(1, { values: {} }, 7)).rejects.toThrow(
      BadRequestException,
    );
  });
});
