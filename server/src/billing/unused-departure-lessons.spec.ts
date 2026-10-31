import { unusedDepartureLessons } from './unused-departure-lessons';

function db(opts: {
  enrollments: any[];
  heldRows: { groupId: string; date: string }[];
  rows: { groupId: string; date: string }[];
}) {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  return {
    enrollment: {
      findMany: jest.fn().mockResolvedValue(opts.enrollments),
    },
    attendance: {
      groupBy: jest
        .fn()
        .mockResolvedValue(
          opts.heldRows.map((r) => ({ groupId: r.groupId, date: d(r.date) })),
        ),
      findMany: jest
        .fn()
        .mockResolvedValue(
          opts.rows.map((r) => ({ groupId: r.groupId, date: d(r.date) })),
        ),
    },
  } as never;
}

const base = {
  id: 'enr-1',
  groupId: 'grp-1',
  statusChangedAt: new Date('2026-10-31T08:58:00.000Z'),
  group: { name: '#054' },
  monthlyCharges: [
    {
      coveredDates: ['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09'],
      frozenOutDates: [],
      perLessonCost: 34_615,
      discountPercent: 0,
    },
  ],
};

describe('unusedDepartureLessons', () => {
  it('returns held days with no row, priced, excluding the attended one', async () => {
    const client = db({
      enrollments: [base],
      heldRows: [
        { groupId: 'grp-1', date: '2026-10-02' },
        { groupId: 'grp-1', date: '2026-10-05' },
        { groupId: 'grp-1', date: '2026-10-07' },
        { groupId: 'grp-1', date: '2026-10-09' },
      ],
      rows: [{ groupId: 'grp-1', date: '2026-10-02' }],
    });
    const result = await unusedDepartureLessons(client, 10882);
    expect(result).toEqual([
      {
        enrollmentId: 'enr-1',
        groupId: 'grp-1',
        groupName: '#054',
        date: '2026-10-05',
        amount: 34_615,
      },
      {
        enrollmentId: 'enr-1',
        groupId: 'grp-1',
        groupName: '#054',
        date: '2026-10-07',
        amount: 34_615,
      },
      {
        enrollmentId: 'enr-1',
        groupId: 'grp-1',
        groupName: '#054',
        date: '2026-10-09',
        amount: 34_615,
      },
    ]);
  });

  it('excludes a day a late payment already marked «Keldi» (ADR-0143)', async () => {
    const client = db({
      enrollments: [base],
      heldRows: [
        { groupId: 'grp-1', date: '2026-10-02' },
        { groupId: 'grp-1', date: '2026-10-05' },
      ],
      // 05.10 has a row now (paid later) — not unused any more.
      rows: [
        { groupId: 'grp-1', date: '2026-10-02' },
        { groupId: 'grp-1', date: '2026-10-05' },
      ],
    });
    const result = await unusedDepartureLessons(client, 10882);
    expect(result).toEqual([]);
  });

  it('excludes a day after the departure day', async () => {
    const client = db({
      enrollments: [
        { ...base, statusChangedAt: new Date('2026-10-06T08:00:00.000Z') },
      ],
      heldRows: [
        { groupId: 'grp-1', date: '2026-10-05' },
        { groupId: 'grp-1', date: '2026-10-07' },
      ],
      rows: [],
    });
    const result = await unusedDepartureLessons(client, 10882);
    expect(result.map((r) => r.date)).toEqual(['2026-10-05']);
  });

  it('applies the discount to the price', async () => {
    const client = db({
      enrollments: [
        {
          ...base,
          monthlyCharges: [{ ...base.monthlyCharges[0], discountPercent: 20 }],
        },
      ],
      heldRows: [{ groupId: 'grp-1', date: '2026-10-05' }],
      rows: [],
    });
    const result = await unusedDepartureLessons(client, 10882);
    expect(result[0].amount).toBe(27_692); // round(34615 * 0.8)
  });

  it('returns nothing for a student with no DROPPED enrollment', async () => {
    const client = db({ enrollments: [], heldRows: [], rows: [] });
    expect(await unusedDepartureLessons(client, 10882)).toEqual([]);
  });
});
