import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { StudentLevelTestsController } from './level-test.controller';
import { LevelTestResultsService } from './level-test-results.service';

describe('StudentLevelTestsController', () => {
  const results = { forStudent: jest.fn().mockResolvedValue({ latest: null }) };
  let controller: StudentLevelTestsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [StudentLevelTestsController],
      providers: [{ provide: LevelTestResultsService, useValue: results }],
    }).compile();
    controller = moduleRef.get(StudentLevelTestsController);
  });

  it('is gated by students.details', () => {
    expect(routeAccess(StudentLevelTestsController, 'list')).toEqual({
      kind: 'can',
      keys: ['students.details'],
    });
  });

  it('admits Administrator, Branch Director and CEO by default', () => {
    expect(defaultRolesOf(StudentLevelTestsController, 'list')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });

  it('passes caller, company and student to the service', async () => {
    await controller.list(5, 11, 1);
    expect(results.forStudent).toHaveBeenCalledWith(11, 1, 5);
  });
});
