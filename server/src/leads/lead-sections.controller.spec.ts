import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { LeadSectionsController } from './lead-sections.controller';

describe('LeadSectionsController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, LeadSectionsController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
});
