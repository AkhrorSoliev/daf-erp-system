import { BadRequestException } from '@nestjs/common';
import { KpiSettingsService } from './kpi-settings.service';

const DEFAULTS: Record<string, unknown> = {
  'kpi.enabled': true,
  'kpi.leadPaid.mode': 'FIXED',
  'kpi.leadPaid.value': 50_000,
  'kpi.promiseKept.mode': 'FIXED',
  'kpi.promiseKept.value': 20_000,
};

function setup(
  stored: Record<string, unknown> = {},
  writtenAt: Date | null = null,
) {
  const store: Record<string, unknown> = { ...DEFAULTS, ...stored };
  const settings = {
    get: jest.fn((_companyId: number, key: string) =>
      Promise.resolve(store[key]),
    ),
    setMany: jest.fn((_companyId: number, entries: [string, unknown][]) => {
      for (const [key, value] of entries) store[key] = value;
      return Promise.resolve();
    }),
    lastWrittenAt: jest.fn().mockResolvedValue(writtenAt),
  };
  return { settings, service: new KpiSettingsService(settings as never) };
}

describe('KpiSettingsService', () => {
  it('reads the five keys and when the switch last flipped', async () => {
    const at = new Date('2026-10-20T05:00:00Z');
    const s = setup(
      { 'kpi.leadPaid.mode': 'PERCENT', 'kpi.leadPaid.value': 5 },
      at,
    );
    await expect(s.service.read(1001)).resolves.toEqual({
      enabled: true,
      changedAt: at,
      leadPaid: { mode: 'PERCENT', value: 5 },
      promiseKept: { mode: 'FIXED', value: 20_000 },
    });
    expect(s.settings.lastWrittenAt).toHaveBeenCalledWith(1001, 'kpi.enabled');
  });

  it('writes the switch only when it flips, so its time is the flip', async () => {
    const s = setup();
    await s.service.update(1001, { enabled: true }, 7);
    expect(s.settings.setMany).not.toHaveBeenCalled();
    await s.service.update(1001, { enabled: false }, 7);
    expect(s.settings.setMany).toHaveBeenCalledWith(
      1001,
      [['kpi.enabled', false]],
      7,
    );
  });

  it("writes a rule's mode and value in one call — never a FIXED sum read as a percent", async () => {
    const s = setup();
    const out = await s.service.update(
      1001,
      { enabled: false, promiseKept: { mode: 'PERCENT', value: 10 } },
      7,
    );
    expect(s.settings.setMany).toHaveBeenCalledTimes(1);
    expect(s.settings.setMany).toHaveBeenCalledWith(
      1001,
      [
        ['kpi.enabled', false],
        ['kpi.promiseKept.mode', 'PERCENT'],
        ['kpi.promiseKept.value', 10],
      ],
      7,
    );
    expect(out.promiseKept).toEqual({ mode: 'PERCENT', value: 10 });
  });

  it('refuses a percent over 100 and an empty change, writing nothing', async () => {
    const s = setup();
    await expect(
      s.service.update(1001, { leadPaid: { mode: 'PERCENT', value: 101 } }, 7),
    ).rejects.toThrow(BadRequestException);
    await expect(s.service.update(1001, {}, 7)).rejects.toThrow(
      BadRequestException,
    );
    expect(s.settings.setMany).not.toHaveBeenCalled();
  });
});
