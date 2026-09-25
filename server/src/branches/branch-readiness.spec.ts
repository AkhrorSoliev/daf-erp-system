import { buildBranchReadiness, ReadinessFacts } from './branch-readiness';

const launchedFacts: ReadinessFacts = {
  branchId: 2,
  branchName: 'Namangan',
  hasCash: true,
  hasBank: true,
  hasWorkingHours: true,
  roomCount: 1,
  courseCount: 1,
  adminCount: 1,
  teachers: [{ id: 90020, name: 'Ali Valiyev', hasRate: true, ceoOnly: false }],
  groupCount: 1,
  hasRunnableGroup: true,
  hasStudent: true,
  hasEnrollment: true,
  hasPayment: true,
  hasLeadSection: true,
  hasTelegramGroup: true,
};

const facts = (over: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
  ...launchedFacts,
  ...over,
});

const check = (f: ReadinessFacts, key: string) =>
  buildBranchReadiness(f).checks.find((c) => c.key === key)!;

describe('buildBranchReadiness', () => {
  it('lists every check in a fixed order', () => {
    expect(buildBranchReadiness(facts()).checks.map((c) => c.key)).toEqual([
      'cashAccount',
      'bankAccount',
      'workingHours',
      'room',
      'course',
      'teachers',
      'teacherRates',
      'group',
      'enrollment',
      'payment',
      'administrator',
      'leadSection',
      'telegramGroup',
    ]);
  });

  it('is ready and launched when everything is in place', () => {
    const r = buildBranchReadiness(facts());
    expect(r).toMatchObject({
      branchId: 2,
      branchName: 'Namangan',
      ready: true,
      launched: true,
    });
  });

  it('does NOT pass teacherRates for a branch with no teachers', () => {
    // An empty list used to make `every` return `ok: true` — a branch with no
    // teachers read as "rates are all set".
    const f = facts({ teachers: [] });
    expect(check(f, 'teachers').ok).toBe(false);
    expect(check(f, 'teacherRates').ok).toBe(false);
    expect(check(f, 'teacherRates').hint).toBe("Avval ustoz qo'shing");
  });

  it('names the teachers without a rate', () => {
    const c = check(
      facts({
        teachers: [
          { id: 90020, name: 'Ali Valiyev', hasRate: false, ceoOnly: false },
          { id: 90021, name: 'Zuhra Karimova', hasRate: true, ceoOnly: false },
        ],
      }),
      'teacherRates',
    );
    expect(c.ok).toBe(false);
    expect(c.hint).toBe("1 ta ustozga stavka qo'yilmagan");
    expect(c.details).toEqual([{ id: 90020, name: 'Ali Valiyev' }]);
  });

  it('flags a rate-less teacher who also holds CEO or Branch Director as ceoOnly', () => {
    // A Branch Director cannot fix this one themselves (ADR-0034) — omitted
    // entirely when false, so an ordinary teacher's entry stays unchanged.
    const c = check(
      facts({
        teachers: [
          { id: 90020, name: 'Ali Valiyev', hasRate: false, ceoOnly: false },
          { id: 90030, name: 'Otabek Rustamov', hasRate: false, ceoOnly: true },
        ],
      }),
      'teacherRates',
    );
    expect(c.details).toEqual([
      { id: 90020, name: 'Ali Valiyev' },
      { id: 90030, name: 'Otabek Rustamov', ceoOnly: true },
    ]);
  });

  it('tells an incomplete group apart from no group at all', () => {
    expect(
      check(facts({ hasRunnableGroup: false, groupCount: 0 }), 'group').hint,
    ).toBe('Kurs, ustoz va jadval bilan birinchi guruhni oching');
    expect(
      check(facts({ hasRunnableGroup: false, groupCount: 2 }), 'group').hint,
    ).toBe(
      'Guruh bor, lekin ustoz, dars kunlari yoki boshlanish sanasi kiritilmagan',
    );
  });

  it('tells students-not-enrolled apart from no students', () => {
    expect(
      check(facts({ hasEnrollment: false, hasStudent: false }), 'enrollment')
        .hint,
    ).toBe("O'quvchi qo'shib, guruhga yozing");
    expect(
      check(facts({ hasEnrollment: false, hasStudent: true }), 'enrollment')
        .hint,
    ).toBe("O'quvchilar bor, lekin hech biri guruhga yozilmagan");
  });

  it('never lets the optional checks block ready or launched', () => {
    const r = buildBranchReadiness(
      facts({ adminCount: 0, hasLeadSection: false, hasTelegramGroup: false }),
    );
    expect(r.ready).toBe(true);
    expect(r.launched).toBe(true);
    expect(r.checks.filter((c) => !c.required).map((c) => c.key)).toEqual([
      'administrator',
      'leadSection',
      'telegramGroup',
    ]);
  });

  it('launched depends only on group, enrollment and payment', () => {
    // An established branch may still hold a rate-less teacher — that must
    // not hide the "launched" card.
    const r = buildBranchReadiness(
      facts({
        hasWorkingHours: false,
        teachers: [
          {
            id: 90020,
            name: 'Rateless Teacher',
            hasRate: false,
            ceoOnly: false,
          },
        ],
      }),
    );
    expect(r.ready).toBe(false);
    expect(r.launched).toBe(true);

    for (const missing of [
      'hasRunnableGroup',
      'hasEnrollment',
      'hasPayment',
    ] as const) {
      expect(buildBranchReadiness(facts({ [missing]: false })).launched).toBe(
        false,
      );
    }
  });

  it('restores the missing apostrophe in the course hint', () => {
    expect(check(facts({ courseCount: 0 }), 'course').hint).toBe(
      "Kurssiz guruh ochib bo'lmaydi",
    );
  });
});
