import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { MockExamResultsController } from './mock-exam-results.controller';

describe('MockExamResultsController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, MockExamResultsController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
});
