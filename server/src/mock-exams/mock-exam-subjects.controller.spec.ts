import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { MockExamSubjectsController } from './mock-exam-subjects.controller';

describe('MockExamSubjectsController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(
      ROLES_KEY,
      MockExamSubjectsController,
    );
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
});
