import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { StudentCardGuard } from './student-card.guard';

describe('StudentCardGuard', () => {
  const guard = new StudentCardGuard();

  function contextFor(user: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('lets a token with a studentId through', () => {
    expect(
      guard.canActivate(contextFor({ roles: ['Student'], studentId: 10500 })),
    ).toBe(true);
  });

  it('refuses a token without studentId with 404 "Talaba topilmadi"', () => {
    const run = () => guard.canActivate(contextFor({ roles: ['Student'] }));

    expect(run).toThrow(NotFoundException);
    expect(run).toThrow('Talaba topilmadi');
  });

  it('refuses a request with no user at all', () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      NotFoundException,
    );
  });

  // Anything but a positive integer would reach Prisma as a filter that
  // matches nothing or, worse, is dropped — refuse it the same way.
  it.each([0, -1, 1.5, null, '10500', Number.NaN])(
    'refuses studentId %p',
    (studentId) => {
      expect(() =>
        guard.canActivate(contextFor({ roles: ['Student'], studentId })),
      ).toThrow(NotFoundException);
    },
  );
});
