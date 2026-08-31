import { createHmac, timingSafeEqual } from 'crypto';

const SIGNATURE_LENGTH = 16;

/**
 * Telegram delivers a `?start=` parameter only when it is base64url —
 * `A-Z a-z 0-9 _ -`, max 64 chars (https://core.telegram.org/api/links).
 * A comma is NOT in that set: the client silently drops the whole parameter,
 * the bot sees a bare `/start`, and the link appears to do nothing. That is
 * why role ids are joined with `-` and never with `,`.
 *
 * A single-role payload is unaffected by the join, so teacher links issued
 * before this change stay valid.
 */
const ROLE_SEPARATOR = '-';

function buildBase(branchId: number, roleIds: number[]): string {
  const sortedRoles = [...roleIds].sort((a, b) => a - b).join(ROLE_SEPARATOR);
  return `employee_${branchId}_roles_${sortedRoles}`;
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

export function signEmployeePayload(
  branchId: number,
  roleIds: number[],
): string {
  const base = buildBase(branchId, roleIds);
  const sig = createHmac('sha256', getSecret())
    .update(base)
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
  return `${base}_sig_${sig}`;
}

export function verifyEmployeePayload(
  branchId: number,
  roleIds: number[],
  providedSig: string,
): boolean {
  if (
    !/^[0-9a-f]+$/i.test(providedSig) ||
    providedSig.length !== SIGNATURE_LENGTH
  ) {
    return false;
  }
  const base = buildBase(branchId, roleIds);
  const expected = createHmac('sha256', getSecret())
    .update(base)
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(providedSig.toLowerCase(), 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
