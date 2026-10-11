import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { AnyStaff, Can, StudentOnly } from './access.decorators';
import { defaultRolesOf, fakePermissions, routeAccess } from './testing';

@Controller('demo')
@Can('expenses.view')
class DemoController {
  @Get()
  list() {}

  @Get('own')
  @AnyStaff()
  own() {}

  @Get('portal')
  @StudentOnly()
  portal() {}

  @Get('open')
  @Public()
  open() {}

  @Get('either')
  @Can('students.list', 'groups.view')
  either() {}
}

describe('access markers', () => {
  it('reads the handler first, then the controller', () => {
    expect(routeAccess(DemoController, 'list')).toEqual({
      kind: 'can',
      keys: ['expenses.view'],
    });
    expect(routeAccess(DemoController, 'own')).toEqual({ kind: 'anyStaff' });
    expect(routeAccess(DemoController, 'portal')).toEqual({ kind: 'student' });
  });

  it('lets @Public win over any marker', () => {
    expect(routeAccess(DemoController, 'open')).toEqual({ kind: 'public' });
  });

  it('writes the default access the way @Roles used to', () => {
    expect(defaultRolesOf(DemoController, 'list')).toEqual([
      'Branch Director',
      'CEO',
    ]);
    expect(defaultRolesOf(DemoController, 'either')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
      'Teacher',
    ]);
  });

  it('refuses a name that is not a handler', () => {
    expect(() => routeAccess(DemoController, 'missing')).toThrow(
      'DemoController.missing is not a method',
    );
  });
});

describe('fakePermissions', () => {
  it('gives every caller the roles when no user is named', async () => {
    const permissions = fakePermissions([3]);
    expect(await permissions.has(8, 'students.list')).toBe(true);
  });

  it('gives only the named user the roles', async () => {
    const permissions = fakePermissions([3], { userId: 7 });
    expect(await permissions.has(7, 'students.list')).toBe(true);
    expect(await permissions.has(8, 'students.list')).toBe(false);
    expect((await permissions.forUser(8)).roleIds).toEqual([]);
  });

  it("applies the CEO's changes it is given", async () => {
    const permissions = fakePermissions([5], {
      overrides: [
        { roleId: 5, key: 'students.list', granted: true },
        { roleId: 5, key: 'payments.create', granted: false },
      ],
    });
    expect(await permissions.has(1, 'students.list')).toBe(true);
    expect(await permissions.has(1, 'payments.create')).toBe(false);
  });

  it('has an invalidateAll that does nothing', () => {
    expect(() => fakePermissions([2]).invalidateAll()).not.toThrow();
  });
});
