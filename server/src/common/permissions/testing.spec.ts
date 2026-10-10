import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { AnyStaff, Can, StudentOnly } from './access.decorators';
import { defaultRolesOf, routeAccess } from './testing';

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
