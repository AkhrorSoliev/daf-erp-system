import {
  missingRecurringExpenses,
  monthStatus,
  recurringKeyOf,
  remainingChargedLessons,
  topWithRest,
  unpaidLeftLessons,
} from './profit-composition';

describe('monthStatus', () => {
  // 26.09.2026 20:00 Tashkent = 15:00 UTC.
  const now = new Date('2026-09-26T15:00:00Z');

  it('reads a running month day by day in Tashkent', () => {
    expect(monthStatus('2026-09', now)).toEqual({
      isOpen: true,
      daysPassed: 26,
      daysInMonth: 30,
      todayStr: '2026-09-26',
    });
  });

  it('closes a past month', () => {
    const s = monthStatus('2026-08', now);
    expect(s.isOpen).toBe(false);
    expect(s.daysPassed).toBe(31);
  });

  it('rolls into the next month at Tashkent midnight, not UTC', () => {
    // 30.09 19:30 UTC is already 01.10 00:30 in Tashkent.
    const s = monthStatus('2026-09', new Date('2026-09-30T19:30:00Z'));
    expect(s.isOpen).toBe(false);
  });
});

describe('recurringKeyOf', () => {
  it('reads the three recurring categories', () => {
    expect(recurringKeyOf({ category: 'RENT', description: 'Ijara' })).toBe(
      'RENT',
    );
    expect(recurringKeyOf({ category: 'UTILITIES', description: 'Svet' })).toBe(
      'UTILITIES',
    );
    expect(recurringKeyOf({ category: 'TAXES', description: '' })).toBe(
      'TAXES',
    );
  });

  // The centre records tax under «Boshqa» («Soliqlar», July and August 2026).
  it('recognises tax recorded under OTHER by its description', () => {
    expect(recurringKeyOf({ category: 'OTHER', description: 'Soliqlar' })).toBe(
      'TAXES',
    );
    expect(
      recurringKeyOf({ category: 'OTHER', description: 'Stul uchun' }),
    ).toBeNull();
  });

  it('ignores marketing and supplies', () => {
    expect(recurringKeyOf({ category: 'MARKETING', description: '' })).toBe(
      null,
    );
  });
});

describe('missingRecurringExpenses', () => {
  // August 2026, Farg'ona — the rows September had not recorded by the 26th.
  const august = [
    {
      category: 'RENT',
      description: 'Ijara',
      amount: 16_175_000,
      dateStr: '2026-08-29',
    },
    {
      category: 'RENT',
      description: 'Ijara Bankshotdan',
      amount: 1_600_000,
      dateStr: '2026-08-29',
    },
    {
      category: 'OTHER',
      description: 'Soliqlar',
      amount: 3_774_252,
      dateStr: '2026-08-31',
    },
    {
      category: 'UTILITIES',
      description: 'Svet',
      amount: 2_417_000,
      dateStr: '2026-08-31',
    },
    {
      category: 'MARKETING',
      description: 'SMM',
      amount: 3_000_000,
      dateStr: '2026-08-11',
    },
  ];

  it('lists last month’s recurring costs this month has not recorded', () => {
    const september = [
      {
        category: 'UTILITIES',
        description: 'Paynet',
        amount: 70_000,
        dateStr: '2026-09-17',
      },
    ];
    expect(missingRecurringExpenses(august, september)).toEqual([
      {
        key: 'RENT',
        amount: 17_775_000,
        lastMonthAmount: 17_775_000,
        lastMonthDay: 29,
      },
      {
        key: 'TAXES',
        amount: 3_774_252,
        lastMonthAmount: 3_774_252,
        lastMonthDay: 31,
      },
      // Only what is still missing: 70 000 is already in.
      {
        key: 'UTILITIES',
        amount: 2_347_000,
        lastMonthAmount: 2_417_000,
        lastMonthDay: 31,
      },
    ]);
  });

  it('expects nothing once a cost is recorded in full', () => {
    const paid = august.filter((e) => e.category !== 'MARKETING');
    expect(missingRecurringExpenses(august, paid)).toEqual([]);
  });

  it('expects nothing from a category last month did not have', () => {
    expect(missingRecurringExpenses([], [])).toEqual([]);
  });
});

describe('remainingChargedLessons', () => {
  const charges = [
    {
      studentId: 1,
      groupId: 'g',
      perLessonCost: 34_615,
      coveredDates: ['2026-09-25', '2026-09-26', '2026-09-28', '2026-09-30'],
      frozenOutDates: [],
    },
    {
      studentId: 2,
      groupId: 'g',
      perLessonCost: 34_615,
      coveredDates: ['2026-09-26', '2026-09-28', '2026-09-30'],
      // Froze on the 28th: the 30th is no longer theirs.
      frozenOutDates: ['2026-09-30'],
    },
  ];

  it('counts covered dates from today on, skipping frozen-out ones', () => {
    // Student 1's lesson today is already marked; student 2's is not.
    const r = remainingChargedLessons(charges, '2026-09-26', new Set(['1|g']));
    // student 1: 28, 30 · student 2: 26, 28
    expect(r).toEqual({ count: 4, value: 4 * 34_615 });
  });
});

describe('unpaidLeftLessons', () => {
  const lessons = [
    { studentId: 1, groupId: 'old', value: 37_500 },
    { studentId: 1, groupId: 'old', value: 37_500 },
    { studentId: 2, groupId: 'old', value: 37_500 },
    { studentId: 3, groupId: 'cur', value: 37_500 },
  ];

  it('caps each student at what they owe today', () => {
    const r = unpaidLeftLessons(
      lessons,
      new Set([3]),
      // #1 owes more than this month's lessons; #2 has paid it off.
      new Map([[1, 500_000]]),
    );
    expect(r).toEqual({ students: 1, lessons: 2, amount: 75_000 });
  });

  it('counts only the part still owed', () => {
    const r = unpaidLeftLessons(lessons, new Set(), new Map([[1, 10_000]]));
    expect(r.amount).toBe(10_000);
  });

  // A student who moved to another group still studies; their debt is
  // collected the usual way and is not money that left with them.
  it('never counts a student still studying anywhere', () => {
    const r = unpaidLeftLessons(lessons, new Set([1, 3]), new Map([[1, 9]]));
    expect(r.students).toBe(0);
  });
});

describe('topWithRest', () => {
  it('keeps the largest rows and sums the tail', () => {
    const r = topWithRest(
      [{ amount: 1 }, { amount: 5 }, { amount: 3 }, { amount: 2 }],
      2,
    );
    expect(r.top.map((x) => x.amount)).toEqual([5, 3]);
    expect(r.rest).toEqual({ count: 2, amount: 3 });
  });
});
