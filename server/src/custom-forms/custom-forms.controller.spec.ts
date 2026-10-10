import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { CustomFormsController } from './custom-forms.controller';
import { CustomFormsPublicController } from './custom-forms-public.controller';

describe('CustomFormsController — route access', () => {
  const reflector = new Reflector();
  // Every staff route: the form list and detail, the answers and their
  // export, and the form's own create, update and delete.
  const ROUTES = [
    'list',
    'findOne',
    'listSubmissions',
    'exportSubmissions',
    'create',
    'update',
    'remove',
  ] as const;

  it.each(ROUTES)('%s is gated by the forms capability', (name) => {
    expect(routeAccess(CustomFormsController, name)).toEqual({
      kind: 'can',
      keys: ['leads.forms'],
    });
  });

  it.each(ROUTES)(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(CustomFormsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it('marks the public controller as @Public so JWT is bypassed', () => {
    const isPublic = reflector.get<boolean>(
      IS_PUBLIC_KEY,
      CustomFormsPublicController,
    );
    expect(isPublic).toBe(true);
  });

  it("javoblar route'larini javoblar servisiga uzatadi", async () => {
    const submissions = {
      list: jest.fn().mockResolvedValue('LIST'),
      export: jest.fn().mockResolvedValue('EXPORT'),
    };
    const controller = new CustomFormsController(
      {} as never,
      submissions as never,
    );
    const query = { page: 2 } as never;

    await expect(controller.listSubmissions('f1', query, 7, [3])).resolves.toBe(
      'LIST',
    );
    expect(submissions.list).toHaveBeenCalledWith('f1', query, 7, [3]);

    await expect(
      controller.exportSubmissions('f1', query, 7, null),
    ).resolves.toBe('EXPORT');
    expect(submissions.export).toHaveBeenCalledWith('f1', query, 7, null);
  });
});
