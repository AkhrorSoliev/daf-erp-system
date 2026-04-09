import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockContext(roles: string[] | undefined, userRoles?: string[]) {
    const handler = jest.fn();
    const classRef = jest.fn();

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

    return {
      getHandler: () => handler,
      getClass: () => classRef,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles: userRoles } }),
      }),
    } as any;
  }

  it('should allow access when no @Roles metadata is set', () => {
    const ctx = mockContext(undefined, ['Teacher']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when user has a matching role', () => {
    const ctx = mockContext(['CEO', 'Administrator'], ['Administrator']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when user has one of multiple required roles', () => {
    const ctx = mockContext(['CEO', 'Branch Director', 'Administrator'], ['Branch Director']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException with Uzbek message when user lacks required role', () => {
    const ctx = mockContext(['CEO', 'Administrator'], ['Teacher']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow("Sizga bu amalni bajarishga ruxsat yo'q");
  });

  it('should throw ForbiddenException when user has no roles property', () => {
    const ctx = mockContext(['CEO'], undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user has empty roles array', () => {
    const ctx = mockContext(['CEO', 'Administrator'], []);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException for Cashier on admin-only endpoint', () => {
    const ctx = mockContext(['CEO', 'Branch Director', 'Administrator'], ['Cashier']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
