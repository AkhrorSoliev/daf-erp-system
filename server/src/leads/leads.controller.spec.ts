import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { LeadsController } from './leads.controller';

describe('LeadsController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, LeadsController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
});
