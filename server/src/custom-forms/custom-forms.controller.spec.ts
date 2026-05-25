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
});
