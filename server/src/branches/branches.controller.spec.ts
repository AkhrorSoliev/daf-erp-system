import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { BranchesController } from './branches.controller';

describe('BranchesController — route access', () => {
  it.each([
    'create',
    'update',
    'changeStatus',
    'getStatusHistory',
    'getReadiness',
  ] as const)('%s is gated by the branches capability', (name) => {
    expect(routeAccess(BranchesController, name)).toEqual({
      kind: 'can',
      keys: ['settings.branches'],
    });
  });

  it.each([
    'create',
    'update',
    'changeStatus',
    'getStatusHistory',
    'getReadiness',
  ] as const)(
    '%s admits the CEO and the Branch Director by default, nobody else',
    (name) => {
      expect(defaultRolesOf(BranchesController, name)).toEqual([
        'Branch Director',
        'CEO',
      ]);
    },
  );

  // The branch list feeds the switcher and every report filter bar.
  it.each(['findAll', 'findOne'] as const)(
    '%s is staff-only — a student-portal token must not read it',
    (name) => {
      expect(routeAccess(BranchesController, name)).toEqual({
        kind: 'anyStaff',
      });
      expect(defaultRolesOf(BranchesController, name)).not.toContain('Student');
    },
  );
});
