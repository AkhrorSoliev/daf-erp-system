import { BalanceNoticesController } from './balance-notices.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('BalanceNoticesController — route access', () => {
  it('create is gated by the withdrawal capability: a notice is what opens a withdrawal', () => {
    expect(routeAccess(BalanceNoticesController, 'create')).toEqual({
      kind: 'can',
      keys: ['balance.withdraw'],
    });
  });

  it('create admits the three admin roles by default, not the Cashier or the Teacher', () => {
    expect(defaultRolesOf(BalanceNoticesController, 'create')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });
});
