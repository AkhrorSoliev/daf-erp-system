import { BadRequestException } from '@nestjs/common';
import { assertManualDueAt, defaultDueAt, shiftSystemDueAt } from './task-due';

const at = (iso: string) => new Date(iso);

describe('task-due', () => {
  it('defaultDueAt is 18:00 Tashkent (13:00Z)', () => {
    expect(defaultDueAt('2026-10-08').toISOString()).toBe(
      '2026-10-08T13:00:00.000Z',
    );
  });
  it('accepts a weekday 08:00–22:00', () => {
    expect(() =>
      assertManualDueAt(at('2026-10-08T03:00:00Z'), new Set()),
    ).not.toThrow(); // 08:00
    expect(() =>
      assertManualDueAt(at('2026-10-08T17:00:00Z'), new Set()),
    ).not.toThrow(); // 22:00
  });
  it('refuses outside hours', () => {
    expect(() =>
      assertManualDueAt(at('2026-10-08T02:59:00Z'), new Set()),
    ).toThrow(BadRequestException);
    expect(() =>
      assertManualDueAt(at('2026-10-08T17:01:00Z'), new Set()),
    ).toThrow(BadRequestException);
  });
  it('refuses Sunday and a holiday', () => {
    expect(() =>
      assertManualDueAt(at('2026-10-11T08:00:00Z'), new Set()),
    ).toThrow(/yakshanba/);
    expect(() =>
      assertManualDueAt(at('2026-10-08T08:00:00Z'), new Set(['2026-10-08'])),
    ).toThrow(/bayram/);
  });
  it('shiftSystemDueAt moves a Sunday/holiday due to the next working day, same time', () => {
    expect(
      shiftSystemDueAt(at('2026-10-11T13:00:00Z'), new Set()).toISOString(),
    ).toBe('2026-10-12T13:00:00.000Z');
    expect(
      shiftSystemDueAt(
        at('2026-10-10T13:00:00Z'),
        new Set(['2026-10-10']),
      ).toISOString(),
    ).toBe('2026-10-12T13:00:00.000Z');
    expect(
      shiftSystemDueAt(at('2026-10-08T13:00:00Z'), new Set()).toISOString(),
    ).toBe('2026-10-08T13:00:00.000Z');
  });
});
