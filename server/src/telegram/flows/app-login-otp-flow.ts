import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Link-based native app login (no code re-entry).
 * The app opens t.me/<bot>?start=req_<requestId>; the student taps START → the
 * bot approves the request (links it to their account); the app polls until
 * approved and logs in automatically. Single-use, short-lived.
 */
const REQUEST_TTL_SEC = 3 * 60;
const requestKey = (requestId: string) => `app_login_req:${requestId}`;

export type ApproveResult =
  | { ok: true; firstName: string }
  | { ok: false; reason: 'not_found' | 'no_account' };

/** Bot side: approve a pending app-login request for the student linked to this chat. */
export async function approveLoginRequest(
  prisma: PrismaService,
  redis: RedisService,
  chatId: string,
  requestId: string,
): Promise<ApproveResult> {
  const student = await prisma.student.findFirst({
    where: { telegramChatId: chatId, deletedAt: null },
    select: { firstName: true, userId: true },
  });
  if (!student) return { ok: false, reason: 'not_found' };
  if (!student.userId) return { ok: false, reason: 'no_account' };

  await redis.set(
    requestKey(requestId),
    String(student.userId),
    'EX',
    REQUEST_TTL_SEC,
  );
  return { ok: true, firstName: student.firstName };
}

/** App-poll side: consume an approved request → userId (single use). null if not yet approved. */
export async function consumeLoginRequest(
  redis: RedisService,
  requestId: string,
): Promise<number | null> {
  const key = requestKey(requestId.trim());
  const userId = await redis.get(key);
  if (!userId) return null;
  await redis.del(key);
  const parsed = parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
