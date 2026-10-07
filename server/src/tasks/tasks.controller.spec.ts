import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ROLES_KEY, STAFF_ROLES } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';

describe('TasksController guards', () => {
  let controller: TasksController;
  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: { loadActor: jest.fn() } },
        { provide: TasksReadService, useValue: {} },
      ],
    }).compile();
    controller = mod.get(TasksController);
  });
  it('is open to every staff role and closed to students', () => {
    const roles = new Reflector().get<string[]>(ROLES_KEY, TasksController);
    expect(roles).toEqual([...STAFF_ROLES]);
    expect(roles).not.toContain('Student');
  });
  it('runs RolesGuard, so the @Roles metadata is actually enforced', () => {
    const guards = Reflect.getMetadata('__guards__', TasksController) as
      | unknown[]
      | undefined;
    expect(guards).toContain(RolesGuard);
  });
  it('parses the branch header: a positive int32-safe integer → number, anything else → null', () => {
    expect(controller.pickBranch('12')).toBe(12);
    expect(controller.pickBranch('all')).toBeNull();
    expect(controller.pickBranch(undefined)).toBeNull();
    for (const bad of ['', '0', '12abc', '-1', ' 12', '007', '1234567890']) {
      expect(controller.pickBranch(bad)).toBeNull();
    }
  });
});
