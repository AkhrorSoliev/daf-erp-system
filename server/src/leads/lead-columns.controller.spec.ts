import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { LeadColumnsController } from './lead-columns.controller';

describe('LeadColumnsController — route access', () => {
  const ROUTES = ['create', 'reorder', 'update', 'remove'] as const;

  it.each(ROUTES)('%s is gated by the board setup capability', (name) => {
    expect(routeAccess(LeadColumnsController, name)).toEqual({
      kind: 'can',
      keys: ['leads.setup'],
    });
  });

  it.each(ROUTES)(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(LeadColumnsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );
});
