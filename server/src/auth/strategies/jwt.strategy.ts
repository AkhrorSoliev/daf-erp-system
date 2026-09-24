import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { tokenSessionVersion } from '../../common/auth/session-version';

interface JwtPayload {
  sub: number;
  roles: string[];
  companyId: number;
  studentId?: number;
  /** The session version the token was minted with (ADR-0029). */
  sv?: unknown;
  /** Set on refresh tokens only. */
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: JwtPayload) {
    // A refresh token is signed with the same secret and lives 24 hours.
    // Accepted here, it worked as a day-long access token on every route
    // without @Roles. It is valid at POST /auth/refresh and nowhere else.
    if (payload.type === 'refresh') {
      throw new UnauthorizedException();
    }

    const sessionVersion = tokenSessionVersion(payload);
    if (sessionVersion === null) {
      throw new UnauthorizedException();
    }

    return {
      id: payload.sub,
      roles: payload.roles,
      companyId: payload.companyId,
      sessionVersion,
      ...(payload.studentId && { studentId: payload.studentId }),
    };
  }
}
