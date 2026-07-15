import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { resolveAllowedRoleIds } from '../portal-roles.config';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    // passReqToCallback lets us read the portal (Origin / X-Portal) so the
    // phone-based lookup is scoped to the roles that portal allows.
    super({ usernameField: 'login', passReqToCallback: true });
  }

  async validate(req: Request, login: string, password: string) {
    const origin = req.headers['origin'] as string | undefined;
    const portal = req.headers['x-portal'] as string | undefined;
    const allowedRoleIds = resolveAllowedRoleIds(origin, portal);

    const user = await this.authService.validateUser(
      login,
      password,
      allowedRoleIds,
    );
    if (!user) {
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }
    return user;
  }
}
