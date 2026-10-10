import { ACCESS_KEY } from '../common/permissions/access.decorators';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { WithdrawalsController } from './withdrawals.controller';

describe('WithdrawalsController — route access', () => {
  const HANDLERS = ['preview', 'create'] as const;

  it('the class level carries the withdrawal capability and no handler overrides it', () => {
    expect(Reflect.getMetadata(ACCESS_KEY, WithdrawalsController)).toEqual({
      kind: 'can',
      keys: ['balance.withdraw'],
    });
    for (const name of HANDLERS) {
      expect(
        Reflect.getMetadata(ACCESS_KEY, WithdrawalsController.prototype[name]),
      ).toBeUndefined();
    }
  });

  it.each(HANDLERS)('%s is gated by the withdrawal capability', (name) => {
    expect(routeAccess(WithdrawalsController, name)).toEqual({
      kind: 'can',
      keys: ['balance.withdraw'],
    });
  });

  it.each(HANDLERS)(
    '%s admits the three admin roles by default, not the Cashier or the Teacher',
    (name) => {
      expect(defaultRolesOf(WithdrawalsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );
});
