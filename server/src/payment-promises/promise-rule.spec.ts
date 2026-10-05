import {
  PROMISE_DATE_REFUSAL,
  PROMISE_MONTH_REFUSAL,
  promiseDateRange,
  promiseDayEnd,
  promiseRefusal,
} from './promise-rule';

const NOW = new Date('2026-10-14T07:00:00Z'); // 14.10.2026 12:00 Tashkent

describe('promise rule (ADR-0072)', () => {
  it('a new promise (nothing this month) may name today … today + 7, nothing else', () => {
    expect(promiseDateRange(NOW, null, 'create')).toEqual({
      from: '2026-10-14',
      to: '2026-10-21',
    });
    expect(promiseRefusal(NOW, null, 'create', '2026-10-14')).toBeNull();
    expect(promiseRefusal(NOW, null, 'create', '2026-10-21')).toBeNull();
    expect(promiseRefusal(NOW, null, 'create', '2026-10-22')).toBe(
      PROMISE_DATE_REFUSAL,
    );
    expect(promiseRefusal(NOW, null, 'create', '2026-10-13')).toBe(
      PROMISE_DATE_REFUSAL,
    );
  });

  it('a second promise in the month is refused, whatever happened to the first', () => {
    for (const status of ['KEPT', 'BROKEN', 'CANCELLED', 'OPEN']) {
      const p = { status, createdAt: new Date('2026-10-02T06:00:00Z') };
      expect(promiseRefusal(NOW, p, 'create', '2026-10-15')).toBe(
        PROMISE_MONTH_REFUSAL,
      );
    }
  });

  it("moving this month's OPEN promise stays within 7 days of its creation day", () => {
    const p = { status: 'OPEN', createdAt: new Date('2026-10-10T06:00:00Z') };
    expect(promiseDateRange(NOW, p, 'upsert')).toEqual({
      from: '2026-10-14',
      to: '2026-10-17',
    });
    expect(promiseRefusal(NOW, p, 'upsert', '2026-10-17')).toBeNull();
    expect(promiseRefusal(NOW, p, 'upsert', '2026-10-18')).toBe(
      PROMISE_DATE_REFUSAL,
    );
  });

  it('a month whose promise is no longer OPEN takes no other, even by upsert', () => {
    const p = { status: 'BROKEN', createdAt: new Date('2026-10-10T06:00:00Z') };
    expect(promiseRefusal(NOW, p, 'upsert', '2026-10-15')).toBe(
      PROMISE_MONTH_REFUSAL,
    );
  });

  describe('Tashkent days, 00:00–05:00 included', () => {
    const EARLY = new Date('2026-10-31T20:30:00Z'); // 01.11 01:30 in Tashkent; UTC still says 31.10

    it('today is the Tashkent day: 31.10 is already yesterday', () => {
      expect(promiseDateRange(EARLY, null, 'create')).toEqual({
        from: '2026-11-01',
        to: '2026-11-08',
      });
      expect(promiseRefusal(EARLY, null, 'create', '2026-10-31')).toBe(
        PROMISE_DATE_REFUSAL,
      );
    });

    it("an end-of-day instant (the call dialog's 23:59 Tashkent) is read as its Tashkent day", () => {
      expect(
        promiseRefusal(EARLY, null, 'create', '2026-11-08T18:59:59.000Z'),
      ).toBeNull();
      expect(
        promiseRefusal(EARLY, null, 'create', '2026-11-08T19:00:00.000Z'),
      ).toBe(PROMISE_DATE_REFUSAL); // 09.11 00:00
    });

    it('the creation day of a promise written at 00:30 Tashkent is that Tashkent day', () => {
      const p = { status: 'OPEN', createdAt: new Date('2026-11-01T19:30:00Z') }; // 02.11 00:30
      expect(
        promiseDateRange(new Date('2026-11-03T07:00:00Z'), p, 'upsert'),
      ).toEqual({ from: '2026-11-03', to: '2026-11-09' });
    });
  });

  describe('promiseDayEnd — one stored instant per Tashkent day', () => {
    const END_OF_14_10 = new Date('2026-10-14T18:59:59.999Z'); // 14.10 23:59:59.999 Tashkent

    it("every writer's form of 14.10 is stored as the last millisecond of 14.10 Tashkent", () => {
      for (const sent of [
        '2026-10-14', // payment dialog — 00:00 UTC, 05:00 Tashkent
        '2026-10-14T18:00:00.000Z', // debt drawer and call dialog — 23:00 Tashkent
        '2026-10-14T18:59:59.000Z', // the old call dialog — 23:59:59 Tashkent
        '2026-10-13T19:00:00.000Z', // 00:00 Tashkent
      ]) {
        expect(promiseDayEnd(sent)).toEqual(END_OF_14_10);
      }
    });

    it('is idempotent, so a second run of the data script changes nothing', () => {
      expect(promiseDayEnd(promiseDayEnd('2026-10-14'))).toEqual(END_OF_14_10);
    });
  });
});
