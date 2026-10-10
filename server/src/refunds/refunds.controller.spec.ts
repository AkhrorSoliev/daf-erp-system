import { RefundsController } from './refunds.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

// Kassir pul qaytarmaydi (docs/role-access.md, «Create refund»). Qarzdorlik
// sahifasining «Muzlatilgan puli» tabi shu sababli kassirga qator amallarini
// ko'rsatmaydi — bu test o'sha yashirishning server tomoni.
describe('RefundsController — route access', () => {
  const REFUNDS = [
    'quickRefund',
    'previewRefund',
    'findAll',
    'process',
  ] as const;

  it.each(REFUNDS)('%s is gated by the refund capability', (name) => {
    expect(routeAccess(RefundsController, name)).toEqual({
      kind: 'can',
      keys: ['refunds.create'],
    });
  });

  it.each(REFUNDS)(
    '%s admits the three admin roles by default, not the Cashier or the Teacher',
    (name) => {
      expect(defaultRolesOf(RefundsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it('reverse is gated by the undo capability and admits the CEO by default, nobody else', () => {
    expect(routeAccess(RefundsController, 'reverse')).toEqual({
      kind: 'can',
      keys: ['money.undo'],
    });
    expect(defaultRolesOf(RefundsController, 'reverse')).toEqual(['CEO']);
  });
});
