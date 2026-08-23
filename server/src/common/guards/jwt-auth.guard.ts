import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { IS_PUBLIC_KEY } from '../decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private reflector: Reflector,
    private redis: RedisService,
    private prisma: PrismaService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const result = await (super.canActivate(context) as Promise<boolean>);
    if (!result) return false;

    // Redis da bloklangan userni tekshirish.
    //
    // `id`, `sub` EMAS. Token'da da'vo `sub` deb ataladi, lekin passport
    // `request.user` ni `JwtStrategy.validate` QAYTARGAN qiymatga o'rnatadi,
    // u esa `{ id, roles, companyId, studentId? }` beradi. `sub` o'qilganda
    // qiymat doim `undefined` bo'lib, quyidagi tekshiruv umuman ishlamas edi:
    // SUSPENDED/TERMINATED qilingan xodim mavjud access token'i bilan uning
    // muddati tugagunicha (1 soat) ishlashda davom etardi.
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (userId) {
      await this.assertNotBlocked(userId);
    }

    return true;
  }

  /**
   * Redis is a fast NEGATIVE CACHE here, not the source of truth. Two things
   * follow from that, and both are load-bearing now that this check actually
   * runs on every authenticated request:
   *
   * 1. **A Redis failure must not deny anyone.** `RedisService extends Redis`,
   *    so `get()` REJECTS when the server is unreachable — an outage would
   *    otherwise turn into a 500 on every request in the system. The account's
   *    real state lives in Postgres and `AuthService.refresh` enforces it, so
   *    the worst a fail-open costs is the ≤1h window this cache exists to
   *    shorten. `TeachersService` already swallows Redis errors on the write
   *    side for the same reason.
   *
   * 2. **A key must not outlive the block it represents.** Only
   *    `TeachersService` maintains these keys; re-activating the same person
   *    through `UsersService` leaves the key behind, and a stale key would
   *    then lock out someone the database says is ACTIVE — a worse failure
   *    than the one being fixed. So a cache hit is CONFIRMED against the
   *    database before anyone is turned away, and a key the database
   *    contradicts is dropped.
   *
   * The confirming query only runs on a hit, i.e. approximately never.
   */
  private async assertNotBlocked(userId: number): Promise<void> {
    let cached: string | null = null;
    try {
      cached = await this.redis.get(`user:blocked:${userId}`);
    } catch (err) {
      this.logger.warn(
        `Blocked-user cache unavailable for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }
    if (!cached) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletedAt: true },
    });
    const reallyBlocked =
      !user ||
      user.deletedAt !== null ||
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.TERMINATED ||
      user.status === UserStatus.ARCHIVED;

    if (!reallyBlocked) {
      this.logger.warn(
        `Stale block key for user ${userId} (database says ${user.status}) — dropping it`,
      );
      await this.redis.del(`user:blocked:${userId}`).catch(() => undefined);
      return;
    }

    throw new ForbiddenException('Hisobingiz bloklangan');
  }
}
