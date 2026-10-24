import { BadRequestException } from '@nestjs/common';
import {
  classifyGateRow,
  cohortFigures,
  parseGateMonth,
  waitingNow,
  withBlocked,
  type GateRowTimes,
} from './gate-cohort';

const at = (day: number) => new Date(Date.UTC(2026, 8, day, 10, 0, 0));
const row = (over: Partial<GateRowTimes> = {}): GateRowTimes => ({
  blockedAt: at(10),
  joinedAt: null,
  leftAt: null,
  ...over,
});

describe('parseGateMonth', () => {
  // 30.09 20:00 UTC is 01.10 01:00 in Tashkent: the month has already turned.
  const now = new Date('2026-09-30T20:00:00Z');

  it('an empty month is the current Tashkent month', () => {
    expect(parseGateMonth(undefined, now)).toBe('2026-10');
    expect(parseGateMonth('', now)).toBe('2026-10');
  });

  it('accepts the floor and the current month', () => {
    expect(parseGateMonth('2026-05', now)).toBe('2026-05');
    expect(parseGateMonth('2026-10', now)).toBe('2026-10');
  });

  it('refuses an unreadable month', () => {
    expect(() => parseGateMonth('salom', now)).toThrow(BadRequestException);
    expect(() => parseGateMonth('2026-13', now)).toThrow(
      "Oy YYYY-MM ko'rinishida bo'lishi kerak",
    );
  });

  it('refuses a month before the reporting base', () => {
    expect(() => parseGateMonth('2026-04', now)).toThrow(
      'Bot hisoboti may 2026 dan boshlanadi',
    );
  });

  it('refuses a future month', () => {
    expect(() => parseGateMonth('2026-11', now)).toThrow(
      "Kelajak oyni tanlab bo'lmaydi",
    );
  });
});

describe('classifyGateRow', () => {
  it('never joined → waiting', () => {
    expect(classifyGateRow(row())).toBe('waiting');
  });

  it('joined after the block and still a member → joined', () => {
    expect(classifyGateRow(row({ joinedAt: at(12) }))).toBe('joined');
  });

  it('joined after the block and left later → left', () => {
    expect(classifyGateRow(row({ joinedAt: at(12), leftAt: at(20) }))).toBe(
      'left',
    );
  });

  it('a member before the block who left, then was blocked → waiting', () => {
    expect(classifyGateRow(row({ joinedAt: at(2), leftAt: at(5) }))).toBe(
      'waiting',
    );
  });

  it('a member before the block who left, was blocked and came back → joined', () => {
    // recordJoined keeps the first joinedAt and only clears leftAt.
    expect(classifyGateRow(row({ joinedAt: at(2), leftAt: null }))).toBe(
      'joined',
    );
  });

  it('joining at the very instant of the block counts as after it', () => {
    expect(classifyGateRow(row({ joinedAt: at(10), leftAt: at(11) }))).toBe(
      'left',
    );
  });
});

describe('cohortFigures', () => {
  it('an empty cohort is all zeros and 0%', () => {
    expect(cohortFigures([])).toEqual({
      blocked: 0,
      joined: 0,
      left: 0,
      conversionRate: 0,
    });
  });

  it('counts stopped, joined (left ones too) and left', () => {
    const rows = [
      row(), // waiting
      row({ joinedAt: at(12) }), // joined
      row({ joinedAt: at(12), leftAt: at(20) }), // left
    ];
    expect(cohortFigures(rows)).toEqual({
      blocked: 3,
      joined: 2,
      left: 1,
      conversionRate: 67,
    });
  });

  it('never exceeds 100% and joined never exceeds blocked, for every shape of row', () => {
    const joinedOptions = [null, at(2), at(12)];
    const leftOptions = [null, at(5), at(20)];
    const rows: GateRowTimes[] = [];
    for (const joinedAt of joinedOptions) {
      for (const leftAt of leftOptions) rows.push(row({ joinedAt, leftAt }));
    }
    for (let n = 1; n <= rows.length; n++) {
      const f = cohortFigures(rows.slice(0, n));
      expect(f.joined).toBeLessThanOrEqual(f.blocked);
      expect(f.left).toBeLessThanOrEqual(f.joined);
      expect(f.conversionRate).toBeLessThanOrEqual(100);
    }
  });
});

describe('waitingNow', () => {
  it('counts the rows still outside the channel', () => {
    const rows = [
      row(),
      row({ joinedAt: at(12) }),
      row({ joinedAt: at(2), leftAt: at(5) }),
    ];
    expect(waitingNow(rows)).toBe(2);
  });
});

describe('withBlocked', () => {
  it('drops rows the gate never stopped and narrows the type', () => {
    const kept = withBlocked([
      { blockedAt: null, joinedAt: at(3), leftAt: null },
      { blockedAt: at(4), joinedAt: null, leftAt: null },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].blockedAt).toEqual(at(4));
  });
});
