import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ACCESS_KEY } from '../common/permissions/access.decorators';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';

const proto = TasksController.prototype as unknown as Record<string, unknown>;
const routeNames = Object.getOwnPropertyNames(proto).filter(
  (name) =>
    name !== 'constructor' &&
    typeof proto[name] === 'function' &&
    Reflect.hasMetadata(PATH_METADATA, proto[name] as object),
);

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
  it('carries the any-staff marker at class level; the task policy narrows further', () => {
    expect(Reflect.getMetadata(ACCESS_KEY, TasksController)).toEqual({
      kind: 'anyStaff',
    });
  });
  it('gives all seventeen routes the any-staff marker: every staff role, never the student', () => {
    expect(routeNames).toHaveLength(17);
    for (const name of routeNames) {
      expect(routeAccess(TasksController, name)).toEqual({ kind: 'anyStaff' });
      expect(defaultRolesOf(TasksController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
        'Cashier',
        'Teacher',
      ]);
    }
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
