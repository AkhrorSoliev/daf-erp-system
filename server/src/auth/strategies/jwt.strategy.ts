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
  /** The session version the token was minted with (ADR-0030). */
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
    // A refresh token shares the secret but is valid at POST /auth/refresh
    // and nowhere else, where its session version is checked (ADR-0030).
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
