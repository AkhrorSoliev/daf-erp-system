import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { AuthController } from './auth.controller';
import { IpThrottlerGuard } from '../common/guards';

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

  it('request → passes phone + client IP (x-forwarded-for) + null roles (no origin)', async () => {
    const req = { headers: { 'x-forwarded-for': '5.5.5.5, 1.1.1.1' }, ip: '9.9.9.9' };
    await controller.forgotPasswordRequest({ phone: '901234567' } as any, req);
    expect(forgot.requestCode).toHaveBeenCalledWith('901234567', '5.5.5.5', null);
  });

  it('request → falls back to req.ip when no forwarded header', async () => {
    const req = { headers: {}, ip: '9.9.9.9' };
    await controller.forgotPasswordRequest({ phone: '901234567' } as any, req);
    expect(forgot.requestCode).toHaveBeenCalledWith('901234567', '9.9.9.9', null);
  });

  it('request → scopes to the portal roles from the Origin header', async () => {
    const req = {
      headers: { origin: 'https://admin.dafzentrum.uz' },
      ip: '9.9.9.9',
    };
    await controller.forgotPasswordRequest({ phone: '901234567' } as any, req);
    expect(forgot.requestCode).toHaveBeenCalledWith('901234567', '9.9.9.9', [
      1, 2, 3, 5,
    ]);
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

describe('AuthController — rate limiting (F-3)', () => {
  // @UseGuards stores its guards under the '__guards__' metadata key.
  const guardsOf = (method: (...args: any[]) => unknown): unknown[] =>
    (Reflect.getMetadata('__guards__', method) as unknown[]) ?? [];

  it('protects /auth/login with IpThrottlerGuard (before local auth)', () => {
    const guards = guardsOf(AuthController.prototype.login);
    expect(guards[0]).toBe(IpThrottlerGuard); // must run first so failed attempts count
  });

  it('protects /auth/refresh with IpThrottlerGuard', () => {
    const guards = guardsOf(AuthController.prototype.refresh);
    expect(guards).toContain(IpThrottlerGuard);
  });
});

describe('IpThrottlerGuard.getTracker', () => {
  // getTracker doesn't use `this`, so we can exercise it off a bare prototype
  // instance without constructing the full ThrottlerGuard dependency graph.
  const guard = Object.create(IpThrottlerGuard.prototype) as any;
  const track = (req: unknown): Promise<string> => guard.getTracker(req);

  it('uses the first x-forwarded-for hop (real client behind the proxy)', async () => {
    await expect(
      track({ headers: { 'x-forwarded-for': '5.5.5.5, 1.1.1.1' }, ip: '9.9.9.9' }),
    ).resolves.toBe('5.5.5.5');
  });

  it('falls back to req.ip when there is no forwarded header', async () => {
    await expect(track({ headers: {}, ip: '9.9.9.9' })).resolves.toBe('9.9.9.9');
  });
});
