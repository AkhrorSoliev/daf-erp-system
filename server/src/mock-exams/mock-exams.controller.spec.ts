import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { MockExamsController } from './mock-exams.controller';

describe('MockExamsController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, MockExamsController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
});
