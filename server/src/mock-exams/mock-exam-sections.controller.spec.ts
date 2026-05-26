import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { MockExamSectionsController } from './mock-exam-sections.controller';

describe('MockExamSectionsController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(
      ROLES_KEY,
      MockExamSectionsController,
    );
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
});
