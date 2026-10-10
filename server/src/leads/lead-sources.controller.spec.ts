import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { LeadSourcesController } from './lead-sources.controller';

describe('LeadSourcesController — route access', () => {
  // The board's source filter and the forms' source filter both read these.
  const READS = ['findAll', 'findAllForFilter'] as const;
  const WRITES = ['create', 'update', 'remove'] as const;

  it.each(READS)(
    '%s is open to the leads view and the forms capabilities',
    (name) => {
      expect(routeAccess(LeadSourcesController, name)).toEqual({
        kind: 'can',
        keys: ['leads.view', 'leads.forms'],
      });
    },
  );

  it.each(WRITES)('%s is gated by the board setup capability', (name) => {
    expect(routeAccess(LeadSourcesController, name)).toEqual({
      kind: 'can',
      keys: ['leads.setup'],
    });
  });

  it.each([...READS, ...WRITES])(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(LeadSourcesController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );
});
