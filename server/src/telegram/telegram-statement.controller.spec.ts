import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StudentCardGuard } from '../common/guards';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { TelegramStatementController } from './telegram-statement.controller';

describe('TelegramStatementController', () => {
  it('is Student-only, and refuses a token with no student card', () => {
    expect(routeAccess(TelegramStatementController, 'sendMyStatement')).toEqual(
      { kind: 'student' },
    );
    // The global PermissionGuard runs before this one, so a staff token gets
    // 403 before the card check.
    expect(
      Reflect.getMetadata(GUARDS_METADATA, TelegramStatementController),
    ).toEqual([StudentCardGuard]);
  });

  it('admits only the Student role by default, so a staff token is turned away', () => {
    expect(
      defaultRolesOf(TelegramStatementController, 'sendMyStatement'),
    ).toEqual(['Student']);
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
