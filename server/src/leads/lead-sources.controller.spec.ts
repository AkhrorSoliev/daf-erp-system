import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { LeadSourcesController } from './lead-sources.controller';

describe('LeadSourcesController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, LeadSourcesController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
});
