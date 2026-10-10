import { BillingController } from './billing.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('BillingController — route access', () => {
  it('reverseDebtWriteOff is gated by the undo capability and admits the CEO by default, nobody else', () => {
    expect(routeAccess(BillingController, 'reverseDebtWriteOff')).toEqual({
      kind: 'can',
      keys: ['money.undo'],
    });
    expect(defaultRolesOf(BillingController, 'reverseDebtWriteOff')).toEqual([
      'CEO',
    ]);
  });

  it('reverseLessonDeduction is gated by the balance adjustment capability', () => {
    expect(routeAccess(BillingController, 'reverseLessonDeduction')).toEqual({
      kind: 'can',
      keys: ['balance.adjust'],
    });
  });

  // Appendix C: a recovery tool with no screen, which a Branch Director or
  // the CEO starts — the Administrator no longer reaches it.
  it('runRetroactiveBilling is gated by the balance adjustment capability', () => {
    expect(routeAccess(BillingController, 'runRetroactiveBilling')).toEqual({
      kind: 'can',
      keys: ['balance.adjust'],
    });
  });

  it.each(['reverseLessonDeduction', 'runRetroactiveBilling'])(
    '%s admits the Branch Director and the CEO by default, nobody else',
    (name) => {
      expect(defaultRolesOf(BillingController, name)).toEqual([
        'Branch Director',
        'CEO',
      ]);
    },
  );
});
