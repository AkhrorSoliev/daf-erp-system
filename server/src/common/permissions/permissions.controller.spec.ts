import { PermissionsController } from './permissions.controller';
import { defaultRolesOf, fakePermissions } from './testing';

describe('PermissionsController', () => {
  it('returns the caller own capabilities, sorted', async () => {
    const controller = new PermissionsController(fakePermissions([4]));
    await expect(controller.me(10020)).resolves.toEqual({
      keys: ['attendance.mark', 'groups.view'],
    });
  });

  it('answers any signed-in account', () => {
    expect(defaultRolesOf(PermissionsController, 'me')).toBe('ANY');
  });
});
