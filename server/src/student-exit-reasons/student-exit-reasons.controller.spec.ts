import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { StudentExitReasonsController } from './student-exit-reasons.controller';

describe('StudentExitReasonsController — guards', () => {
  const reflector = new Reflector();

  it('restricts the entire controller to CEO / Branch Director / Administrator', () => {
    const roles = reflector.get<string[]>(
      ROLES_KEY,
      StudentExitReasonsController,
    );
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });
});
