import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { RedisService } from '../../redis/redis.service';
import { IS_PUBLIC_KEY } from '../decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
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
      const isBlocked = await this.redis.get(`user:blocked:${userId}`);
      if (isBlocked) {
        throw new ForbiddenException('Hisobingiz bloklangan');
      }
    }

    return true;
  }
}
