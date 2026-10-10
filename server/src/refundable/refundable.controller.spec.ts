import { RefundableController } from './refundable.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('RefundableController — route access', () => {
  const READS = ['list', 'excel', 'student'] as const;

  it.each(READS)('%s is gated by the debt view capability', (name) => {
    expect(routeAccess(RefundableController, name)).toEqual({
      kind: 'can',
      keys: ['debt.view'],
    });
  });

  it.each(READS)(
    '%s admits every staff role but the Teacher by default',
    (name) => {
      expect(defaultRolesOf(RefundableController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
        'Cashier',
      ]);
    },
  );
});
