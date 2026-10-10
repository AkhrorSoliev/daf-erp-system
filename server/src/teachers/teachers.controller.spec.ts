import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { TeachersController } from './teachers.controller';

describe('TeachersController — route access', () => {
  const ADMIN_ROLES = ['Administrator', 'Branch Director', 'CEO'];
  const DIRECTOR_ROLES = ['Branch Director', 'CEO'];

  it('lists teachers with the teacher view or the student list capability', () => {
    expect(routeAccess(TeachersController, 'findAll')).toEqual({
      kind: 'can',
      keys: ['teachers.view', 'students.list'],
    });
  });

  it('opens a teacher profile with the teacher view capability', () => {
    expect(routeAccess(TeachersController, 'findById')).toEqual({
      kind: 'can',
      keys: ['teachers.view'],
    });
  });

  it("lists a teacher's groups with the teacher or employee view capability", () => {
    expect(routeAccess(TeachersController, 'findGroupsByTeacherId')).toEqual({
      kind: 'can',
      keys: ['teachers.view', 'employees.view'],
    });
  });

  it.each([
    'create',
    'update',
    'changeStatus',
    'delete',
    'getStatusHistory',
  ] as const)('%s is gated by the teacher manage capability', (name) => {
    expect(routeAccess(TeachersController, name)).toEqual({
      kind: 'can',
      keys: ['teachers.manage'],
    });
  });

  it("reads a teacher's salary summary with the salary view capability", () => {
    expect(routeAccess(TeachersController, 'getSalarySummary')).toEqual({
      kind: 'can',
      keys: ['salary.view'],
    });
  });

  it.each(['findAll', 'findById', 'findGroupsByTeacherId'] as const)(
    '%s admits the CEO, Branch Director and Administrator by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(TeachersController, name)).toEqual(ADMIN_ROLES);
    },
  );

  it.each([
    'create',
    'update',
    'changeStatus',
    'delete',
    'getStatusHistory',
    'getSalarySummary',
  ] as const)(
    '%s admits the CEO and the Branch Director by default, not the Administrator',
    (name) => {
      expect(defaultRolesOf(TeachersController, name)).toEqual(DIRECTOR_ROLES);
    },
  );
});
