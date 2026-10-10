import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StudentCardGuard } from '../../common/guards';
import { OwnPasswordAttemptGuard } from '../../common/guards/own-password-attempt.guard';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { StudentOnboardingController } from './student-onboarding.controller';

describe('StudentOnboardingController', () => {
  it('is Student-only, and refuses a token with no student card', () => {
    for (const method of [
      'status',
      'updateProfile',
      'sendPhoneCode',
      'sendChangeCode',
      'verifyPhoneCode',
    ]) {
      expect(routeAccess(StudentOnboardingController, method)).toEqual({
        kind: 'student',
      });
      expect(defaultRolesOf(StudentOnboardingController, method)).toEqual([
        'Student',
      ]);
    }
    // The global PermissionGuard runs before this one, so a staff token gets
    // 403 before the card check.
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudentOnboardingController),
    ).toEqual([StudentCardGuard]);
  });

  it('caps password attempts on the one route that asks for it (ADR-0031)', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        StudentOnboardingController.prototype.sendChangeCode,
      ),
    ).toEqual([OwnPasswordAttemptGuard]);
    // The card-number path asks for no password, so it spends no attempt.
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        StudentOnboardingController.prototype.sendPhoneCode,
      ),
    ).toBeUndefined();
  });

  it('takes the student from the token, never from the request', async () => {
    const onboarding = {
      status: jest.fn().mockResolvedValue({}),
      updateProfile: jest.fn().mockResolvedValue({}),
      sendPhoneCode: jest.fn().mockResolvedValue({}),
      sendChangeCode: jest.fn().mockResolvedValue({}),
      verifyPhoneCode: jest.fn().mockResolvedValue({}),
    };
    const controller = new StudentOnboardingController(onboarding as any);

    await controller.status(10077);
    await controller.updateProfile(10077, 20077, { gender: 'MALE' });
    await controller.sendPhoneCode(10077);
    await controller.sendChangeCode(10077, 20077, {
      phone: '935554433',
      currentPassword: 'x',
    });
    await controller.verifyPhoneCode(10077, 20077, { code: '1234' });

    expect(onboarding.status).toHaveBeenCalledWith(10077);
    expect(onboarding.updateProfile).toHaveBeenCalledWith(10077, 20077, {
      gender: 'MALE',
    });
    expect(onboarding.sendPhoneCode).toHaveBeenCalledWith(10077);
    expect(onboarding.sendChangeCode).toHaveBeenCalledWith(
      10077,
      20077,
      '935554433',
      'x',
    );
    expect(onboarding.verifyPhoneCode).toHaveBeenCalledWith(
      10077,
      20077,
      '1234',
    );
  });
});
