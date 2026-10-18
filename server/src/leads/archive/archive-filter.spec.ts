import { BadRequestException } from '@nestjs/common';
import {
  archivedLeadFilter,
  archivedSectionFilter,
  assertArchiveDays,
  phoneNeedle,
  searchTokens,
} from './archive-filter';

describe('searchTokens', () => {
  it('trims, splits on spaces and keeps at most 5 words', () => {
    expect(searchTokens('  aziz   karimov ')).toEqual(['aziz', 'karimov']);
    expect(searchTokens('a b c d e f g')).toHaveLength(5);
  });
  it('cuts the input at 100 characters', () => {
    expect(searchTokens('x'.repeat(300))[0]).toHaveLength(100);
  });
  it('returns nothing for empty input', () => {
    expect(searchTokens(undefined)).toEqual([]);
    expect(searchTokens('   ')).toEqual([]);
  });
});

describe('phoneNeedle', () => {
  it('ignores words that are not phone-like', () => {
    expect(phoneNeedle('aziz')).toBeNull();
    expect(phoneNeedle('90')).toBeNull();
  });
  it('keeps digits and strips +998 down to the 9 stored digits', () => {
    expect(phoneNeedle('901234')).toBe('901234');
    expect(phoneNeedle('+998901234567')).toBe('901234567');
    expect(phoneNeedle('998901234567')).toBe('901234567');
  });
});

describe('assertArchiveDays', () => {
  it('accepts real days and missing days', () => {
    expect(() =>
      assertArchiveDays({ startDate: '2026-10-01', endDate: '2026-10-31' }),
    ).not.toThrow();
    expect(() => assertArchiveDays({})).not.toThrow();
  });
  it('rejects a day the calendar does not have', () => {
    expect(() => assertArchiveDays({ startDate: '2026-02-31' })).toThrow(
      BadRequestException,
    );
  });
});

describe('archivedLeadFilter', () => {
  it('always asks for archived rows', () => {
    expect(archivedLeadFilter({}).deletedAt).toEqual({ not: null });
  });

  it('turns Toshkent days into an exclusive UTC range', () => {
    expect(
      archivedLeadFilter({ startDate: '2026-10-01', endDate: '2026-10-02' })
        .deletedAt,
    ).toEqual({
      not: null,
      gte: new Date('2026-09-30T19:00:00.000Z'),
      lt: new Date('2026-10-02T19:00:00.000Z'),
    });
  });

  it('filters by who archived', () => {
    expect(archivedLeadFilter({ deletedById: [5, 9] }).deletedById).toEqual({
      in: [5, 9],
    });
  });

  it('ANDs the words; a phone-like word also tries both phone columns', () => {
    const where = archivedLeadFilter({ search: 'aziz 90123' });
    const and = where.AND as any[];
    expect(and).toHaveLength(2);
    expect(and[0].OR).toHaveLength(3); // firstName, lastName, lostReason
    expect(and[1].OR).toHaveLength(5); // + phone, extraPhone
    expect(and[1].OR).toContainEqual({ phone: { contains: '90123' } });
    expect(and[1].OR).toContainEqual({ extraPhone: { contains: '90123' } });
  });
});

describe('archivedSectionFilter', () => {
  it('matches every word against the name', () => {
    const where = archivedSectionFilter({ search: 'eski reklama' });
    expect(where.AND).toEqual([
      { name: { contains: 'eski', mode: 'insensitive' } },
      { name: { contains: 'reklama', mode: 'insensitive' } },
    ]);
    expect(where.deletedAt).toEqual({ not: null });
  });
});
