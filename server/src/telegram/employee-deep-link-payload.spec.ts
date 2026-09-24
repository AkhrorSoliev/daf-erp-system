import { EMPLOYEE_DEEP_LINK_RE, VALID_ROLE_IDS } from './constants';
import {
  checkEmployeePayload,
  signEmployeePayload,
} from './utils/signed-link.util';

/**
 * Telegram's `?start=` parameter accepts base64url ONLY — `A-Z a-z 0-9 _ -`,
 * up to 64 characters (https://core.telegram.org/api/links). A payload with
 * any other character is not rejected loudly: the client silently DROPS the
 * parameter and opens the bot with a bare `/start`, so the user lands on the
 * generic menu and the link looks like it "did nothing".
 *
 * That is exactly what a comma-joined role list did — single-role links worked,
 * every multi-role link failed. These tests pin the payload to the character
 * set Telegram will actually deliver.
 *
 * The payload also carries the moment it was minted, inside the signature,
 * and the bot refuses it three days later (ADR-0029). The time spends
 * characters from the same 64, and its field grows by one character in
 * December 2038, so the worst case is checked at a date past that too.
 */
describe('employee deep-link payload — Telegram-deliverable', () => {
  const TELEGRAM_SAFE = /^[A-Za-z0-9_-]{1,64}$/;
  const MINTED = new Date('2026-09-24T09:00:00Z');
  const FAR_FUTURE = new Date('2100-01-01T00:00:00Z');

  const roleCombinations: number[][] = [
    [4],
    [1, 2],
    [3, 4, 5],
    [...VALID_ROLE_IDS],
  ];

  /** What the bot reads out of a payload, split by the bot-side regex. */
  function parse(payload: string) {
    const match = payload.match(EMPLOYEE_DEEP_LINK_RE);
    if (!match) throw new Error(`Not a dated employee link: "${payload}"`);
    return {
      branchId: Number(match[1]),
      roleIds: match[2].split('-').map(Number),
      issuedAt: match[3],
      signature: match[4],
    };
  }

  it.each(roleCombinations)(
    'mints a base64url-only payload for roles %p',
    (...roleIds: number[]) => {
      const payload = signEmployeePayload(1, roleIds, MINTED);
      expect(payload).toMatch(TELEGRAM_SAFE);
    },
  );

  it.each([MINTED, FAR_FUTURE])(
    'never mints a payload longer than Telegram allows (minted %p)',
    (issuedAt: Date) => {
      // Worst realistic case: every role, a wide branch id.
      const payload = signEmployeePayload(
        999999,
        [...VALID_ROLE_IDS],
        issuedAt,
      );
      expect(payload).toMatch(TELEGRAM_SAFE);
      expect(payload.length).toBeLessThanOrEqual(64);
    },
  );

  it.each(roleCombinations)(
    'round-trips roles %p through the bot-side regex',
    (...roleIds: number[]) => {
      const link = parse(signEmployeePayload(7, roleIds, MINTED));

      expect(link.branchId).toBe(7);
      expect(link.roleIds.sort((a, b) => a - b)).toEqual(
        [...roleIds].sort((a, b) => a - b),
      );
      expect(
        checkEmployeePayload(
          link.branchId,
          link.roleIds,
          link.issuedAt,
          link.signature,
          MINTED,
        ),
      ).toBe('valid');
    },
  );

  describe('the signature covers every field', () => {
    it('rejects a tampered role list', () => {
      const link = parse(signEmployeePayload(1, [4, 5], MINTED));
      // Attacker swaps in the CEO role but keeps the signature.
      expect(
        checkEmployeePayload(
          1,
          [1, 4, 5],
          link.issuedAt,
          link.signature,
          MINTED,
        ),
      ).toBe('invalid');
    });

    it('rejects a link moved to another branch', () => {
      const link = parse(signEmployeePayload(1, [4], MINTED));
      expect(
        checkEmployeePayload(
          2,
          link.roleIds,
          link.issuedAt,
          link.signature,
          MINTED,
        ),
      ).toBe('invalid');
    });

    it('rejects an old link whose issue time was moved forward', () => {
      const old = parse(
        signEmployeePayload(1, [4], new Date('2026-09-01T09:00:00Z')),
      );
      const fresh = parse(signEmployeePayload(1, [4], MINTED));
      // Same branch and roles; only the time is borrowed from a fresh link.
      expect(
        checkEmployeePayload(1, [4], fresh.issuedAt, old.signature, MINTED),
      ).toBe('invalid');
    });

    it('checks the signature before the age: a forged old link is invalid, not expired', () => {
      const old = parse(
        signEmployeePayload(1, [4], new Date('2026-09-01T09:00:00Z')),
      );
      // A signature this server never produced; calling the link "expired"
      // would vouch for it.
      expect(
        checkEmployeePayload(1, [4], old.issuedAt, '0123456789abcdef', MINTED),
      ).toBe('invalid');
    });
  });

  describe('a link works for three days after it is minted', () => {
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

    const verdictAt = (msAfterMinting: number) => {
      const link = parse(signEmployeePayload(7, [4], MINTED));
      return checkEmployeePayload(
        link.branchId,
        link.roleIds,
        link.issuedAt,
        link.signature,
        new Date(MINTED.getTime() + msAfterMinting),
      );
    };

    it('accepts it the moment it is minted', () => {
      expect(verdictAt(0)).toBe('valid');
    });

    it('accepts it at exactly three days', () => {
      expect(verdictAt(THREE_DAYS_MS)).toBe('valid');
    });

    it('refuses it one second after three days', () => {
      expect(verdictAt(THREE_DAYS_MS + 1000)).toBe('expired');
    });

    it('refuses it a year later', () => {
      expect(verdictAt(365 * 24 * 60 * 60 * 1000)).toBe('expired');
    });
  });

  describe('a link dated ahead of the clock that opens it', () => {
    const SECOND_MS = 1000;
    const FIVE_MINUTES_MS = 5 * 60 * SECOND_MS;
    const HOUR_MS = 60 * 60 * SECOND_MS;
    const THREE_DAYS_MS = 3 * 24 * HOUR_MS;

    /** A link dated `datedAheadMs` after MINTED, opened `openedAfterMs` after it. */
    const verdict = (datedAheadMs: number, openedAfterMs: number) => {
      const link = parse(
        signEmployeePayload(7, [4], new Date(MINTED.getTime() + datedAheadMs)),
      );
      return checkEmployeePayload(
        link.branchId,
        link.roleIds,
        link.issuedAt,
        link.signature,
        new Date(MINTED.getTime() + openedAfterMs),
      );
    };

    it("accepts one dated five minutes ahead, room for two servers' clocks to disagree, and no further", () => {
      expect(verdict(FIVE_MINUTES_MS, 0)).toBe('valid');
      expect(verdict(FIVE_MINUTES_MS + SECOND_MS, 0)).toBe('invalid');
    });

    it('accepts one from a clock an hour fast for three days and five minutes, never longer', () => {
      // Refused until its time is five minutes away...
      expect(verdict(HOUR_MS, HOUR_MS - FIVE_MINUTES_MS - SECOND_MS)).toBe(
        'invalid',
      );
      expect(verdict(HOUR_MS, HOUR_MS - FIVE_MINUTES_MS)).toBe('valid');
      // ...and expired three days after the time it claims.
      expect(verdict(HOUR_MS, HOUR_MS + THREE_DAYS_MS)).toBe('valid');
      expect(verdict(HOUR_MS, HOUR_MS + THREE_DAYS_MS + SECOND_MS)).toBe(
        'expired',
      );
    });
  });
});
