import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UsersController } from '../../users/users.controller';
import { StudentPortalController } from '../../students/student-portal.controller';
import { RolesGuard } from './roles.guard';
import { OwnPasswordAttemptGuard } from './own-password-attempt.guard';

/**
 * Every door that checks the caller's current password (ADR-0031). A new
 * one belongs in this list, or its password check can be brute-forced.
 */
const doors: Array<[string, (...args: any[]) => unknown]> = [
  ['PATCH /users/password', UsersController.prototype.changePassword],
  ['PATCH /users/phone', UsersController.prototype.changePhone],
  [
    'PATCH /student-portal/password',
    StudentPortalController.prototype.changePassword,
  ],
];

describe('current-password doors are rate-limited (ADR-0031)', () => {
  it.each(doors)('%s carries OwnPasswordAttemptGuard', (_route, handler) => {
    const guards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
    expect(guards).toContain(OwnPasswordAttemptGuard);
  });

  it.each(doors)(
    '%s checks roles before counting, so a refused role spends no attempt',
    (_route, handler) => {
      const guards: unknown[] =
        Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
      const roles = guards.indexOf(RolesGuard);
      if (roles === -1) return; // no role restriction on this door
      expect(roles).toBeLessThan(guards.indexOf(OwnPasswordAttemptGuard));
    },
  );
});
