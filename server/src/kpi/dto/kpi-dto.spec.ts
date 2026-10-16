import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { KpiOverviewQueryDto } from './kpi-query.dto';
import { KpiSettingsDto } from './kpi-settings.dto';

const props = async (cls: new () => object, body: object) =>
  (
    await validate(plainToInstance(cls, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map((e) => e.property);

describe('KPI DTOs', () => {
  it('takes YYYY-MM months only', async () => {
    expect(
      await props(KpiOverviewQueryDto, {
        month: '2026-10',
        compare: '2026-09',
      }),
    ).toEqual([]);
    expect(await props(KpiOverviewQueryDto, {})).toEqual([]);
    expect(await props(KpiOverviewQueryDto, { month: '2026-13' })).toEqual([
      'month',
    ]);
    expect(await props(KpiOverviewQueryDto, { compare: '10.2026' })).toEqual([
      'compare',
    ]);
  });

  it('takes a whole rule with a known mode and a value up to 10 000 000', async () => {
    expect(
      await props(KpiSettingsDto, {
        enabled: true,
        leadPaid: { mode: 'PERCENT', value: 5 },
      }),
    ).toEqual([]);
    expect(
      await props(KpiSettingsDto, { leadPaid: { mode: 'SOME', value: 5 } }),
    ).toEqual(['leadPaid']);
    expect(
      await props(KpiSettingsDto, {
        promiseKept: { mode: 'FIXED', value: 10_000_001 },
      }),
    ).toEqual(['promiseKept']);
    expect(
      await props(KpiSettingsDto, { leadPaid: { mode: 'FIXED' } }),
    ).toEqual(['leadPaid']);
    expect(await props(KpiSettingsDto, { enabled: 'yes' })).toEqual([
      'enabled',
    ]);
  });
});
