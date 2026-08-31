import { EMPLOYEE_DEEP_LINK_RE, VALID_ROLE_IDS } from './constants';
import {
  signEmployeePayload,
  verifyEmployeePayload,
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
 */
describe('employee deep-link payload — Telegram-deliverable', () => {
  const TELEGRAM_SAFE = /^[A-Za-z0-9_-]{1,64}$/;

  const roleCombinations: number[][] = [
    [4],
    [1, 2],
    [3, 4, 5],
    [...VALID_ROLE_IDS],
  ];

  it.each(roleCombinations)(
    'mints a base64url-only payload for roles %p',
    (...roleIds: number[]) => {
      const payload = signEmployeePayload(1, roleIds);
      expect(payload).toMatch(TELEGRAM_SAFE);
    },
  );

  it('never mints a payload longer than Telegram allows', () => {
    // Worst realistic case: every role, a wide branch id.
    const payload = signEmployeePayload(999999, [...VALID_ROLE_IDS]);
    expect(payload.length).toBeLessThanOrEqual(64);
  });

  it.each(roleCombinations)(
    'round-trips roles %p through the bot-side regex',
    (...roleIds: number[]) => {
      const payload = signEmployeePayload(7, roleIds);
      const match = payload.match(EMPLOYEE_DEEP_LINK_RE);
      expect(match).not.toBeNull();

      const branchId = Number(match![1]);
      const parsedRoles = match![2].split('-').map(Number);
      expect(branchId).toBe(7);
      expect(parsedRoles.sort((a, b) => a - b)).toEqual(
        [...roleIds].sort((a, b) => a - b),
      );
      expect(verifyEmployeePayload(branchId, parsedRoles, match![3])).toBe(
        true,
      );
    },
  );

  it('keeps already-issued single-role links valid (signed base unchanged)', () => {
    // Teacher links handed out before the separator change carry this exact
    // payload; changing how a role LIST is joined must not invalidate them.
    expect(signEmployeePayload(1, [4])).toMatch(/^employee_1_roles_4_sig_/);
  });

  it('rejects a tampered role list', () => {
    const payload = signEmployeePayload(1, [4, 5]);
    const match = payload.match(EMPLOYEE_DEEP_LINK_RE)!;
    // Attacker swaps in the CEO role but keeps the signature.
    expect(verifyEmployeePayload(1, [1, 4, 5], match[3])).toBe(false);
  });
});
