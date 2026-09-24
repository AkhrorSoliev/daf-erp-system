import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  const strategy = new JwtStrategy({
    get: () => 'test-secret-at-least-16-chars',
  } as never);

  it('puts the session version on request.user', () => {
    expect(
      strategy.validate({ sub: 7, roles: ['Teacher'], companyId: 1001, sv: 4 }),
    ).toEqual({
      id: 7,
      roles: ['Teacher'],
      companyId: 1001,
      sessionVersion: 4,
    });
  });

  it('counts a pre-deploy token without sv as version 0', () => {
    expect(
      strategy.validate({ sub: 7, roles: ['Teacher'], companyId: 1001 })
        .sessionVersion,
    ).toBe(0);
  });

  it('keeps the studentId of a student token', () => {
    expect(
      strategy.validate({
        sub: 8,
        roles: ['Student'],
        companyId: 1001,
        studentId: 10001,
        sv: 0,
      }),
    ).toMatchObject({ studentId: 10001 });
  });

  it('refuses a refresh token presented as an access token', () => {
    // It shares the secret, but only POST /auth/refresh may accept it
    // (ADR-0030).
    expect(() =>
      strategy.validate({ sub: 7, type: 'refresh', sv: 0 } as never),
    ).toThrow(UnauthorizedException);
  });

  it('refuses a malformed session version', () => {
    expect(() =>
      strategy.validate({
        sub: 7,
        roles: [],
        companyId: 1001,
        sv: 'x',
      } as never),
    ).toThrow(UnauthorizedException);
  });
});
