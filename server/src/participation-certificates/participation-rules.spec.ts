import { AttendanceStatus } from '@prisma/client';
import {
  evaluate,
  isAppLevel,
  meetsPercent,
  normalizeLevel,
  tallyApp,
  tallyAttendance,
  type AttendanceRow,
  type Thresholds,
} from './participation-rules';

const row = (
  status: AttendanceStatus,
  extra: Partial<AttendanceRow> = {},
): AttendanceRow => ({
  status,
  cancellationId: null,
  plannedUnexcused: false,
  ...extra,
});

describe('tallyAttendance (spec 3.1)', () => {
  it('counts PRESENT and LATE as attended, ABSENT as absent, LATE also as late', () => {
    const t = tallyAttendance([
      row(AttendanceStatus.PRESENT),
      row(AttendanceStatus.LATE),
      row(AttendanceStatus.ABSENT),
    ]);
    expect(t).toEqual({
      attended: 2,
      late: 1,
      absent: 1,
      counted: 3,
      percent: 66,
    });
  });

  it('leaves an excused absence out of both sides', () => {
    const t = tallyAttendance([
      row(AttendanceStatus.PRESENT),
      row(AttendanceStatus.EXCUSED),
    ]);
    expect(t.counted).toBe(1);
    expect(t.absent).toBe(0);
    expect(t.percent).toBe(100);
  });

  it('leaves a cancelled lesson out, even when it was announced as unexcused', () => {
    const t = tallyAttendance([
      row(AttendanceStatus.PRESENT),
      row(AttendanceStatus.EXCUSED, {
        cancellationId: 'c1',
        plannedUnexcused: true,
      }),
    ]);
    expect(t.counted).toBe(1);
  });

  it('counts an announced «sababsiz» absence as absent', () => {
    const t = tallyAttendance([
      row(AttendanceStatus.PRESENT),
      row(AttendanceStatus.EXCUSED, { plannedUnexcused: true }),
    ]);
    expect(t).toMatchObject({
      attended: 1,
      absent: 1,
      counted: 2,
      percent: 50,
    });
  });

  it('has no percent without a counted lesson', () => {
    expect(tallyAttendance([])).toEqual({
      attended: 0,
      late: 0,
      absent: 0,
      counted: 0,
      percent: null,
    });
    expect(tallyAttendance([row(AttendanceStatus.EXCUSED)]).percent).toBeNull();
  });

  it('floors the displayed percent: 79,6 shows 79', () => {
    const rows = [
      ...Array.from({ length: 398 }, () => row(AttendanceStatus.PRESENT)),
      ...Array.from({ length: 102 }, () => row(AttendanceStatus.ABSENT)),
    ];
    expect(tallyAttendance(rows).percent).toBe(79);
  });
});

describe('meetsPercent', () => {
  it('passes exactly at the threshold', () => {
    expect(meetsPercent(4, 5, 80)).toBe(true);
  });
  it('does not round 79,6 up to 80', () => {
    expect(meetsPercent(398, 500, 80)).toBe(false);
  });
  it('never passes an empty denominator', () => {
    expect(meetsPercent(0, 0, 0)).toBe(false);
  });
  it('accepts a zero threshold when something was counted', () => {
    expect(meetsPercent(0, 3, 0)).toBe(true);
  });
});

describe('tallyApp', () => {
  it('does not apply without open lessons', () => {
    expect(tallyApp(0, 0)).toEqual({
      applies: false,
      done: 0,
      open: 0,
      percent: null,
    });
    expect(tallyApp(5, 0).applies).toBe(false);
  });
  it('floors the percent and never exceeds the open lessons', () => {
    expect(tallyApp(99, 100).percent).toBe(99);
    expect(tallyApp(120, 100)).toEqual({
      applies: true,
      done: 100,
      open: 100,
      percent: 100,
    });
  });
});

describe('evaluate (spec 3.3, ADR-0100 + the CEO conditions of 17.10)', () => {
  const att = (attended: number, counted: number, late = 0) =>
    tallyAttendance([
      ...Array.from({ length: late }, () => row(AttendanceStatus.LATE)),
      ...Array.from({ length: attended - late }, () =>
        row(AttendanceStatus.PRESENT),
      ),
      ...Array.from({ length: counted - attended }, () =>
        row(AttendanceStatus.ABSENT),
      ),
    ]);

  /** Lenient new thresholds: the older cases judge attendance and the app alone. */
  const th = (over: Partial<Thresholds> = {}): Thresholds => ({
    attendance: 80,
    app: null,
    minLessons: 1,
    maxLatePercent: 100,
    ...over,
  });
  const NONE = { balance: 0, unitTests: null };
  const noApp = tallyApp(0, 0);

  it('is eligible on attendance alone when nothing else applies', () => {
    const v = evaluate(att(4, 5), noApp, th(), NONE);
    expect(v).toEqual({
      attendanceOk: true,
      appOk: null,
      debtOk: true,
      lessonsOk: true,
      lateOk: true,
      latePercent: 0,
      testsOk: null,
      eligible: true,
      reasons: [],
    });
  });

  it('is not eligible below the attendance threshold and says why', () => {
    const v = evaluate(att(37, 50), noApp, th(), NONE);
    expect(v.eligible).toBe(false);
    expect(v.reasons).toEqual(['Davomat 74%, kerak 80%']);
  });

  it('says there is no data when nothing was counted', () => {
    const v = evaluate(att(0, 0), noApp, th(), NONE);
    // The minimum-lessons rule (at least 1) fails on an empty level too.
    expect(v.reasons).toEqual([
      "Davomat ma'lumoti yo'q",
      'Darslar soni 0 ta, kamida 1 ta kerak',
    ]);
  });

  it('needs the app threshold too when the level has open lessons', () => {
    const t = th({ app: 100 });
    expect(evaluate(att(5, 5), tallyApp(99, 100), t, NONE).eligible).toBe(
      false,
    );
    expect(evaluate(att(5, 5), tallyApp(99, 100), t, NONE).reasons).toEqual([
      'Ilova 99%, kerak 100%',
    ]);
    expect(evaluate(att(5, 5), tallyApp(100, 100), t, NONE).eligible).toBe(
      true,
    );
  });

  it('ignores the app threshold on a level without an app threshold', () => {
    const v = evaluate(att(5, 5), tallyApp(1, 100), th(), NONE);
    expect(v.appOk).toBeNull();
    expect(v.eligible).toBe(true);
  });

  it('does not ask for the app on a level that has a threshold but no open lessons yet (A2/B1 today)', () => {
    const v = evaluate(att(5, 5), noApp, th({ app: 100 }), NONE);
    expect(v.appOk).toBeNull();
    expect(v.eligible).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it('lists the attendance and app reasons together when both fail', () => {
    const v = evaluate(att(1, 2), tallyApp(1, 2), th({ app: 100 }), NONE);
    expect(v.reasons).toEqual([
      'Davomat 50%, kerak 80%',
      'Ilova 50%, kerak 100%',
    ]);
  });

  describe('debt: any negative balance blocks (no tolerance)', () => {
    it('balance 0 passes, -1 fails', () => {
      const ok = evaluate(att(5, 5), noApp, th(), { ...NONE, balance: 0 });
      expect(ok.debtOk).toBe(true);
      const bad = evaluate(att(5, 5), noApp, th(), { ...NONE, balance: -1 });
      expect(bad.debtOk).toBe(false);
      expect(bad.eligible).toBe(false);
      expect(bad.reasons).toEqual(["Qarzi bor: 1 so'm"]);
    });
    it('a positive balance passes', () => {
      expect(
        evaluate(att(5, 5), noApp, th(), { ...NONE, balance: 250000 }).debtOk,
      ).toBe(true);
    });
    it('writes the debt with space groups', () => {
      const v = evaluate(att(5, 5), noApp, th(), {
        ...NONE,
        balance: -1250000,
      });
      expect(v.reasons).toEqual(["Qarzi bor: 1 250 000 so'm"]);
    });
  });

  describe('minimum lessons: counted must reach the setting', () => {
    const t = th({ minLessons: 20 });
    it.each([
      [19, false],
      [20, true],
      [21, true],
    ])('counted %i -> lessonsOk %s', (counted, ok) => {
      const v = evaluate(att(counted, counted), noApp, t, NONE);
      expect(v.lessonsOk).toBe(ok);
      expect(v.eligible).toBe(ok);
      expect(v.reasons).toEqual(
        ok ? [] : [`Darslar soni ${counted} ta, kamida 20 ta kerak`],
      );
    });
    it('counts attended and absent lessons together', () => {
      expect(evaluate(att(16, 20), noApp, t, NONE).lessonsOk).toBe(true);
    });
  });

  describe('lateness: late x 100 > max x attended blocks, in integers', () => {
    const t = th({ maxLatePercent: 20 });
    it('exactly 20.0 % passes (4 of 20)', () => {
      const v = evaluate(att(20, 20, 4), noApp, t, NONE);
      expect(v.lateOk).toBe(true);
      expect(v.latePercent).toBe(20);
      expect(v.reasons).toEqual([]);
    });
    it('just over 20 % fails (4 of 19 attended lessons were late)', () => {
      const v = evaluate(att(19, 19, 4), noApp, t, NONE);
      expect(v.lateOk).toBe(false);
      expect(v.eligible).toBe(false);
      // Rounded UP for display so a failing figure never reads as the limit.
      expect(v.latePercent).toBe(22);
      expect(v.reasons).toEqual(['Kech qolish 22%, ruxsat etilgani 20%']);
    });
    it('a hair over the limit still fails and never shows as 20 %', () => {
      // 1001 / 5000 = 20.02 %.
      const v = evaluate(
        {
          attended: 5000,
          late: 1001,
          absent: 0,
          counted: 5000,
          percent: 100,
        },
        noApp,
        t,
        NONE,
      );
      expect(v.lateOk).toBe(false);
      expect(v.latePercent).toBe(21);
    });
    it('exactly 1000 of 5000 (20.00 %) passes', () => {
      const v = evaluate(
        {
          attended: 5000,
          late: 1000,
          absent: 0,
          counted: 5000,
          percent: 100,
        },
        noApp,
        t,
        NONE,
      );
      expect(v.lateOk).toBe(true);
    });
    it('0 % limit allows no late lesson at all', () => {
      const z = th({ maxLatePercent: 0 });
      expect(evaluate(att(10, 10, 0), noApp, z, NONE).lateOk).toBe(true);
      expect(evaluate(att(10, 10, 1), noApp, z, NONE).lateOk).toBe(false);
    });
    it('attended 0 does not divide by zero: passes lateness, fails on attendance', () => {
      const v = evaluate(att(0, 3), noApp, t, NONE);
      expect(v.lateOk).toBe(true);
      expect(v.latePercent).toBeNull();
      expect(v.attendanceOk).toBe(false);
      expect(v.reasons).toEqual(['Davomat 0%, kerak 80%']);
    });
  });

  describe('final tests: all passed, or skipped when the level has none', () => {
    it('3 of 3 passes', () => {
      const v = evaluate(att(5, 5), noApp, th(), {
        ...NONE,
        unitTests: { passed: 3, total: 3 },
      });
      expect(v.testsOk).toBe(true);
      expect(v.eligible).toBe(true);
    });
    it('2 of 3 fails and says so', () => {
      const v = evaluate(att(5, 5), noApp, th(), {
        ...NONE,
        unitTests: { passed: 2, total: 3 },
      });
      expect(v.testsOk).toBe(false);
      expect(v.eligible).toBe(false);
      expect(v.reasons).toEqual([
        'Yakuniy sinovlar 2/3 ta topshirilgan, hammasi kerak',
      ]);
    });
    it('no unit tests at the level: skipped (null), not a failure', () => {
      const v = evaluate(att(5, 5), noApp, th(), NONE);
      expect(v.testsOk).toBeNull();
      expect(v.eligible).toBe(true);
    });
    it('a zero total is the same as none', () => {
      const v = evaluate(att(5, 5), noApp, th(), {
        ...NONE,
        unitTests: { passed: 0, total: 0 },
      });
      expect(v.testsOk).toBeNull();
      expect(v.eligible).toBe(true);
    });
  });

  it('lists every failing reason in a fixed order', () => {
    const v = evaluate(
      att(10, 20, 5),
      tallyApp(1, 2),
      th({ app: 100, minLessons: 25, maxLatePercent: 20 }),
      { balance: -5000, unitTests: { passed: 0, total: 2 } },
    );
    expect(v.eligible).toBe(false);
    expect(v.reasons).toEqual([
      'Davomat 50%, kerak 80%',
      'Darslar soni 20 ta, kamida 25 ta kerak',
      'Kech qolish 50%, ruxsat etilgani 20%',
      'Ilova 50%, kerak 100%',
      'Yakuniy sinovlar 0/2 ta topshirilgan, hammasi kerak',
      "Qarzi bor: 5 000 so'm",
    ]);
  });
});

describe('levels', () => {
  it('normalizes a group level and rejects free text', () => {
    expect(normalizeLevel(' a1 ')).toBe('A1');
    expect(normalizeLevel('C2')).toBe('C2');
    expect(normalizeLevel('Beginner')).toBeNull();
    expect(normalizeLevel(null)).toBeNull();
  });
  it('knows which levels the app teaches', () => {
    expect(isAppLevel('A1')).toBe(true);
    expect(isAppLevel('B1')).toBe(true);
    expect(isAppLevel('B2')).toBe(false);
  });
});
