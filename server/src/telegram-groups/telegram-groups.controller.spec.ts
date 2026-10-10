import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { TelegramGroupsController } from './telegram-groups.controller';

describe('TelegramGroupsController — route access', () => {
  const DIRECTOR_ROLES = ['Branch Director', 'CEO'];

  it.each(['listPending', 'list', 'approve', 'updateScope', 'reject'] as const)(
    '%s is gated by the Telegram groups capability',
    (name) => {
      expect(routeAccess(TelegramGroupsController, name)).toEqual({
        kind: 'can',
        keys: ['settings.telegram-groups'],
      });
    },
  );

  it('listPending — CEO and Branch Director allowed; others denied', () => {
    expect(defaultRolesOf(TelegramGroupsController, 'listPending')).toEqual(
      DIRECTOR_ROLES,
    );
  });

  // The Administrator used to read this list although only the «Telegram
  // guruhlar» settings page calls it, and that page is CEO / Branch Director
  // only (an intentional narrowing, Appendix C of the permissions plan).
  it('list (approved) — CEO and Branch Director allowed; Administrator, Teacher and Cashier denied', () => {
    expect(defaultRolesOf(TelegramGroupsController, 'list')).toEqual(
      DIRECTOR_ROLES,
    );
  });

  it('approve — CEO and Branch Director only', () => {
    expect(defaultRolesOf(TelegramGroupsController, 'approve')).toEqual(
      DIRECTOR_ROLES,
    );
  });

  it('updateScope — CEO and Branch Director only', () => {
    expect(defaultRolesOf(TelegramGroupsController, 'updateScope')).toEqual(
      DIRECTOR_ROLES,
    );
  });

  it('reject — CEO and Branch Director only', () => {
    expect(defaultRolesOf(TelegramGroupsController, 'reject')).toEqual(
      DIRECTOR_ROLES,
    );
  });

  it.each(['unlink', 'announce'] as const)(
    '%s is gated by the announce capability — CEO only (global product comms)',
    (name) => {
      expect(routeAccess(TelegramGroupsController, name)).toEqual({
        kind: 'can',
        keys: ['telegram.announce'],
      });
      expect(defaultRolesOf(TelegramGroupsController, name)).toEqual(['CEO']);
    },
  );
});
