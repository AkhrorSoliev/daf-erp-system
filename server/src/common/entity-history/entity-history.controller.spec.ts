import { EntityHistoryController } from './entity-history.controller';
import { defaultRolesOf, routeAccess } from '../permissions/testing';

describe('EntityHistoryController — route access', () => {
  it('is gated by the capability of every page that shows a history tab', () => {
    expect(routeAccess(EntityHistoryController, 'getHistory')).toEqual({
      kind: 'can',
      keys: [
        'students.details',
        'groups.manage',
        'teachers.view',
        'employees.view',
        'settings.reference',
        'settings.branches',
        'leads.view',
      ],
    });
  });

  it('admits the CEO, the Branch Director and the Administrator by default, nobody else', () => {
    expect(defaultRolesOf(EntityHistoryController, 'getHistory')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });
});
