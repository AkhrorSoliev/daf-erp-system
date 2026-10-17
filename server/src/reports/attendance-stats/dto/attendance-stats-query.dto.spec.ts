import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AttendanceMissersQueryDto,
  AttendanceStatsQueryDto,
} from './attendance-stats-query.dto';

const props = async (cls: new () => object, query: object) =>
  (
    await validate(plainToInstance(cls, query), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map((e) => e.property);

const RANGE = { startDate: '2026-09-01', endDate: '2026-09-30' };

describe('AttendanceStatsQueryDto', () => {
  it('accepts the URL the page sends', async () => {
    expect(await props(AttendanceStatsQueryDto, RANGE)).toEqual([]);
    expect(
      await props(AttendanceStatsQueryDto, {
        ...RANGE,
        cut: 'teacher',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual([]);
  });

  it.each([
    ['startDate', '09.2026'],
    ['cut', 'branch'],
    ['page', '0'],
    ['pageSize', '5'],
    ['pageSize', '51'],
  ])('refuses %s=%s', async (key, value) => {
    expect(
      await props(AttendanceStatsQueryDto, { ...RANGE, [key]: value }),
    ).toEqual([key]);
  });

  it('needs both days and refuses an old key (att_branchId, preset)', async () => {
    expect(await props(AttendanceStatsQueryDto, {})).toEqual([
      'startDate',
      'endDate',
    ]);
    expect(
      await props(AttendanceStatsQueryDto, { ...RANGE, att_branchId: '2' }),
    ).toEqual(['att_branchId']);
    expect(
      await props(AttendanceStatsQueryDto, {
        ...RANGE,
        preset: 'current_month',
      }),
    ).toEqual(['preset']);
  });
});

describe('AttendanceMissersQueryDto', () => {
  it('needs the row key', async () => {
    expect(
      await props(AttendanceMissersQueryDto, {
        ...RANGE,
        cut: 'group',
        key: 'g1',
      }),
    ).toEqual([]);
    expect(await props(AttendanceMissersQueryDto, RANGE)).toEqual(['key']);
    expect(
      await props(AttendanceMissersQueryDto, { ...RANGE, key: '' }),
    ).toEqual(['key']);
  });
});
