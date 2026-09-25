import { createHmac, timingSafeEqual } from 'crypto';

const SIGNATURE_LENGTH = 16;

/**
 * Telegram delivers a `?start=` parameter only when it is base64url —
 * `A-Z a-z 0-9 _ -`, max 64 chars (https://core.telegram.org/api/links).
 * A comma is NOT in that set: the client silently drops the whole parameter,
 * the bot sees a bare `/start`, and the link appears to do nothing. That is
 * why role ids are joined with `-` and never with `,`.
 */
const ROLE_SEPARATOR = '-';

/**
 * How long a registration link can be opened after it is minted (ADR-0029):
 * three days, the lifetime the ADR-0022 stage-2 design gives its personal
 * one-time links (docs/superpowers/specs/2026-09-19-xodim-hisobi-va-telegram-design.md).
 * A link opens a working staff account for whoever holds it, so one pasted
 * into a chat or printed as a QR code must not stay an account-maker for good.
 */
const EMPLOYEE_LINK_TTL_SECONDS = 3 * 24 * 60 * 60;

/**
 * How far ahead of the opening server's clock a link may be dated and still
 * be accepted: room for two servers' clocks to disagree. A link dated further
 * ahead is refused until its time comes, so however wrong the minting clock
 * was, no link is accepted for more than three days and five minutes in all.
 */
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

/**
 * The signed part of the payload. The issue time is whole seconds since 1970
 * in base36: six characters until December 2038, seven after.
 */
function buildBase(
  branchId: number,
  roleIds: number[],
  issuedAtSeconds: number,
): string {
  const sortedRoles = [...roleIds].sort((a, b) => a - b).join(ROLE_SEPARATOR);
  return `employee_${branchId}_roles_${sortedRoles}_t_${issuedAtSeconds.toString(36)}`;
}

function getSecret(): string {
  const secret = process.env.TELEGRAM_LINK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('TELEGRAM_LINK_SECRET env var is required in production');
    }
    return 'dev-telegram-link-secret';
  }
  return secret;
}

function sign(base: string): string {
  return createHmac('sha256', getSecret())
    .update(base)
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
}

/**
 * The `?start=` payload of a staff-registration link:
 * `employee_<branch>_roles_<ids>_t_<issued>_sig_<hmac>`. The issue time is
 * inside the signed part, so moving it forward breaks the signature instead
 * of reviving an old link. The worst case (branch 999999, all five roles,
 * a date past 2038) is 62 characters.
 */
export function signEmployeePayload(
  branchId: number,
  roleIds: number[],
  issuedAt: Date,
): string {
  const base = buildBase(
    branchId,
    roleIds,
    Math.floor(issuedAt.getTime() / 1000),
  );
  return `${base}_sig_${sign(base)}`;
}

/** What the bot may do with an employee link. */
export type EmployeeLinkVerdict = 'valid' | 'expired' | 'invalid';

/**
 * The only way to accept an employee link. The signature and the age are
 * checked in one call, so no caller can accept a link on its signature alone
 * (ADR-0029). The signature comes first: "expired" is only ever said about a
 * link this server signed.
 *
 * Returns a verdict, not a boolean: every value is a non-empty string and so
 * truthy. Compare it to `'valid'`; never use it as a condition.
 *
 * `issuedAt` and `providedSig` are the fields exactly as they appear in the
 * link.
 */
export function checkEmployeePayload(
  branchId: number,
  roleIds: number[],
  issuedAt: string,
  providedSig: string,
  now: Date,
): EmployeeLinkVerdict {
  if (
    !/^[0-9a-f]+$/i.test(providedSig) ||
    providedSig.length !== SIGNATURE_LENGTH
  ) {
    return 'invalid';
  }
  if (!/^[0-9a-z]+$/i.test(issuedAt)) return 'invalid';
  const issuedAtSeconds = parseInt(issuedAt, 36);
  if (!Number.isSafeInteger(issuedAtSeconds)) return 'invalid';

  const expected = sign(buildBase(branchId, roleIds, issuedAtSeconds));
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(providedSig.toLowerCase(), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'invalid';

  const ageSeconds = Math.floor(now.getTime() / 1000) - issuedAtSeconds;
  if (ageSeconds < -MAX_CLOCK_SKEW_SECONDS) return 'invalid';
  if (ageSeconds > EMPLOYEE_LINK_TTL_SECONDS) return 'expired';
  return 'valid';
}
