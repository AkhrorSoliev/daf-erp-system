import { DepartureReleaseInput } from './departure-release';
import {
  CONTRACT_62_START_DAY,
  DEFAULT_DEPARTURE_POLICY,
  heldShare,
  policyRelease,
  trialAwaitsAnswerText,
} from './departure-policy';

/** A Mon/Wed/Fri group's October 2026: 13 lessons. */
const OCTOBER = [
  '2026-10-02',
  '2026-10-05',
  '2026-10-07',
  '2026-10-09',
  '2026-10-12',
  '2026-10-14',
  '2026-10-16',
  '2026-10-19',
  '2026-10-21',
  '2026-10-23',
  '2026-10-26',
  '2026-10-28',
  '2026-10-30',
];

const input = (
  over: Partial<DepartureReleaseInput> = {},
): DepartureReleaseInput => ({
  departureDay: '2026-10-14', // the 6th lesson
  coveredDates: OCTOBER,
  frozenOutDates: [],
  coveredLessons: 13,
  perLessonCost: 80000,
  discountPercent: 0,
  chargedAmount: 1040000,
  lessonsThroughDeparture: 0,
  ...over,
});

describe('departure policy (contract 6.2)', () => {
  it('starts on 01.10.2026 and defaults to a student-initiated departure', () => {
    expect(CONTRACT_62_START_DAY).toBe('2026-10-01');
    expect(DEFAULT_DEPARTURE_POLICY).toBe('STUDENT_CANCELLED');
  });

  it('returns the unheld lessons while at most 40% of the month was held (5 of 13 = 38%)', () => {
    const r = policyRelease(
      input({ departureDay: '2026-10-12' }),
      'STUDENT_CANCELLED',
      40,
    );
    expect(r.share).toEqual({ held: 5, covered: 13, percent: 38 });
    expect(r.withheld).toBe(false);
    expect(r.release).toMatchObject({ lessons: 8, amount: 640000 });
  });

  it('keeps the money once more than 40% was held (6 of 13 = 46%)', () => {
    const r = policyRelease(input(), 'STUDENT_CANCELLED', 40);
    expect(r.share).toEqual({ held: 6, covered: 13, percent: 46 });
    expect(r.withheld).toBe(true);
    expect(r.release).toBeNull();
  });

  it('returns the money at exactly 40% — the contract says «more than»', () => {
    const r = policyRelease(
      input({
        coveredDates: OCTOBER.slice(0, 5),
        coveredLessons: 5,
        chargedAmount: 400000,
        departureDay: '2026-10-05',
      }),
      'STUDENT_CANCELLED',
      40,
    );
    expect(r.share.percent).toBe(40);
    expect(r.withheld).toBe(false);
    expect(r.release).toMatchObject({ lessons: 3, amount: 240000 });
  });

  it('keeps the old rule for a departure before the contract start', () => {
    const r = policyRelease(
      input({
        coveredDates: [
          '2026-09-02',
          '2026-09-04',
          '2026-09-07',
          '2026-09-09',
          '2026-09-11',
        ],
        coveredLessons: 5,
        chargedAmount: 400000,
        departureDay: '2026-09-09',
      }),
      'STUDENT_CANCELLED',
      40,
    );
    expect(r.share.percent).toBe(80);
    expect(r.withheld).toBe(false);
    expect(r.release).toMatchObject({ lessons: 1 });
  });

  it('does not call it withheld when the month has nothing left to return', () => {
    // The month's last lesson is past: no policy would return anything, so
    // rule 6.2 kept nothing and the history must not say it did.
    const r = policyRelease(
      input({ departureDay: '2026-10-30' }),
      'STUDENT_CANCELLED',
      40,
    );
    expect(r.share).toEqual({ held: 13, covered: 13, percent: 100 });
    expect(r.withheld).toBe(false);
    expect(r.release).toBeNull();
  });

  it('does not call it withheld for a frozen student whose rest was already returned', () => {
    // Frozen after the 5th lesson: the freeze returned the other eight.
    const r = policyRelease(
      input({ departureDay: '2026-10-21', frozenOutDates: OCTOBER.slice(5) }),
      'STUDENT_CANCELLED',
      40,
    );
    expect(r.share).toEqual({ held: 5, covered: 5, percent: 100 });
    expect(r.withheld).toBe(false);
    expect(r.release).toBeNull();
  });

  it('follows the threshold it is given', () => {
    expect(policyRelease(input(), 'STUDENT_CANCELLED', 50).withheld).toBe(
      false,
    );
  });

  it('returns the unheld lessons on the centre’s initiative, whatever was held', () => {
    const r = policyRelease(input(), 'CENTER_INITIATIVE', 40);
    expect(r.withheld).toBe(false);
    expect(r.release).toMatchObject({ lessons: 7, amount: 560000 });
  });

  it('returns the unheld lessons to a student who completed the level, whatever was held', () => {
    // Finishing A1 (certificate, or moving up later) is the contract fulfilled
    // (10.1), not a cancellation: rule 6.2 does not reach it (contract 3.4).
    const r = policyRelease(input(), 'LEVEL_COMPLETED', 40);
    expect(r.share).toEqual({ held: 6, covered: 13, percent: 46 });
    expect(r.withheld).toBe(false);
    expect(r.release).toMatchObject({ lessons: 7, amount: 560000 });
  });

  it('returns the whole month on a quality claim, held lessons included', () => {
    const r = policyRelease(input(), 'QUALITY_CLAIM', 40);
    expect(r.withheld).toBe(false);
    expect(r.release).toMatchObject({ lessons: 13, amount: 1040000 });
  });

  it('never returns more than the month still holds (a month paid partly by credit)', () => {
    const r = policyRelease(
      input({ chargedAmount: 880000 }),
      'QUALITY_CLAIM',
      40,
    );
    expect(r.release).toMatchObject({ lessons: 13, amount: 880000 });
  });

  it('counts the lessons already frozen out on neither side', () => {
    const r = policyRelease(
      input({ frozenOutDates: OCTOBER.slice(9) }),
      'STUDENT_CANCELLED',
      40,
    );
    expect(r.share).toEqual({ held: 6, covered: 9, percent: 67 });
    expect(r.withheld).toBe(true);
  });

  it('prices the returned lessons with the student’s discount', () => {
    const r = policyRelease(
      input({ departureDay: '2026-10-12', discountPercent: 10 }),
      'STUDENT_CANCELLED',
      40,
    );
    expect(r.release).toMatchObject({ lessons: 8, amount: 576000 });
  });

  it('reads a legacy row (no dates) by its counts', () => {
    expect(
      heldShare(input({ coveredDates: [], lessonsThroughDeparture: 5 })),
    ).toEqual({ held: 5, covered: 13, percent: 38 });
    expect(
      policyRelease(
        input({ coveredDates: [], lessonsThroughDeparture: 6 }),
        'STUDENT_CANCELLED',
        40,
      ).withheld,
    ).toBe(true);
    expect(
      policyRelease(
        input({ coveredDates: [], lessonsThroughDeparture: 6 }),
        'QUALITY_CLAIM',
        40,
      ).release,
    ).toMatchObject({ lessons: 13 });
  });
});

describe('trial lesson (contract 3.5)', () => {
  it('returns the whole month, the held lesson included, under every policy', () => {
    for (const policy of [
      'STUDENT_CANCELLED',
      'LEVEL_COMPLETED',
      'CENTER_INITIATIVE',
      'QUALITY_CLAIM',
    ] as const) {
      const r = policyRelease(
        input({ departureDay: '2026-10-02' }),
        policy,
        40,
        { trialLesson: true },
      );
      expect(r.trial).toBe(true);
      expect(r.withheld).toBe(false);
      expect(r.release).toMatchObject({ lessons: 13, amount: 1040000 });
    }
  });

  it('wins over rule 6.2 even when the share is above the threshold', () => {
    const r = policyRelease(input(), 'STUDENT_CANCELLED', 40, {
      trialLesson: true,
    });
    expect(r.withheld).toBe(false);
    expect(r.release).toMatchObject({ lessons: 13 });
  });

  it('does not apply before 01.10.2026', () => {
    const r = policyRelease(
      input({ departureDay: '2026-09-30' }),
      'STUDENT_CANCELLED',
      40,
      { trialLesson: true },
    );
    expect(r.trial).toBe(false);
    expect(r.release).toMatchObject({ lessons: 13 });
  });

  it('keeps the ordinary rule without the flag', () => {
    const r = policyRelease(
      input({ departureDay: '2026-10-02' }),
      'STUDENT_CANCELLED',
      40,
    );
    expect(r.trial).toBe(false);
    expect(r.release).toMatchObject({ lessons: 12 });
  });

  it('leaves the frozen-out lessons out of the release', () => {
    const r = policyRelease(
      input({
        departureDay: '2026-10-02',
        frozenOutDates: OCTOBER.slice(10),
        chargedAmount: 800000,
      }),
      'STUDENT_CANCELLED',
      40,
      { trialLesson: true },
    );
    expect(r.release).toMatchObject({ lessons: 10, amount: 800000 });
  });
});

describe("a trial lesson waiting on «Dars bo'ldimi?» (CEO, 01.10.2026)", () => {
  it('names the lesson to answer first', () => {
    expect(
      trialAwaitsAnswerText([{ date: '2026-10-05', groupName: '#014' }]),
    ).toBe(
      "Avval «Dars bo'ldimi?» savoliga javob bering: 05.10 (#014). Sinov darsi o'quvchi shu darsda bo'lgan-bo'lmaganiga qarab hal bo'ladi.",
    );
  });

  it('names every lesson to answer, in the plural', () => {
    expect(
      trialAwaitsAnswerText([
        { date: '2026-10-05', groupName: '#014' },
        { date: '2026-10-07', groupName: '#014' },
      ]),
    ).toBe(
      "Avval «Dars bo'ldimi?» savoliga javob bering: 05.10 (#014), 07.10 (#014). Sinov darsi o'quvchi shu darslarda bo'lgan-bo'lmaganiga qarab hal bo'ladi.",
    );
  });
});
