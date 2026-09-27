import { chargeStartDate } from './charge-start-date';

const enrollment = (over: {
  startDate?: Date | null;
  createdAt?: Date;
  returnedAt?: Date | null;
  groupStart?: Date | null;
}) => ({
  startDate: over.startDate ?? null,
  createdAt: over.createdAt ?? new Date('2026-05-02T06:00:00.000Z'),
  returnedAt: over.returnedAt ?? null,
  group: { startDate: over.groupStart ?? null },
});

describe('chargeStartDate', () => {
  it('uses the start date the enrollment was given', () => {
    expect(
      chargeStartDate(
        enrollment({
          startDate: new Date('2026-09-17T00:00:00.000Z'),
          createdAt: new Date('2026-09-10T06:00:00.000Z'),
        }),
      ),
    ).toBe('2026-09-17');
  });

  it('falls back to the day the enrollment was created, never to the 1st', () => {
    // Telegram sign-up on 25.09 wrote no start date; the charge must not
    // reach back to 01.09.
    expect(
      chargeStartDate(
        enrollment({ createdAt: new Date('2026-09-25T09:30:00.000Z') }),
      ),
    ).toBe('2026-09-25');
  });

  it('reads the creation day in Tashkent, not UTC', () => {
    // 20:00 UTC on 24.09 is 01:00 on 25.09 in Tashkent.
    expect(
      chargeStartDate(
        enrollment({ createdAt: new Date('2026-09-24T20:00:00.000Z') }),
      ),
    ).toBe('2026-09-25');
  });

  it('never starts before the group itself does', () => {
    // Added on 15.09 to a group that opened on 17.09.
    expect(
      chargeStartDate(
        enrollment({
          startDate: new Date('2026-09-15T00:00:00.000Z'),
          groupStart: new Date('2026-09-17T00:00:00.000Z'),
        }),
      ),
    ).toBe('2026-09-17');
  });

  it('starts the day after the enrollment came back from a freeze', () => {
    // The return day stays free, as it does in `restoreChargeForReturn`.
    expect(
      chargeStartDate(
        enrollment({
          startDate: new Date('2026-08-15T00:00:00.000Z'),
          returnedAt: new Date('2026-10-15T09:00:00.000Z'),
        }),
      ),
    ).toBe('2026-10-16');
  });

  it('reads the return day in Tashkent, not UTC', () => {
    // 20:30 UTC on 15.10 is 01:30 on 16.10 in Tashkent.
    expect(
      chargeStartDate(
        enrollment({
          startDate: new Date('2026-08-15T00:00:00.000Z'),
          returnedAt: new Date('2026-10-15T20:30:00.000Z'),
        }),
      ),
    ).toBe('2026-10-17');
  });

  it('a return before the enrollment was due to start changes nothing', () => {
    // Enrolled from 20.10, frozen and back again before that day.
    expect(
      chargeStartDate(
        enrollment({
          startDate: new Date('2026-10-20T00:00:00.000Z'),
          createdAt: new Date('2026-10-10T06:00:00.000Z'),
          returnedAt: new Date('2026-10-15T09:00:00.000Z'),
        }),
      ),
    ).toBe('2026-10-20');
  });

  it('keeps an old enrollment in a long-running group unchanged', () => {
    expect(
      chargeStartDate(
        enrollment({
          createdAt: new Date('2026-05-02T06:00:00.000Z'),
          groupStart: new Date('2026-05-01T00:00:00.000Z'),
        }),
      ),
    ).toBe('2026-05-02');
  });
});
