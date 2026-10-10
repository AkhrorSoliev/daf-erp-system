import { RefundsController } from './refunds.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

const THREE_ADMIN_ROLES = ['Administrator', 'Branch Director', 'CEO'];

// Kassir pul qaytarish so'rovini ochmaydi (docs/role-access.md, «Open refund
// request»), lekin «Berildi» bosadi. «Qaytariladigan pul» sahifasi shu sababli
// kassirga so'rov ochish amallarini ko'rsatmaydi — bu test o'sha yashirishning
// server tomoni.
describe('RefundsController — route access', () => {
  const REQUESTS = ['quickRefund', 'previewRefund'] as const;

  it.each(REQUESTS)('%s is gated by the refund capability', (name) => {
    expect(routeAccess(RefundsController, name)).toEqual({
      kind: 'can',
      keys: ['refunds.create'],
    });
  });

  it.each(REQUESTS)(
    '%s admits the three admin roles by default, not the Cashier or the Teacher',
    (name) => {
      expect(defaultRolesOf(RefundsController, name)).toEqual(
        THREE_ADMIN_ROLES,
      );
    },
  );

  // ADR-0077: «Berildi» and «Bekor qilish» replace the old approve/complete
  // route, so nothing may pay out through it any more.
  it('has no PATCH :id/process handler', () => {
    expect('process' in RefundsController.prototype).toBe(false);
  });

  it('the history list is open to whoever opens or hands over a refund: the Cashier too, not the Teacher', () => {
    expect(routeAccess(RefundsController, 'findAll')).toEqual({
      kind: 'can',
      keys: ['refunds.create', 'refunds.hand-over'],
    });
    expect(defaultRolesOf(RefundsController, 'findAll')).toEqual([
      ...THREE_ADMIN_ROLES,
      'Cashier',
    ]);
  });

  it('handOver («Berildi») admits the three admin roles and the Cashier by default', () => {
    expect(routeAccess(RefundsController, 'handOver')).toEqual({
      kind: 'can',
      keys: ['refunds.hand-over'],
    });
    expect(defaultRolesOf(RefundsController, 'handOver')).toEqual([
      ...THREE_ADMIN_ROLES,
      'Cashier',
    ]);
  });

  it('cancel admits the CEO and the Branch Director by default, nobody else', () => {
    expect(routeAccess(RefundsController, 'cancel')).toEqual({
      kind: 'can',
      keys: ['refunds.cancel'],
    });
    expect(defaultRolesOf(RefundsController, 'cancel')).toEqual([
      'Branch Director',
      'CEO',
    ]);
  });

  it('reverse is gated by the undo capability and admits the CEO by default, nobody else', () => {
    expect(routeAccess(RefundsController, 'reverse')).toEqual({
      kind: 'can',
      keys: ['money.undo'],
    });
    expect(defaultRolesOf(RefundsController, 'reverse')).toEqual(['CEO']);
  });
});
