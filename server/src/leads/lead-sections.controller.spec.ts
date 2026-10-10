import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { LeadSectionsController } from './lead-sections.controller';

describe('LeadSectionsController — route access', () => {
  const ROUTES = [
    'create',
    'reorder',
    'moveToColumn',
    'restore',
    'update',
    'remove',
  ] as const;

  it.each(ROUTES)('%s is gated by the board setup capability', (name) => {
    expect(routeAccess(LeadSectionsController, name)).toEqual({
      kind: 'can',
      keys: ['leads.setup'],
    });
  });

  it.each(ROUTES)(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(LeadSectionsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );
});
