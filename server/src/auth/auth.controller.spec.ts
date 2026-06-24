import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { AuthController } from './auth.controller';

describe('AuthController — forgot-password endpoints', () => {
  const reflector = new Reflector();
  let controller: AuthController;
  const forgot = {
    requestCode: jest.fn().mockResolvedValue({ message: 'ok' }),
    verifyCode: jest.fn().mockResolvedValue({ resetToken: 'tok' }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'done' }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController({} as any, forgot as any);
  });

  it('marks all three forgot-password endpoints @Public()', () => {
    for (const method of [
      controller.forgotPasswordRequest,
      controller.forgotPasswordVerify,
      controller.forgotPasswordReset,
    ]) {
      expect(reflector.get<boolean>(IS_PUBLIC_KEY, method)).toBe(true);
    }
  });

  it('request → passes phone + client IP (x-forwarded-for) to the service', async () => {
    const req = { headers: { 'x-forwarded-for': '5.5.5.5, 1.1.1.1' }, ip: '9.9.9.9' };
    await controller.forgotPasswordRequest({ phone: '901234567' } as any, req);
    expect(forgot.requestCode).toHaveBeenCalledWith('901234567', '5.5.5.5');
  });

  it('request → falls back to req.ip when no forwarded header', async () => {
    const req = { headers: {}, ip: '9.9.9.9' };
    await controller.forgotPasswordRequest({ phone: '901234567' } as any, req);
    expect(forgot.requestCode).toHaveBeenCalledWith('901234567', '9.9.9.9');
  });

  it('verify → delegates phone + code', async () => {
    await controller.forgotPasswordVerify({ phone: '901234567', code: '1234' } as any);
    expect(forgot.verifyCode).toHaveBeenCalledWith('901234567', '1234');
  });

  it('reset → delegates token + new password', async () => {
    await controller.forgotPasswordReset({
      resetToken: 'tok',
      newPassword: 'newpass123',
    } as any);
    expect(forgot.resetPassword).toHaveBeenCalledWith('tok', 'newpass123');
  });
});
