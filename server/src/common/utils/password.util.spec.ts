import { generatePassword } from './password.util';

/**
 * These passwords are handed to real accounts — every teacher, employee and
 * student created through the admin panel or the Telegram bot, and every
 * password reset the bot performs. Nothing forces a change on first login, so
 * whatever this returns is a live credential until the owner replaces it.
 */
describe('generatePassword', () => {
  const RUNS = 2000;
  const sample = Array.from({ length: RUNS }, () => generatePassword());

  it('is 8 characters from the look-alike-free alphabet', () => {
    // I/l/1 and O/0 are excluded so a password can be read aloud over the
    // phone or copied off a Telegram message without ambiguity.
    for (const p of sample) {
      expect(p).toHaveLength(8);
      expect(p).toMatch(
        /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]{8}$/,
      );
    }
  });

  it('always contains an upper, a lower and a digit', () => {
    for (const p of sample) {
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[2-9]/);
    }
  });

  it('does not park the guaranteed characters at fixed positions', () => {
    // The construction is "upper, lower, digit, then five free", so without a
    // shuffle position 0 would ALWAYS be uppercase and position 2 always a
    // digit. This catches a missing shuffle, not a subtly biased one — the
    // old `sort(() => Math.random() - 0.5)` passes it too. Fisher-Yates is
    // the reason the distribution is actually uniform; this only guards the
    // observable contract.
    const upperAtZero = sample.filter((p) => /[A-Z]/.test(p[0])).length / RUNS;
    expect(upperAtZero).toBeLessThan(0.55);
    const digitAtTwo = sample.filter((p) => /[2-9]/.test(p[2])).length / RUNS;
    expect(digitAtTwo).toBeLessThan(0.45);
  });

  it('does not repeat itself', () => {
    // A weak generator shows up here first: 2000 draws from a ~56^8 space
    // should collide never.
    expect(new Set(sample).size).toBe(RUNS);
  });

  it('spreads characters across the whole alphabet', () => {
    // Cheap smoke test for a generator stuck in a narrow range.
    const seen = new Set(sample.join('').split(''));
    expect(seen.size).toBeGreaterThan(40);
  });
});
