import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export const OWN_PASSWORD_ATTEMPT_LIMIT = 5;
export const OWN_PASSWORD_ATTEMPT_WINDOW_SEC = 15 * 60;
export const OWN_PASSWORD_ATTEMPTS_MESSAGE =
  "Joriy parol juda ko'p marta kiritildi. 15 daqiqadan keyin qayta urinib ko'ring";

const attemptKey = (userId: number) => `own-password-check:${userId}`;

/**
 * Caps how often a signed-in caller may submit their current password
 * (ADR-0031). Every door that checks it — `PATCH /users/password`,
 * `PATCH /users/phone`, `PATCH /student-portal/password` — shares one counter
 * per account.
 *
 * A password check that can be retried without limit can be guessed; the
 * cap is what keeps "asks for the current password" meaningful.
 *
 * Every attempt counts, not only failures: the guard runs before the handler
 * and cannot see the result, and people change these a few times a year. The
 * window restarts on each attempt (the pattern `ForgotPasswordService.hit`
 * uses), so the key can never be left without a TTL.
 *
 * Redis down → allowed and logged, the stance `JwtAuthGuard` takes for its
 * blocked-user cache: an outage must not lock everyone out of their own
 * settings, and the password check itself still runs.
 */
@Injectable()
export class OwnPasswordAttemptGuard implements CanActivate {
  private readonly logger = new Logger(OwnPasswordAttemptGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: number | undefined = request.user?.id;
    if (userId == null) {
      throw new ForbiddenException('Foydalanuvchi aniqlanmadi');
    }

    let attempts: number;
    try {
      attempts = await this.redis.incr(attemptKey(userId));
      await this.redis.expire(
        attemptKey(userId),
        OWN_PASSWORD_ATTEMPT_WINDOW_SEC,
      );
    } catch (err) {
      this.logger.warn(
        `Own-password attempt counter unavailable for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return true;
    }

    if (attempts > OWN_PASSWORD_ATTEMPT_LIMIT) {
      throw new HttpException(
        OWN_PASSWORD_ATTEMPTS_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
