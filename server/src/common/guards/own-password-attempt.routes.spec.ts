import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Type } from '@nestjs/common';
import { UsersController } from '../../users/users.controller';
import { StudentPortalController } from '../../students/student-portal.controller';
import { StudentOnboardingController } from '../../students/onboarding/student-onboarding.controller';
import { StudentExtraPhoneController } from '../../students/extra-phone/student-extra-phone.controller';
import { routeAccess } from '../permissions/testing';
import { OwnPasswordAttemptGuard } from './own-password-attempt.guard';

/**
 * Every door that checks the caller's current password (ADR-0031). A new
 * one belongs in this list, or its password check can be brute-forced.
 */
const doors: Array<[string, Type<unknown>, string]> = [
  ['PATCH /users/password', UsersController, 'changePassword'],
  ['PATCH /users/phone', UsersController, 'changePhone'],
  ['PATCH /student-portal/password', StudentPortalController, 'changePassword'],
  [
    'POST /student-portal/onboarding/phone/change-code',
    StudentOnboardingController,
    'sendChangeCode',
  ],
  [
    'POST /student-portal/extra-phone/send-code',
    StudentExtraPhoneController,
    'sendCode',
  ],
  [
    'POST /student-portal/extra-phone/remove',
    StudentExtraPhoneController,
    'remove',
  ],
];

const handlerOf = (controller: Type<unknown>, method: string) =>
  (controller.prototype as Record<string, (...args: any[]) => unknown>)[method];

describe('current-password doors are rate-limited (ADR-0031)', () => {
  it.each(doors)(
    '%s carries OwnPasswordAttemptGuard',
    (_route, controller, method) => {
      const guards: unknown[] =
        Reflect.getMetadata(GUARDS_METADATA, handlerOf(controller, method)) ??
        [];
      expect(guards).toContain(OwnPasswordAttemptGuard);
    },
  );

  // The role check is the global `PermissionGuard`, which Nest runs before
  // any guard on the route itself — so a refused role spends no attempt, as
  // long as the door carries an access marker for it to read.
  it.each(doors)(
    '%s is gated by an access marker, so a refused role spends no attempt',
    (_route, controller, method) => {
      expect(['anyUser', 'anyStaff', 'student', 'can']).toContain(
        routeAccess(controller, method).kind,
      );
    },
  );
});
