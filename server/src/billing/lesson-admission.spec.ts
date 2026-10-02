import {
  ADMITTED_WITHOUT_RULE,
  firstLessonCoverage,
  heldAfter,
  isFirstLessonOfMonth,
  lessonAdmission,
  paymentReach,
  type AdmissionCharge,
  type CoverageCharge,
} from './lesson-admission';

// #005 in October 2026: Mon/Wed/Fri, 13 lessons, 450 000 a month.
const OCT = [
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
const g005: AdmissionCharge = {
  groupId: 'g005',
  coveredDates: OCT,
  frozenOutDates: [],
  coveredLessons: 13,
  perLessonCost: 34615, // 450 000 / 13, undiscounted
  discountPercent: 0,
  chargedAmount: 450000,
};
const admit = (balance: number, lessonDay: string, charges = [g005]) =>
  lessonAdmission({ lessonDay, groupId: 'g005', balance, charges });

describe('heldAfter', () => {
  it('holds the lessons after the day, the day itself counted as held', () => {
    expect(heldAfter([g005], '2026-10-05')).toBe(11 * 34615);
  });

  it('holds nothing after the last lesson', () => {
    expect(heldAfter([g005], '2026-10-30')).toBe(0);
  });

  it('skips lessons a freeze already released', () => {
    const frozen = { ...g005, frozenOutDates: OCT.slice(10) };
    expect(heldAfter([frozen], '2026-10-05')).toBe(8 * 34615);
  });
});

describe('lessonAdmission', () => {
  it('does not apply before 2026-10-01', () => {
    expect(admit(-450000, '2026-09-30')).toEqual(ADMITTED_WITHOUT_RULE);
  });

  it('admits the first lesson of the month unpaid', () => {
    expect(admit(-450000, '2026-10-02')).toEqual({
      admitted: true,
      reason: 'FIRST_LESSON',
      shortfall: 0,
      paidThrough: null,
    });
  });

  it('blocks the second lesson with nothing paid, naming the shortfall', () => {
    expect(admit(-450000, '2026-10-05')).toEqual({
      admitted: false,
      reason: 'NOT_PAID',
      shortfall: 450000 - 11 * 34615,
      paidThrough: null,
    });
  });

  it('admits the second lesson once lessons 1–2 are paid, and says how far', () => {
    const balance = -(11 * 34615); // paid exactly the first two lessons
    expect(admit(balance, '2026-10-05')).toEqual({
      admitted: true,
      reason: 'PAID',
      shortfall: 0,
      paidThrough: '2026-10-05',
    });
  });

  it("one so'm short is still blocked", () => {
    expect(admit(-(11 * 34615) - 1, '2026-10-05').admitted).toBe(false);
  });

  it('a part payment reaches the lessons it covers (150 000 → 09.10)', () => {
    expect(admit(-300000, '2026-10-05')).toEqual({
      admitted: true,
      reason: 'PAID',
      shortfall: 0,
      paidThrough: '2026-10-09',
    });
  });

  it('a full payment leaves no paidThrough', () => {
    expect(admit(0, '2026-10-14').paidThrough).toBeNull();
  });

  it('older debt must be paid first', () => {
    // 100 000 still owed from September, nothing paid for October. Payments
    // settle the oldest debt first, so the 2nd lesson needs both.
    expect(admit(-550000, '2026-10-05').shortfall).toBe(
      100000 + (450000 - heldAfter([g005], '2026-10-05')),
    );
    // Clearing only the old debt is not enough for the 2nd lesson.
    expect(admit(-450000, '2026-10-05').admitted).toBe(false);
  });

  it('a second group adds its own held lessons', () => {
    const g010: AdmissionCharge = {
      ...g005,
      groupId: 'g010',
      chargedAmount: 400000,
      perLessonCost: 30769,
    };
    const both = [g005, g010];
    const held = heldAfter(both, '2026-10-05');
    expect(admit(-held, '2026-10-05', both).admitted).toBe(true);
    expect(admit(-held - 1, '2026-10-05', both).admitted).toBe(false);
  });

  it('applies the discount to the held lessons', () => {
    const half = { ...g005, discountPercent: 50, chargedAmount: 225000 };
    const held = heldAfter([half], '2026-10-05');
    expect(held).toBeLessThan(11 * 34615);
    expect(admit(-225000, '2026-10-05', [half]).shortfall).toBe(225000 - held);
  });

  it('has nothing to judge without a charge in this group', () => {
    expect(admit(-450000, '2026-10-05', [])).toEqual(ADMITTED_WITHOUT_RULE);
  });

  it("counts a later month's charge as still held (October paid, November owed)", () => {
    // November: 12 lessons, 450 000, posted on 01.11 and unpaid.
    const nov: AdmissionCharge = {
      ...g005,
      coveredDates: Array.from(
        { length: 12 },
        (_, i) => `2026-11-${String(i + 2).padStart(2, '0')}`,
      ),
      coveredLessons: 12,
      perLessonCost: 37500,
    };
    // «Bo'ldi» on 02.11 for 30.10, October's last lesson.
    const onLast = (balance: number) =>
      lessonAdmission({
        lessonDay: '2026-10-30',
        groupId: 'g005',
        balance,
        charges: [g005],
        laterCharges: [nov],
      });
    expect(onLast(-450000).admitted).toBe(true);
    // One so'm of October still owed.
    expect(onLast(-450001)).toMatchObject({ admitted: false, shortfall: 1 });
    // Without November counted, the student who paid October is kept out.
    expect(admit(-450000, '2026-10-30').admitted).toBe(false);
  });

  it('counts a later month at what it charged, not at its rounded lessons', () => {
    // 13 lessons at 450 000: 13 × 34 615 = 449 995, five so'm short.
    const nov13: AdmissionCharge = {
      ...g005,
      coveredDates: OCT.map((d) => d.replace('-10-', '-11-')),
    };
    const lastOfOctober = lessonAdmission({
      lessonDay: '2026-10-30',
      groupId: 'g005',
      balance: -450000,
      charges: [g005],
      laterCharges: [nov13],
    });
    expect(lastOfOctober).toMatchObject({ admitted: true, reason: 'PAID' });
  });

  it('the first lesson after a mid-month join is free', () => {
    const joined = { ...g005, coveredDates: OCT.slice(8), coveredLessons: 5 };
    expect(admit(-173077, '2026-10-21', [joined]).reason).toBe('FIRST_LESSON');
    expect(admit(-173077, '2026-10-23', [joined]).admitted).toBe(false);
  });
});

describe('paymentReach', () => {
  const charges = [{ ...g005, groupName: '#005' }];

  it('is null before the rule starts', () => {
    expect(
      paymentReach({ today: '2026-09-28', balanceAfter: -350000, charges }),
    ).toBeNull();
  });

  it('100 000 on 05.10 reaches 05.10 and names what 07.10 still needs', () => {
    expect(
      paymentReach({ today: '2026-10-05', balanceAfter: -350000, charges }),
    ).toEqual({
      paidThrough: '2026-10-05',
      next: {
        date: '2026-10-07',
        groupName: '#005',
        needed: 350000 - 10 * 34615,
      },
      clearsDebt: false,
    });
  });

  it("a payment that clears the debt reaches the month's last lesson", () => {
    expect(
      paymentReach({ today: '2026-10-05', balanceAfter: 0, charges }),
    ).toEqual({ paidThrough: '2026-10-30', next: null, clearsDebt: true });
  });

  it("nothing on today's lesson when even today is not covered", () => {
    const reach = paymentReach({
      today: '2026-10-05',
      balanceAfter: -450000,
      charges,
    });
    expect(reach?.paidThrough).toBeNull();
    expect(reach?.next?.date).toBe('2026-10-05');
  });

  it('is null when no lesson is left this month', () => {
    expect(
      paymentReach({ today: '2026-10-31', balanceAfter: -1000, charges }),
    ).toBeNull();
  });
});

describe('isFirstLessonOfMonth (contract 3.2)', () => {
  it('is every lesson before the 2nd one', () => {
    expect(isFirstLessonOfMonth(OCT, '2026-10-02')).toBe(true);
    expect(isFirstLessonOfMonth(OCT, '2026-10-05')).toBe(false);
  });
  it('is every lesson of a month with fewer than two', () => {
    expect(isFirstLessonOfMonth(['2026-10-30'], '2026-10-30')).toBe(true);
  });
});

describe('firstLessonCoverage (ADR-0048, R4)', () => {
  const oct: CoverageCharge = {
    ...g005,
    enrollmentId: 'enr-oct',
    periodYear: 2026,
    periodMonth: 10,
  };
  // November: a Mon/Wed/Fri month of 12 lessons, 450 000.
  const nov: CoverageCharge = {
    ...g005,
    enrollmentId: 'enr-oct',
    periodYear: 2026,
    periodMonth: 11,
    coveredDates: Array.from(
      { length: 12 },
      (_, i) => `2026-11-${String(i + 2).padStart(2, '0')}`,
    ),
    coveredLessons: 12,
    perLessonCost: 37500,
  };
  const cover = (
    balance: number,
    charges: CoverageCharge[],
    day = '2026-10-02',
  ) =>
    firstLessonCoverage({ lessonDay: day, groupId: 'g005', balance, charges });

  it('finds the first lesson and the enrollment that billed it', () => {
    expect(cover(-450000, [oct])).toEqual({
      firstLesson: true,
      covered: false,
      enrollmentId: 'enr-oct',
    });
    expect(cover(-450000, [oct], '2026-10-05').firstLesson).toBe(false);
  });

  it('is covered once the payments reach the lesson, as contract 3.2 counts it', () => {
    expect(cover(-(12 * 34615), [oct]).covered).toBe(true);
    expect(cover(-(12 * 34615) - 1, [oct]).covered).toBe(false);
  });

  it("counts a later month's charge as still held (October paid, November owed)", () => {
    // October paid in full; November's 450 000 posted and unpaid.
    expect(cover(-450000, [oct, nov]).covered).toBe(true);
    // October still 1 so'm short of the first lesson, November unpaid.
    expect(cover(-(12 * 34615) - 1 - 450000, [oct, nov]).covered).toBe(false);
  });

  it('ignores charges from before the lesson month', () => {
    const sep: CoverageCharge = {
      ...oct,
      periodMonth: 9,
      coveredDates: [],
    };
    // A dateless September row would otherwise release its whole charge.
    expect(cover(-450000, [sep, oct]).covered).toBe(false);
  });

  it('is not a first lesson without a charge in that group-month', () => {
    expect(cover(-450000, [nov])).toMatchObject({
      firstLesson: false,
      enrollmentId: null,
    });
    expect(
      firstLessonCoverage({
        lessonDay: '2026-10-02',
        groupId: 'other',
        balance: -450000,
        charges: [oct],
      }).firstLesson,
    ).toBe(false);
  });

  it('starts a new first lesson for a student who rejoined the group this month', () => {
    const left = {
      ...oct,
      enrollmentId: 'enr-left',
      frozenOutDates: OCT.slice(3),
    };
    const back = {
      ...oct,
      enrollmentId: 'enr-back',
      coveredDates: OCT.slice(8),
      coveredLessons: 5,
    };
    const c = cover(0, [left, back], '2026-10-21');
    expect(c).toMatchObject({ firstLesson: true, enrollmentId: 'enr-back' });
    expect(cover(0, [left, back], '2026-10-23').firstLesson).toBe(false);
  });

  it('reads the first lesson past the dates a freeze took out', () => {
    const frozen = { ...oct, frozenOutDates: ['2026-10-02'] };
    const c = cover(0, [frozen], '2026-10-05');
    expect(c.firstLesson).toBe(true);
    expect(c.enrollmentId).toBe('enr-oct');
  });
});
