import { AttendanceStatus } from '@prisma/client';
import {
  evaluate,
  isAppLevel,
  meetsPercent,
  normalizeLevel,
  tallyApp,
  tallyAttendance,
  type AttendanceRow,
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

describe('evaluate (spec 3.3)', () => {
  const att = (attended: number, counted: number) =>
    tallyAttendance([
      ...Array.from({ length: attended }, () => row(AttendanceStatus.PRESENT)),
      ...Array.from({ length: counted - attended }, () =>
        row(AttendanceStatus.ABSENT),
      ),
    ]);

  it('is eligible on attendance alone when the app does not apply', () => {
    const v = evaluate(att(4, 5), tallyApp(0, 0), {
      attendance: 80,
      app: null,
    });
    expect(v).toEqual({
      attendanceOk: true,
      appOk: null,
      eligible: true,
      reasons: [],
    });
  });

  it('is not eligible below the attendance threshold and says why', () => {
    const v = evaluate(att(37, 50), tallyApp(0, 0), {
      attendance: 80,
      app: null,
    });
    expect(v.eligible).toBe(false);
    expect(v.reasons).toEqual(['Davomat 74%, kerak 80%']);
  });

  it('says there is no data when nothing was counted', () => {
    const v = evaluate(att(0, 0), tallyApp(0, 0), {
      attendance: 80,
      app: null,
    });
    expect(v.reasons).toEqual(["Davomat ma'lumoti yo'q"]);
  });

  it('needs the app threshold too when the level has open lessons', () => {
    const th = { attendance: 80, app: 100 };
    expect(evaluate(att(5, 5), tallyApp(99, 100), th).eligible).toBe(false);
    expect(evaluate(att(5, 5), tallyApp(99, 100), th).reasons).toEqual([
      'Ilova 99%, kerak 100%',
    ]);
    expect(evaluate(att(5, 5), tallyApp(100, 100), th).eligible).toBe(true);
  });

  it('ignores the app threshold on a level without an app threshold', () => {
    const v = evaluate(att(5, 5), tallyApp(1, 100), {
      attendance: 80,
      app: null,
    });
    expect(v.appOk).toBeNull();
    expect(v.eligible).toBe(true);
  });

  it('does not ask for the app on a level that has a threshold but no open lessons yet (A2/B1 today)', () => {
    const v = evaluate(att(5, 5), tallyApp(0, 0), {
      attendance: 80,
      app: 100,
    });
    expect(v).toEqual({
      attendanceOk: true,
      appOk: null,
      eligible: true,
      reasons: [],
    });
  });

  it('lists both reasons when both fail', () => {
    const v = evaluate(att(1, 2), tallyApp(1, 2), { attendance: 80, app: 100 });
    expect(v.reasons).toEqual([
      'Davomat 50%, kerak 80%',
      'Ilova 50%, kerak 100%',
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
