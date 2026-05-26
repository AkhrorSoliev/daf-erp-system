import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { MockExamParticipantsController } from './mock-exam-participants.controller';

describe('MockExamParticipantsController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(
      ROLES_KEY,
      MockExamParticipantsController,
    );
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
});
