import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StudentCardGuard } from '../common/guards';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { ChatEnabledGuard } from './chat-enabled.guard';
import { ChatController } from './chat.controller';

describe('ChatController', () => {
  const methods = Object.getOwnPropertyNames(ChatController.prototype).filter(
    (m) => m !== 'constructor',
  );

  it('has routes', () => {
    expect(methods.length).toBeGreaterThan(0);
  });

  it('is Student-only on every route and refuses a token with no card', () => {
    for (const method of methods) {
      expect(routeAccess(ChatController, method)).toEqual({ kind: 'student' });
      expect(defaultRolesOf(ChatController, method)).toEqual(['Student']);
    }
    expect(Reflect.getMetadata(GUARDS_METADATA, ChatController)).toEqual([
      StudentCardGuard,
      ChatEnabledGuard,
    ]);
  });

  it('keeps only GET /chat/access open while chat is switched off', () => {
    const open = methods.filter(
      (m) =>
        Reflect.getMetadata(
          'chat:gateOpen',
          ChatController.prototype[m as keyof ChatController],
        ) === true,
    );
    expect(open).toEqual(['getAccess']);
  });
});
