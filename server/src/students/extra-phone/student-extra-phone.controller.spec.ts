import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators';
import { RolesGuard, StudentCardGuard } from '../../common/guards';
import { OwnPasswordAttemptGuard } from '../../common/guards/own-password-attempt.guard';
import { StudentExtraPhoneController } from './student-extra-phone.controller';

describe('StudentExtraPhoneController (ADR-0067)', () => {
  it('is Student-only, and refuses a token with no student card', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, StudentExtraPhoneController)).toEqual([
      'Student',
    ]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudentExtraPhoneController),
    ).toEqual([RolesGuard, StudentCardGuard]);
  });

  it('caps password attempts on the two routes that ask for it (ADR-0031)', () => {
    const p = StudentExtraPhoneController.prototype;
    expect(Reflect.getMetadata(GUARDS_METADATA, p.sendCode)).toEqual([
      OwnPasswordAttemptGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, p.remove)).toEqual([
      OwnPasswordAttemptGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, p.verify)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, p.status)).toBeUndefined();
  });

  it('takes the student from the token, never from the request', async () => {
    const service = {
      status: jest.fn().mockResolvedValue({}),
      sendCode: jest.fn().mockResolvedValue({}),
      verify: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
    };
    const controller = new StudentExtraPhoneController(service as any);

    await controller.status(10077);
    await controller.sendCode(10077, 20077, {
      phone: '935554433',
      currentPassword: 'x',
    });
    await controller.verify(10077, 20077, { code: '1234' });
    await controller.remove(10077, 20077, { currentPassword: 'x' });

    expect(service.status).toHaveBeenCalledWith(10077);
    expect(service.sendCode).toHaveBeenCalledWith(
      10077,
      20077,
      '935554433',
      'x',
    );
    expect(service.verify).toHaveBeenCalledWith(10077, 20077, '1234');
    expect(service.remove).toHaveBeenCalledWith(10077, 20077, 'x');
  });
});
