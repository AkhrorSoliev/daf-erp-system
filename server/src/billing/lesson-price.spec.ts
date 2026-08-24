import {
  baseLessonPrice,
  cycleCostFor,
  lessonPriceAt,
  lessonsAffordable,
} from './lesson-price';

/**
 * The property that matters is the closing one: a cycle must cost its price,
 * whatever the price is. Everything else here exists to pin the behaviour that
 * makes that true without surprising anyone reading a receipt.
 */
describe('lesson-price', () => {
  // The two shapes actually in production: one rounds down, one rounds up.
  const ROUNDS_DOWN = { price: 400_000, count: 12 }; // 33 333.33 → old 33 333
  const ROUNDS_UP = { price: 500_000, count: 12 }; // 41 666.67 → old 41 667

  const cycle = (price: number, count: number) =>
    Array.from({ length: count }, (_, i) => lessonPriceAt(price, count, i));

  describe('a cycle costs exactly its price', () => {
    it.each([
      ['400 000 / 12 (old total was 399 996)', 400_000, 12],
      ['500 000 / 12 (old total was 500 004)', 500_000, 12],
      ['550 000 / 12', 550_000, 12],
      ['690 000 / 20 (already divisible)', 690_000, 20],
      ['450 000 / 12 (already divisible)', 450_000, 12],
      ['1 so`m / 3 — degenerate but must still close', 1, 3],
      ['single-lesson course', 33_333, 1],
    ])('%s', (_label, price, count) => {
      expect(cycle(price, count).reduce((a, b) => a + b, 0)).toBe(price);
    });
  });

  it('spreads the remainder onto the LAST lesson, leaving the rest untouched', () => {
    // The user-facing promise: 11 lessons at the familiar figure, one that
    // absorbs the difference. Nobody's first eleven receipts change.
    const prices = cycle(ROUNDS_DOWN.price, ROUNDS_DOWN.count);
    expect(prices.slice(0, 11)).toEqual(Array(11).fill(33_333));
    expect(prices[11]).toBe(33_337);
  });

  it('takes the remainder OFF the last lesson when the price rounds up', () => {
    // 500 000 / 12: the old rule charged 41 667 twelve times = 500 004, i.e. it
    // OVERCHARGED — the direction that manufactured tiny debts (#10048 owed
    // 12 so'm this way, three cycles of 4).
    const prices = cycle(ROUNDS_UP.price, ROUNDS_UP.count);
    expect(prices.slice(0, 11)).toEqual(Array(11).fill(41_667));
    expect(prices[11]).toBe(41_663);
    expect(prices.reduce((a, b) => a + b, 0)).toBe(500_000);
  });

  it('keeps every non-final lesson at the price it has always been', () => {
    // Existing receipts must not move. Only the settling lesson is new.
    for (const { price, count } of [ROUNDS_DOWN, ROUNDS_UP]) {
      const base = baseLessonPrice(price, count);
      expect(base).toBe(Math.round(price / count));
      for (let i = 0; i < count - 1; i++) {
        expect(lessonPriceAt(price, count, i)).toBe(base);
      }
    }
  });

  it('wraps the index so one ever-growing counter keeps working', () => {
    // Lesson 12 of a 12-lesson course is lesson 0 of the next cycle. Callers
    // increment a single counter and never have to reset it themselves.
    const { price, count } = ROUNDS_DOWN;
    expect(lessonPriceAt(price, count, 12)).toBe(
      lessonPriceAt(price, count, 0),
    );
    expect(lessonPriceAt(price, count, 23)).toBe(
      lessonPriceAt(price, count, 11),
    );
    expect(lessonPriceAt(price, count, -1)).toBe(
      lessonPriceAt(price, count, count - 1),
    );
  });

  describe('degenerate input returns 0 rather than NaN/Infinity', () => {
    it.each([
      ['zero lessons', 400_000, 0],
      ['negative lessons', 400_000, -12],
      ['free course', 0, 12],
      ['negative price', -400_000, 12],
    ])('%s', (_l, price, count) => {
      expect(lessonPriceAt(price, count, 0)).toBe(0);
      expect(baseLessonPrice(price, count)).toBe(0);
      expect(cycleCostFor(price, count, 3)).toBe(0);
      expect(lessonsAffordable(price, count, 100_000)).toBe(0);
    });
  });

  describe('cycleCostFor', () => {
    it('clamps beyond a cycle instead of extrapolating', () => {
      const { price, count } = ROUNDS_DOWN;
      expect(cycleCostFor(price, count, count)).toBe(price);
      // Lesson 13 belongs to the NEXT cycle and starts its own count, so this
      // must not report 433 333.
      expect(cycleCostFor(price, count, count + 5)).toBe(price);
      expect(cycleCostFor(price, count, -3)).toBe(0);
    });

    it('is the running total of the per-lesson prices', () => {
      const { price, count } = ROUNDS_UP;
      let running = 0;
      for (let i = 0; i < count; i++) {
        running += lessonPriceAt(price, count, i);
        expect(cycleCostFor(price, count, i + 1)).toBe(running);
      }
    });
  });

  describe('lessonsAffordable', () => {
    it('never picks a count the budget cannot actually pay for', () => {
      const { price, count } = ROUNDS_DOWN;
      // Non-final lessons keep the old linear price, so the old answer stands.
      expect(lessonsAffordable(price, count, 99_999)).toBe(3);
      // The final lesson is the one that can overdraw: 11 lessons cost 366 663
      // and the 12th costs 33 337, so 399 999 buys eleven, not twelve.
      expect(lessonsAffordable(price, count, 399_999)).toBe(11);
      expect(cycleCostFor(price, count, 11)).toBeLessThanOrEqual(399_999);
      expect(lessonsAffordable(price, count, 400_000)).toBe(12);
    });

    it('holds the invariant across every budget in a cycle', () => {
      for (const { price, count } of [ROUNDS_DOWN, ROUNDS_UP]) {
        for (let budget = 0; budget <= price; budget += 997) {
          const n = lessonsAffordable(price, count, budget);
          expect(cycleCostFor(price, count, n)).toBeLessThanOrEqual(budget);
          if (n < count) {
            expect(cycleCostFor(price, count, n + 1)).toBeGreaterThan(budget);
          }
        }
      }
    });

    it('caps at one cycle — a fuller balance is the full-cycle branch`s job', () => {
      const { price, count } = ROUNDS_DOWN;
      expect(lessonsAffordable(price, count, price * 3)).toBe(count);
    });
  });
});
