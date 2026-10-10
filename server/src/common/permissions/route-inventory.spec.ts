import { routesInSource } from '../../../scripts/route-inventory';

const FILE = 'src/x/x.controller.ts';
const parse = (body: string) =>
  routesInSource(FILE, `@Controller('x')\n${body}`, '');

describe('route inventory: access markers', () => {
  it('reads the capability keys of a @Can written as string literals', () => {
    const [route] = parse(`
      class XController {
        @Get()
        @Can('a.view', 'b.view')
        list() {}
      }`);
    expect(route.access).toEqual({ kind: 'can', keys: ['a.view', 'b.view'] });
  });

  it('refuses a @Can argument that is not a string literal', () => {
    // `@Can('a', KEYS.B)` summarised as ['a'] would under-report what the
    // guard admits at runtime (a ∪ B), the one way the snapshot proof lies.
    expect(() =>
      parse(`
      class XController {
        @Get()
        @Can('a.view', KEYS.B)
        list() {}
      }`),
    ).toThrow(`Unsupported @Can argument in ${FILE}: KEYS.B`);
  });

  it('refuses a spread and a template literal in @Can the same way', () => {
    expect(() =>
      parse('class XController { @Get() @Can(...KEYS) list() {} }'),
    ).toThrow(`Unsupported @Can argument in ${FILE}: ...KEYS`);
    expect(() =>
      parse('class XController { @Get() @Can(`a.${k}`) list() {} }'),
    ).toThrow(`Unsupported @Can argument in ${FILE}: \`a.\${k}\``);
  });

  it('checks a class-level marker too', () => {
    expect(() =>
      parse(`
      @Can(KEYS.A)
      class XController {
        @Get()
        list() {}
      }`),
    ).toThrow(`Unsupported @Can argument in ${FILE}: KEYS.A`);
  });

  it('refuses an argument handed to a marker that takes none', () => {
    for (const marker of ['AnyStaff', 'AnyUser', 'StudentOnly']) {
      expect(() =>
        parse(`class XController { @Get() @${marker}(KEYS.A) list() {} }`),
      ).toThrow(`Unsupported @${marker} argument in ${FILE}: KEYS.A`);
    }
  });

  it('still reads the argument-free markers', () => {
    const routes = parse(`
      class XController {
        @Get('a') @AnyStaff() a() {}
        @Get('b') @AnyUser() b() {}
        @Get('c') @StudentOnly() c() {}
        @Get('d') d() {}
      }`);
    expect(routes.map((r) => r.access.kind)).toEqual([
      'anyStaff',
      'anyUser',
      'student',
      'none',
    ]);
  });
});
