import { ACCESS_KEY } from '../common/permissions/access.decorators';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { CashAccountsController } from './cash-accounts.controller';

describe('CashAccountsController — route access', () => {
  const HANDLERS = [
    'findAll',
    'create',
    'transfer',
    'getMovements',
    'reconcile',
    'update',
    'remove',
  ] as const;

  it('the class level carries the cash capability and no handler overrides it', () => {
    expect(Reflect.getMetadata(ACCESS_KEY, CashAccountsController)).toEqual({
      kind: 'can',
      keys: ['cash.manage'],
    });
    for (const name of HANDLERS) {
      expect(
        Reflect.getMetadata(ACCESS_KEY, CashAccountsController.prototype[name]),
      ).toBeUndefined();
    }
  });

  it.each(HANDLERS)('%s is gated by the cash capability', (name) => {
    expect(routeAccess(CashAccountsController, name)).toEqual({
      kind: 'can',
      keys: ['cash.manage'],
    });
  });

  it.each(HANDLERS)(
    '%s admits the Branch Director and the CEO by default, not the Administrator, Cashier or Teacher',
    (name) => {
      expect(defaultRolesOf(CashAccountsController, name)).toEqual([
        'Branch Director',
        'CEO',
      ]);
    },
  );
});
