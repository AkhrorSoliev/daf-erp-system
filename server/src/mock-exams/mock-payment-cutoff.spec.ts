import {
  formatMockPaymentCutoff,
  isMockPaymentOpen,
  mockPaymentCutoff,
} from './mock-payment-cutoff';

/**
 * CEO, 2026-09-25: a mock exam has a set date and time, and money is accepted
 * until that time. The cutoff is the start of the participant's own slot in
 * Tashkent time (UTC+5).
 */
describe('mockPaymentCutoff', () => {
  // Stored the way the exam form stores a date: UTC midnight of the day.
  const EXAM_DAY = new Date('2026-09-30T00:00:00.000Z');
  const SLOTS = ['09:00', '13:00'];

  it("closes at the start of the participant's own slot", () => {
    expect(
      mockPaymentCutoff({
        examDate: EXAM_DAY,
        examTimes: SLOTS,
        participantExamTime: '13:00',
      })?.toISOString(),
    ).toBe('2026-09-30T08:00:00.000Z');
  });

  it('uses the earliest slot when the participant chose none', () => {
    expect(
      mockPaymentCutoff({
        examDate: EXAM_DAY,
        examTimes: ['13:00', '08:30'],
        participantExamTime: null,
      })?.toISOString(),
    ).toBe('2026-09-30T03:30:00.000Z');
  });

  it('ignores a slot that is not HH:MM and falls back to the earliest one', () => {
    expect(
      mockPaymentCutoff({
        examDate: EXAM_DAY,
        examTimes: SLOTS,
        participantExamTime: 'ertalab',
      })?.toISOString(),
    ).toBe('2026-09-30T04:00:00.000Z');
  });

  it('closes at the end of the exam day when the exam has no time', () => {
    expect(
      mockPaymentCutoff({
        examDate: EXAM_DAY,
        examTimes: [],
        participantExamTime: null,
      })?.toISOString(),
    ).toBe('2026-09-30T19:00:00.000Z');
  });

  it('reads the day in Tashkent, whichever midnight the date was stored at', () => {
    // Tashkent midnight of 30.09 is 19:00 UTC on 29.09.
    expect(
      mockPaymentCutoff({
        examDate: new Date('2026-09-29T19:00:00.000Z'),
        examTimes: SLOTS,
        participantExamTime: '09:00',
      })?.toISOString(),
    ).toBe('2026-09-30T04:00:00.000Z');
  });

  it('has no cutoff while the exam has no date', () => {
    expect(
      mockPaymentCutoff({
        examDate: null,
        examTimes: SLOTS,
        participantExamTime: '09:00',
      }),
    ).toBeNull();
  });
});

describe('isMockPaymentOpen', () => {
  const cutoff = new Date('2026-09-30T04:00:00.000Z');

  it('is open before the cutoff', () => {
    expect(
      isMockPaymentOpen(cutoff, new Date('2026-09-30T03:59:59.999Z')),
    ).toBe(true);
  });

  it('is closed from the cutoff on', () => {
    expect(
      isMockPaymentOpen(cutoff, new Date('2026-09-30T04:00:00.000Z')),
    ).toBe(false);
  });

  it('is open when there is no cutoff', () => {
    expect(isMockPaymentOpen(null, new Date())).toBe(true);
  });
});

describe('formatMockPaymentCutoff', () => {
  it('prints the Tashkent date and time', () => {
    expect(formatMockPaymentCutoff(new Date('2026-09-30T08:00:00.000Z'))).toBe(
      '30.09.2026, 13:00',
    );
  });
});
