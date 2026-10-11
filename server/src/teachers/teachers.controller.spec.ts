import { ROLE_ID } from '../common/auth/role-ids';
import {
  defaultRolesOf,
  fakePermissions,
  routeAccess,
} from '../common/permissions/testing';
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

  it("reads a teacher's profile charts with the teacher view capability", () => {
    expect(routeAccess(TeachersController, 'getStats')).toEqual({
      kind: 'can',
      keys: ['teachers.view'],
    });
    expect(defaultRolesOf(TeachersController, 'getStats')).toEqual(ADMIN_ROLES);
  });

  it('lets every staff account read its own profile charts', () => {
    expect(routeAccess(TeachersController, 'getMyStats')).toEqual({
      kind: 'anyStaff',
    });
  });
});

// ADR-0087: an employee's salary balance goes only to a caller with salary.view.
describe.each([
  ['Administrator', ROLE_ID.ADMINISTRATOR, false],
  ['Branch Director', ROLE_ID.BRANCH_DIRECTOR, true],
  ['CEO', ROLE_ID.CEO, true],
])(
  'TeachersController — employee balance for the %s',
  (_name, roleId, sees) => {
    const teachers = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
      findByIdScoped: jest.fn().mockResolvedValue({}),
    };
    const controller = new TeachersController(
      teachers as never,
      {} as never,
      {} as never,
      fakePermissions([roleId]),
    );

    it(`findAll passes includeBalance=${sees}`, async () => {
      await controller.findAll({} as never, 7, 1001, null);
      expect(teachers.findAll).toHaveBeenCalledWith({}, 1001, null, sees);
    });

    it(`findById passes includeBalance=${sees}`, async () => {
      await controller.findById(5, 7, 1001, null);
      expect(teachers.findByIdScoped).toHaveBeenCalledWith(5, 1001, null, sees);
    });
  },
);
