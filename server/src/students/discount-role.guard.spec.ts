import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DiscountRoleGuard } from './discount-role.guard';

function contextFor(
  body: Record<string, unknown> | undefined,
  roles: string[] | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body, user: { roles } }) }),
  } as unknown as ExecutionContext;
}

describe('DiscountRoleGuard', () => {
  const guard = new DiscountRoleGuard();

  describe('lets ordinary edits through untouched', () => {
    it('allows a payload with no discount field, whatever the role', () => {
      expect(
        guard.canActivate(contextFor({ firstName: 'Aziz' }, ['Administrator'])),
      ).toBe(true);
      expect(
        guard.canActivate(contextFor({ firstName: 'Aziz' }, ['Cashier'])),
      ).toBe(true);
      expect(guard.canActivate(contextFor({ firstName: 'Aziz' }, []))).toBe(
        true,
      );
    });

    it('allows a request with no body at all', () => {
      expect(guard.canActivate(contextFor(undefined, ['Administrator']))).toBe(
        true,
      );
    });
  });

  describe('guards the discount field', () => {
    it.each(['CEO', 'Branch Director'])('allows %s', (role) => {
      expect(
        guard.canActivate(contextFor({ discountPercent: 20 }, [role])),
      ).toBe(true);
    });

    it.each(['Administrator', 'Cashier', 'Teacher'])('refuses %s', (role) => {
      expect(() =>
        guard.canActivate(contextFor({ discountPercent: 20 }, [role])),
      ).toThrow(ForbiddenException);
    });

    it('refuses a caller whose token carries no roles', () => {
      expect(() =>
        guard.canActivate(contextFor({ discountPercent: 20 }, undefined)),
      ).toThrow(ForbiddenException);
    });

    it('allows a caller holding the right role among several', () => {
      expect(
        guard.canActivate(
          contextFor({ discountPercent: 20 }, ['Cashier', 'CEO']),
        ),
      ).toBe(true);
    });
  });

  describe('presence, not change', () => {
    it('refuses discount 0 — zero is a value, and setting it is a retroactive rewrite', () => {
      expect(() =>
        guard.canActivate(
          contextFor({ discountPercent: 0 }, ['Administrator']),
        ),
      ).toThrow(ForbiddenException);
    });

    it('refuses null — an explicit clear is still a change', () => {
      expect(() =>
        guard.canActivate(
          contextFor({ discountPercent: null }, ['Administrator']),
        ),
      ).toThrow(ForbiddenException);
    });
  });
});
