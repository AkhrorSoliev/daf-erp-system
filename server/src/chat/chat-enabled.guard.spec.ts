import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ChatEnabledGuard, ChatGateOpen } from './chat-enabled.guard';

class Probe {
  closed() {}
  @ChatGateOpen()
  open() {}
}

function ctx(method: 'closed' | 'open', user: object = { companyId: 7 }) {
  return {
    getHandler: () => Probe.prototype[method],
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

function make(enabled: boolean) {
  const settings = { get: jest.fn().mockResolvedValue(enabled) };
  const guard = new ChatEnabledGuard(settings as never, new Reflector());
  return { guard, settings };
}

describe('ChatEnabledGuard', () => {
  it('refuses with the chat-off text while the switch is off', async () => {
    const { guard } = make(false);
    const err = await guard.canActivate(ctx('closed')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).message).toBe(
      'Chat hozircha ochilmagan',
    );
  });

  it('allows the request while the switch is on, reading the company of the request user', async () => {
    const { guard, settings } = make(true);
    await expect(guard.canActivate(ctx('closed'))).resolves.toBe(true);
    expect(settings.get).toHaveBeenCalledWith(7, 'chat.enabled');
  });

  it('lets a @ChatGateOpen handler through while the switch is off, without asking', async () => {
    const { guard, settings } = make(false);
    await expect(guard.canActivate(ctx('open'))).resolves.toBe(true);
    expect(settings.get).not.toHaveBeenCalled();
  });

  it('refuses a request with no company on the user', async () => {
    const { guard } = make(true);
    await expect(guard.canActivate(ctx('closed', {}))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
