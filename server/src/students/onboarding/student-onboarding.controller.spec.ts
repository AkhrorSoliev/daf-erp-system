import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators';
import { RolesGuard, StudentCardGuard } from '../../common/guards';
import { StudentOnboardingController } from './student-onboarding.controller';

describe('StudentOnboardingController', () => {
  it('is Student-only, and refuses a token with no student card', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, StudentOnboardingController)).toEqual([
      'Student',
    ]);
    // RolesGuard first, so a staff token gets 403 before the card check.
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudentOnboardingController),
    ).toEqual([RolesGuard, StudentCardGuard]);
  });

  it('takes the student from the token, never from the request', async () => {
    const onboarding = {
      status: jest.fn().mockResolvedValue({}),
      updateProfile: jest.fn().mockResolvedValue({}),
      sendPhoneCode: jest.fn().mockResolvedValue({}),
      verifyPhoneCode: jest.fn().mockResolvedValue({}),
    };
    const controller = new StudentOnboardingController(onboarding as any);

    await controller.status(10077);
    await controller.updateProfile(10077, 20077, { gender: 'MALE' });
    await controller.sendPhoneCode(10077);
    await controller.verifyPhoneCode(10077, 20077, { code: '1234' });

    expect(onboarding.status).toHaveBeenCalledWith(10077);
    expect(onboarding.updateProfile).toHaveBeenCalledWith(10077, 20077, {
      gender: 'MALE',
    });
    expect(onboarding.sendPhoneCode).toHaveBeenCalledWith(10077);
    expect(onboarding.verifyPhoneCode).toHaveBeenCalledWith(
      10077,
      20077,
      '1234',
    );
  });
});
