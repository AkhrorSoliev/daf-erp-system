import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { LeadColumnsController } from './lead-columns.controller';

describe('LeadColumnsController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, LeadColumnsController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
});
