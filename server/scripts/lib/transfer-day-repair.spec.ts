import { planRepair, RepairCharge } from './transfer-day-repair';

const charge = (over: Partial<RepairCharge>): RepairCharge => ({
  id: 'c1',
  enrollmentId: 'e1',
  enrollmentCreatedAt: new Date('2026-10-01T00:00:00Z'),
  studentId: 10001,
  groupId: 'g1',
  groupName: '#005',
  branchId: 1,
  periodYear: 2026,
  periodMonth: 10,
  coveredDates: ['2026-10-26', '2026-10-28'],
  frozenOutDates: [],
  perLessonCost: 34_615,
  discountPercent: 0,
  chargedAmount: 69_230,
  ...over,
});

const OLD = charge({});
const NEW = charge({
  id: 'c2',
  enrollmentId: 'e2',
  enrollmentCreatedAt: new Date('2026-10-28T00:00:00Z'),
  groupId: 'g2',
  groupName: '#045',
  coveredDates: ['2026-10-28', '2026-10-30'],
  chargedAmount: 69_230,
});
const att = (...rows: [string, string[]][]) =>
  new Map(rows.map(([k, v]) => [k, new Set(v)]));

describe('planRepair (ADR-0137)', () => {
  it('with no attendance the group he was in first keeps the day', () => {
    const { drops, ambiguous } = planRepair([OLD, NEW], att());
    expect(ambiguous).toEqual([]);
    expect(drops).toEqual([
      expect.objectContaining({
        chargeId: 'c2',
        day: '2026-10-28',
        amount: 34_615,
        keptIn: '#005',
        keptBecause: 'first',
      }),
    ]);
  });

  it('the group that holds the attendance keeps the day', () => {
    const { drops } = planRepair([OLD, NEW], att(['10001|2026-10-28', ['g2']]));
    expect(drops).toEqual([
      expect.objectContaining({
        chargeId: 'c1',
        keptIn: '#045',
        keptBecause: 'attendance',
      }),
    ]);
  });

  it('leaves a day that two groups both have attendance for', () => {
    const { drops, ambiguous } = planRepair(
      [OLD, NEW],
      att(['10001|2026-10-28', ['g1', 'g2']]),
    );
    expect(drops).toEqual([]);
    expect(ambiguous).toEqual([
      { studentId: 10001, day: '2026-10-28', groups: ['#005', '#045'] },
    ]);
  });

  it('with --both-attendance-first the group he was in first keeps the day', () => {
    const { drops, ambiguous } = planRepair(
      [OLD, NEW],
      att(['10001|2026-10-28', ['g1', 'g2']]),
      true,
    );
    expect(ambiguous).toEqual([]);
    expect(drops).toEqual([
      expect.objectContaining({
        chargeId: 'c2',
        keptIn: '#005',
        keptBecause: 'first',
      }),
    ]);
  });

  it('takes a day billed in three groups out of the two later ones', () => {
    const third = charge({
      id: 'c3',
      enrollmentId: 'e3',
      enrollmentCreatedAt: new Date('2026-10-28T00:01:00Z'),
      groupId: 'g3',
      groupName: '#083',
      coveredDates: ['2026-10-28'],
      chargedAmount: 34_615,
    });
    const { drops } = planRepair([OLD, NEW, third], att());
    expect(drops.map((d) => d.chargeId).sort()).toEqual(['c2', 'c3']);
  });

  it('ignores a day the other charge already returned', () => {
    const { drops } = planRepair(
      [charge({ frozenOutDates: ['2026-10-28'] }), NEW],
      att(),
    );
    expect(drops).toEqual([]);
  });

  it('a second run after the repair finds nothing', () => {
    const after = charge({
      id: 'c2',
      groupId: 'g2',
      groupName: '#045',
      coveredDates: ['2026-10-28', '2026-10-30'],
      frozenOutDates: ['2026-10-28'],
      chargedAmount: 34_615,
    });
    expect(planRepair([OLD, after], att()).drops).toEqual([]);
  });
});
