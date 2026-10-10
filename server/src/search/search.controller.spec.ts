import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { SearchController } from './search.controller';

describe('SearchController — route access', () => {
  // The search box finds students, leads and teachers: any one of the three
  // pages' capabilities lets the caller in.
  describe.each(['quickSearch', 'fullSearch'] as const)('%s()', (method) => {
    it('is gated by the student, lead and teacher list capabilities', () => {
      expect(routeAccess(SearchController, method)).toEqual({
        kind: 'can',
        keys: ['students.list', 'leads.view', 'teachers.view'],
      });
    });

    it('admits the CEO, the Branch Director and the Administrator by default, not the Teacher or the Cashier', () => {
      expect(defaultRolesOf(SearchController, method)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    });
  });
});
