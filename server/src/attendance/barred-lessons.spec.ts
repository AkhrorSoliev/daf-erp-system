import {
  barredLessonDays,
  barredStreak,
  effectiveBarredFlags,
  type BarredFlags,
} from './barred-lessons';

const base = {
  coveredDates: ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'],
  frozenOutDates: [] as string[],
  heldDays: new Set(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12']),
  markedDays: new Set(['2026-10-05']),
  from: '2026-10-01',
  to: '2026-10-30',
  includeFrozenOut: false,
};

describe('barredLessonDays', () => {
  it('returns held, covered days without a row', () => {
    expect(barredLessonDays(base)).toEqual([
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
    ]);
  });

  it('skips frozen-out days unless asked', () => {
    const input = { ...base, frozenOutDates: ['2026-10-09'] };
    expect(barredLessonDays(input)).toEqual(['2026-10-07', '2026-10-12']);
    expect(barredLessonDays({ ...input, includeFrozenOut: true })).toEqual([
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
    ]);
  });

  it('skips days the teacher did not hold', () => {
    const input = { ...base, heldDays: new Set(['2026-10-05', '2026-10-12']) };
    expect(barredLessonDays(input)).toEqual(['2026-10-12']);
  });

  it('keeps the window [from, to)', () => {
    const input = { ...base, from: '2026-10-08', to: '2026-10-12' };
    expect(barredLessonDays(input)).toEqual(['2026-10-09']);
  });
});

describe('barredStreak', () => {
  const held = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'];

  it('counts barred days from the latest lesson back', () => {
    const rows = new Map<string, 'MARKED' | 'ABSENT'>([
      ['2026-10-05', 'MARKED'],
    ]);
    const barred = new Set(['2026-10-07', '2026-10-09', '2026-10-12']);
    expect(barredStreak(held, rows, barred)).toBe(3);
  });

  it('counts ABSENT rows together with barred days', () => {
    const rows = new Map<string, 'MARKED' | 'ABSENT'>([
      ['2026-10-05', 'MARKED'],
      ['2026-10-07', 'ABSENT'],
    ]);
    const barred = new Set(['2026-10-09', '2026-10-12']);
    expect(barredStreak(held, rows, barred)).toBe(3);
  });

  it('stops at a marked (came / late / excused) day', () => {
    const rows = new Map<string, 'MARKED' | 'ABSENT'>([
      ['2026-10-09', 'MARKED'],
    ]);
    const barred = new Set(['2026-10-05', '2026-10-07', '2026-10-12']);
    expect(barredStreak(held, rows, barred)).toBe(1);
  });

  it('is 0 when the latest lesson is marked', () => {
    const rows = new Map<string, 'MARKED' | 'ABSENT'>([
      ['2026-10-12', 'MARKED'],
    ]);
    expect(barredStreak(held, rows, new Set(['2026-10-09']))).toBe(0);
  });
});

describe('effectiveBarredFlags', () => {
  const all: BarredFlags = {
    mark: true,
    nudge: true,
    warn: true,
    autoPause: true,
    pauseNotice: true,
    restoreDialog: true,
    logOnly: false,
  };

  it('keeps everything when the requirements hold', () => {
    expect(effectiveBarredFlags(all)).toEqual(all);
  });

  it('turns the dependents off when mark is off', () => {
    expect(effectiveBarredFlags({ ...all, mark: false })).toEqual({
      mark: false,
      nudge: false,
      warn: false,
      autoPause: false,
      pauseNotice: false,
      restoreDialog: false,
      logOnly: false,
    });
  });

  it('turns the pause notice off without auto-pause, nothing else', () => {
    const out = effectiveBarredFlags({ ...all, autoPause: false });
    expect(out.pauseNotice).toBe(false);
    expect(out.nudge).toBe(true);
    expect(out.restoreDialog).toBe(true);
  });

  it('log-only stands on its own', () => {
    expect(
      effectiveBarredFlags({ ...all, mark: false, logOnly: true }).logOnly,
    ).toBe(true);
  });
});
