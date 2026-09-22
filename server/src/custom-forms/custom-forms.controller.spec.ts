import { Reflector } from '@nestjs/core';
import { ROLES_KEY, IS_PUBLIC_KEY } from '../common/decorators';
import { CustomFormsController } from './custom-forms.controller';
import { CustomFormsPublicController } from './custom-forms-public.controller';

describe('CustomFormsController — guards', () => {
  const reflector = new Reflector();

  it('restricts admin endpoints to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, CustomFormsController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });

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

  it("javoblar route'larida metod darajasidagi rol almashtirilmagan", () => {
    for (const handler of [
      CustomFormsController.prototype.listSubmissions,
      CustomFormsController.prototype.exportSubmissions,
    ]) {
      expect(reflector.get(ROLES_KEY, handler)).toBeUndefined();
    }
  });
});
