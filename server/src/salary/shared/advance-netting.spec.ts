import {
  planAdvanceNetting,
  planShownAdvances,
  PendingAdvance,
} from './advance-netting';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const adv = (
  id: string,
  amount: number,
  date: string,
  created: string,
): PendingAdvance => ({
  id,
  amount,
  date: d(date),
  createdAt: new Date(created),
});
const OCT_1 = d('2026-10-01');

describe('planAdvanceNetting', () => {
  it('nets advances dated before the period end, oldest createdAt first', () => {
    const plan = planAdvanceNetting(
      [
        adv('b', 500_000, '2026-09-20', '2026-09-20T10:00:00Z'),
        adv('a', 1_000_000, '2026-09-05', '2026-09-05T10:00:00Z'),
      ],
      9_840_000,
      OCT_1,
    );
    expect(plan).toEqual({ settle: ['a', 'b'], total: 1_500_000 });
  });

  it('leaves an advance dated on or after the period end for its own month', () => {
    const plan = planAdvanceNetting(
      [
        adv('sep', 1_000_000, '2026-09-30', '2026-09-30T08:00:00Z'),
        adv('oct', 300_000, '2026-10-01', '2026-09-30T20:00:00Z'),
      ],
      9_840_000,
      OCT_1,
    );
    expect(plan).toEqual({ settle: ['sep'], total: 1_000_000 });
  });

  it('stops at the first advance that does not fit (the rest roll over)', () => {
    const plan = planAdvanceNetting(
      [
        adv('a', 2_000_000, '2026-09-01', '2026-09-01T00:00:00Z'),
        adv('b', 2_000_000, '2026-09-02', '2026-09-02T00:00:00Z'),
        adv('c', 100_000, '2026-09-03', '2026-09-03T00:00:00Z'),
      ],
      3_000_000,
      OCT_1,
    );
    expect(plan).toEqual({ settle: ['a'], total: 2_000_000 });
  });

  it('breaks createdAt ties by id so the walk is stable', () => {
    const plan = planAdvanceNetting(
      [
        adv('z', 100, '2026-09-01', '2026-09-01T00:00:00Z'),
        adv('m', 100, '2026-09-01', '2026-09-01T00:00:00Z'),
      ],
      150,
      OCT_1,
    );
    expect(plan.settle).toEqual(['m']);
  });

  it('returns nothing for no advances or a 0 gross', () => {
    expect(planAdvanceNetting([], 5_000_000, OCT_1)).toEqual({
      settle: [],
      total: 0,
    });
    expect(
      planAdvanceNetting(
        [adv('a', 1, '2026-09-01', '2026-09-01T00:00:00Z')],
        0,
        OCT_1,
      ),
    ).toEqual({ settle: [], total: 0 });
  });
});

describe('planShownAdvances', () => {
  const pending = [
    adv('a', 1_000_000, '2026-09-10', '2026-09-10T10:00:00Z'),
    adv('oct', 300_000, '2026-10-01', '2026-10-01T10:00:00Z'),
  ];

  const open = { isOpenMonth: true, canStillEarn: true };
  const past = { isOpenMonth: false, canStillEarn: true };

  it('the open month shows every advance dated in it, even above the partial base', () => {
    expect(planShownAdvances(pending, 600_000, OCT_1, open)).toEqual({
      settle: ['a'],
      total: 1_000_000,
    });
  });

  it('a past month without a payment shows only what the cron will net', () => {
    expect(planShownAdvances(pending, 600_000, OCT_1, past)).toEqual({
      settle: [],
      total: 0,
    });
    expect(planShownAdvances(pending, 1_000_000, OCT_1, past)).toEqual({
      settle: ['a'],
      total: 1_000_000,
    });
  });

  it('the open month for someone who can no longer earn follows the past-month rule', () => {
    const gone = { isOpenMonth: true, canStillEarn: false };
    expect(planShownAdvances(pending, 0, OCT_1, gone)).toEqual({
      settle: [],
      total: 0,
    });
    expect(planShownAdvances(pending, 1_000_000, OCT_1, gone)).toEqual({
      settle: ['a'],
      total: 1_000_000,
    });
  });
});
