import {
  assembleOverview,
  recentResultUserIds,
  monthsFrom,
  type LogFact,
  type OverviewFacts,
  type ResultFact,
} from './kpi-overview.math';
import { workingDaysOfMonth } from './kpi-signals';

const at = (day: string, hhmm = '10:00') => new Date(`${day}T${hhmm}:00+05:00`);
const r = (
  userId: number,
  type: 'LEAD_PAID' | 'PROMISE_KEPT',
  amount: number,
  day: string,
  status: 'ACTIVE' | 'CANCELLED' = 'ACTIVE',
): ResultFact => ({
  userId,
  type,
  status,
  amount,
  occurredAt: at(day),
  month: day.slice(0, 7),
});
const log = (userId: number, leadId: string, day: string): LogFact => ({
  userId,
  leadId,
  at: at(day),
});

function facts(over: Partial<OverviewFacts> = {}): OverviewFacts {
  return {
    month: '2026-10',
    compare: '2026-09',
    today: '2026-10-14',
    monthResults: [
      r(11, 'LEAD_PAID', 50_000, '2026-10-02'),
      r(11, 'PROMISE_KEPT', 20_000, '2026-10-10'),
      r(11, 'LEAD_PAID', 50_000, '2026-10-05', 'CANCELLED'),
      r(12, 'LEAD_PAID', 30_000, '2026-10-14'),
    ],
    compareResults: [
      r(11, 'LEAD_PAID', 50_000, '2026-09-03'),
      r(11, 'LEAD_PAID', 50_000, '2026-09-20'),
      r(12, 'PROMISE_KEPT', 20_000, '2026-09-14'),
    ],
    series: [
      r(11, 'LEAD_PAID', 50_000, '2026-10-02'),
      r(11, 'PROMISE_KEPT', 20_000, '2026-10-10'),
      r(12, 'LEAD_PAID', 30_000, '2026-10-14'),
    ],
    recentUserIds: new Set([12]),
    held: new Map([
      [11, 4],
      [13, 3],
      [14, 2],
    ]),
    received: [
      log(11, 'L1', '2026-10-01'),
      log(11, 'L2', '2026-10-03'),
      log(11, 'L2', '2026-10-09'),
      log(12, 'L3', '2026-10-04'),
    ],
    compareReceived: [log(11, 'L9', '2026-09-02'), log(11, 'L8', '2026-09-25')],
    paidLeads: [
      { userId: 11, leadId: 'L1' },
      { userId: 11, leadId: 'L8' },
    ],
    expired: [
      log(13, 'E1', '2026-10-01'),
      log(13, 'E2', '2026-10-02'),
      log(13, 'E3', '2026-10-03'),
    ],
    compareExpired: [log(13, 'E9', '2026-09-01'), log(13, 'E8', '2026-09-28')],
    promises: [
      { userId: 11, status: 'KEPT' },
      { userId: 11, status: 'BROKEN' },
    ],
    names: new Map([
      [11, 'Nodira R'],
      [12, 'Farangiz N'],
      [13, 'Bobur K'],
      [14, 'Dilnoza S'],
    ]),
    eligibleUsers: new Set([11, 13]),
    workingDays: workingDaysOfMonth('2026-10', () => false),
    compareRecorded: true,
    recordingSinceDay: '2026-10-01',
    ...over,
  };
}

describe('assembleOverview — the current month', () => {
  it('compares the cards with the compare month up to the same day', () => {
    expect(assembleOverview(facts()).cards).toEqual({
      results: { value: 3, compare: 2 },
      amount: { value: 100_000, compare: 70_000 },
      leadToPaid: { value: 33, compare: 0 },
      forecast: 7,
    });
  });

  it('lists every person with a result and every administrator holding leads, richest first', () => {
    expect(assembleOverview(facts()).rows).toEqual([
      {
        userId: 11,
        name: 'Nodira R',
        leadPaid: { count: 1, amount: 50_000, compare: 1 },
        promiseKept: { count: 1, amount: 20_000, compare: 0 },
        leadToPaid: { paid: 1, received: 2, pct: 50 },
        promiseRate: { kept: 1, closed: 2, pct: 50 },
        expired: { count: 0, compare: 0 },
        held: 4,
        total: 70_000,
      },
      {
        userId: 12,
        name: 'Farangiz N',
        leadPaid: { count: 1, amount: 30_000, compare: 0 },
        promiseKept: { count: 0, amount: 0, compare: 1 },
        leadToPaid: { paid: 0, received: 1, pct: 0 },
        promiseRate: { kept: 0, closed: 0, pct: null },
        expired: { count: 0, compare: 0 },
        held: 0,
        total: 30_000,
      },
      {
        userId: 13,
        name: 'Bobur K',
        leadPaid: { count: 0, amount: 0, compare: 0 },
        promiseKept: { count: 0, amount: 0, compare: 0 },
        leadToPaid: { paid: 0, received: 0, pct: null },
        promiseRate: { kept: 0, closed: 0, pct: null },
        expired: { count: 3, compare: 1 },
        held: 3,
        total: 0,
      },
    ]);
  });

  it('draws the month up to today and the whole compare month, day by day', () => {
    const daily = assembleOverview(facts()).daily;
    expect(daily).toHaveLength(31);
    expect(daily[0]).toEqual({ day: 1, current: 0, compare: 0 });
    expect(daily[1]).toEqual({ day: 2, current: 1, compare: 0 });
    expect(daily[13]).toEqual({ day: 14, current: 3, compare: 2 });
    expect(daily[14]).toEqual({ day: 15, current: null, compare: 2 });
    expect(daily[29]).toEqual({ day: 30, current: null, compare: 3 });
    expect(daily[30]).toEqual({ day: 31, current: null, compare: null });
  });

  it('stacks the months from 2026-10', () => {
    expect(assembleOverview(facts()).months).toEqual([
      { month: '2026-10', leadPaid: 2, promiseKept: 1, amount: 100_000 },
    ]);
  });

  it('raises the signals of the rows', () => {
    expect(
      assembleOverview(facts()).signals.map((s) => [s.kind, s.userId]),
    ).toEqual([
      ['SILENT', 11],
      ['SILENT', 13],
      ['EXPIRED', 13],
    ]);
  });
});

describe('assembleOverview — a past month', () => {
  const pastFacts = facts({ today: null, workingDays: null });

  it('compares whole months and forecasts nothing', () => {
    const out = assembleOverview(pastFacts);
    expect(out.cards).toEqual({
      results: { value: 3, compare: 3 },
      amount: { value: 100_000, compare: 120_000 },
      leadToPaid: { value: 33, compare: 50 },
      forecast: null,
    });
    expect(out.daily[30]).toEqual({ day: 31, current: 3, compare: null });
    expect(out.signals.map((s) => [s.kind, s.userId])).toEqual([
      ['EXPIRED', 13],
    ]);
  });
});

describe('monthsFrom', () => {
  it('gives the last six months, none before 2026-10', () => {
    expect(monthsFrom('2026-10')).toEqual(['2026-10']);
    expect(monthsFrom('2027-03')).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
    ]);
    expect(monthsFrom('2027-05')).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
    ]);
  });
});

describe("recentResultUserIds — the «Jim» rule's 7-day window", () => {
  // today = 2026-10-14: «the last 7 days» are the 7 Tashkent days 08.10 … 14.10.
  const today = '2026-10-14';
  const ids = (...results: ResultFact[]) => [
    ...recentResultUserIds(results, today),
  ];

  it('counts a result 6 days ago and not one exactly 7 days ago', () => {
    expect(ids(r(1, 'LEAD_PAID', 1, '2026-10-08'))).toEqual([1]);
    expect(ids(r(1, 'LEAD_PAID', 1, '2026-10-07'))).toEqual([]);
    expect(ids(r(1, 'LEAD_PAID', 1, '2026-10-06'))).toEqual([]);
  });

  it('reads the day on the Tashkent clock, not UTC', () => {
    // 00:10 Tashkent on 08.10 is still 07.10 in UTC
    const early = {
      ...r(1, 'LEAD_PAID', 1, '2026-10-08'),
      occurredAt: at('2026-10-08', '00:10'),
    };
    expect(ids(early)).toEqual([1]);
    // 23:50 Tashkent on 07.10 is 18:50 UTC, the same date
    const late = {
      ...r(1, 'LEAD_PAID', 1, '2026-10-07'),
      occurredAt: at('2026-10-07', '23:50'),
    };
    expect(ids(late)).toEqual([]);
  });

  it('ignores a cancelled result', () => {
    expect(ids(r(1, 'LEAD_PAID', 1, '2026-10-12', 'CANCELLED'))).toEqual([]);
  });

  it('decides the SILENT signal through assembleOverview', () => {
    const silentIds = (day: string) =>
      assembleOverview(
        facts({
          recentUserIds: recentResultUserIds(
            [r(11, 'LEAD_PAID', 50_000, day)],
            today,
          ),
        }),
      )
        .signals.filter((s) => s.kind === 'SILENT')
        .map((s) => s.userId);
    expect(silentIds('2026-10-08')).toEqual([13]);
    expect(silentIds('2026-10-07')).toEqual([11, 13]);
  });
});

describe('assembleOverview — the compare month window of rule 3', () => {
  const expiredText = (over: Partial<OverviewFacts>) =>
    assembleOverview(facts(over)).signals.find((s) => s.kind === 'EXPIRED')
      ?.text;

  it('in the current month counts the compare month up to the same day only', () => {
    // E8 (28.09) lies after today's 14th, so only E9 (01.09) counts
    expect(expiredText({})).toContain('taqqoslanayotgan oyda 1 ta');
  });

  it('in a past month counts the whole compare month', () => {
    expect(expiredText({ today: null, workingDays: null })).toContain(
      'taqqoslanayotgan oyda 2 ta',
    );
  });
});

describe('assembleOverview — an administrator whose leads all expired', () => {
  // 13 holds nothing now and has no result; 15 lost leads too but is no administrator.
  const out = assembleOverview(
    facts({
      held: new Map([[11, 4]]),
      expired: [
        log(13, 'E1', '2026-10-01'),
        log(13, 'E2', '2026-10-02'),
        log(13, 'E3', '2026-10-03'),
        log(15, 'E4', '2026-10-03'),
      ],
      received: [
        log(11, 'L1', '2026-10-01'),
        log(13, 'E1', '2026-10-01'),
        log(16, 'L5', '2026-10-02'),
      ],
      eligibleUsers: new Set([11, 13, 16]),
    }),
  );

  it('still gets a row, and so does an administrator who only took a lead', () => {
    expect(out.rows.map((r) => r.userId)).toEqual([11, 12, 16, 13]);
    expect(out.rows.find((r) => r.userId === 13)).toEqual(
      expect.objectContaining({
        held: 0,
        expired: { count: 3, compare: 1 },
        leadToPaid: { paid: 0, received: 1, pct: 0 },
      }),
    );
  });

  it('and rule 3 fires for them', () => {
    expect(
      out.signals.filter((s) => s.kind === 'EXPIRED').map((s) => s.userId),
    ).toEqual([13]);
  });
});

describe('assembleOverview — forecast after the switch came back on', () => {
  it('projects only the results written since, the earlier ones counted as they are', () => {
    // 30 results on 1–10, off 11–19, on from 20; today 22.10.
    const early = Array.from({ length: 30 }, (_, i) =>
      r(11, 'LEAD_PAID', 1, `2026-10-${String((i % 10) + 1).padStart(2, '0')}`),
    );
    const late = ['2026-10-20', '2026-10-21', '2026-10-22'].map((d) =>
      r(11, 'LEAD_PAID', 1, d),
    );
    const out = assembleOverview(
      facts({
        today: '2026-10-22',
        monthResults: [...early, ...late],
        recordingSinceDay: '2026-10-20',
      }),
    );
    // Working days from 20.10: 20–24, 26–31 = 11; 3 of them passed; 30 + 3 × 11 / 3.
    expect(out.cards.forecast).toBe(41);
  });
});
