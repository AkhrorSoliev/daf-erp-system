import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { StudentExitReasonsController } from './student-exit-reasons.controller';

describe('StudentExitReasonsController — route access', () => {
  // The list feeds the departure dialogs of the student and group screens.
  it('lists with the reference lists capability or either screen that asks for a reason', () => {
    expect(routeAccess(StudentExitReasonsController, 'findAll')).toEqual({
      kind: 'can',
      keys: ['settings.reference', 'students.enroll', 'groups.manage'],
    });
  });

  it.each(['create', 'update', 'remove'] as const)(
    '%s is gated by the reference lists capability',
    (name) => {
      expect(routeAccess(StudentExitReasonsController, name)).toEqual({
        kind: 'can',
        keys: ['settings.reference'],
      });
    },
  );

  it.each(['findAll', 'create', 'update', 'remove'] as const)(
    '%s admits the CEO, Branch Director and Administrator by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(StudentExitReasonsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );
});
