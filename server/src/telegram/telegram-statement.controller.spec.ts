import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { RolesGuard, StudentCardGuard } from '../common/guards';
import { TelegramStatementController } from './telegram-statement.controller';

describe('TelegramStatementController', () => {
  it('is Student-only, and refuses a token with no student card', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, TelegramStatementController)).toEqual([
      'Student',
    ]);
    // RolesGuard first, so a staff token gets 403 before the card check.
    expect(
      Reflect.getMetadata(GUARDS_METADATA, TelegramStatementController),
    ).toEqual([RolesGuard, StudentCardGuard]);
  });

  it('lets a student through and turns a staff token away', () => {
    const guard = new RolesGuard(new Reflector());
    const as = (roles: string[]) =>
      ({
        getHandler: () => TelegramStatementController.prototype.sendMyStatement,
        getClass: () => TelegramStatementController,
        switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
      }) as unknown as ExecutionContext;

    expect(guard.canActivate(as(['Student']))).toBe(true);
    expect(() => guard.canActivate(as(['Administrator']))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(as(['CEO']))).toThrow(ForbiddenException);
  });

  it("sends the caller's own statement, the student taken from the token", async () => {
    const sender = { sendToLinkedChat: jest.fn().mockResolvedValue(undefined) };
    const controller = new TelegramStatementController(sender as never);

    await expect(controller.sendMyStatement(10001, 1001)).resolves.toEqual({
      sent: true,
    });
    expect(sender.sendToLinkedChat).toHaveBeenCalledWith(10001, 1001);
  });
});
