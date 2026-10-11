import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ACCESS_KEY } from '../common/permissions/access.decorators';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';
import { TaskRecurrencesService } from './task-recurrences.service';
import { TaskFilesService } from './task-files.service';

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
        { provide: TaskRecurrencesService, useValue: {} },
        { provide: TaskFilesService, useValue: {} },
      ],
    }).compile();
    controller = mod.get(TasksController);
  });
  it('carries the any-staff marker at class level; the task policy narrows further', () => {
    expect(Reflect.getMetadata(ACCESS_KEY, TasksController)).toEqual({
      kind: 'anyStaff',
    });
  });
  it('declares GET recurrences before GET :id, so the word is never read as an id', () => {
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('recurrenceList')).toBeLessThan(
      names.indexOf('detail'),
    );
  });
  it('declares GET config before GET :id, so the word is never read as an id', () => {
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('config')).toBeLessThan(names.indexOf('detail'));
  });
  it('gives all twenty-four routes the any-staff marker: every staff role, never the student', () => {
    expect(routeNames).toHaveLength(24);
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
  it('sends a task with a recurrence to the recurrence service, any other to the task service', async () => {
    const actor = { userId: 1 };
    const create = jest.fn().mockResolvedValue([]);
    const createRecurring = jest.fn().mockResolvedValue([]);
    const mod = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: { loadActor: jest.fn().mockResolvedValue(actor), create },
        },
        { provide: TasksReadService, useValue: {} },
        {
          provide: TaskRecurrencesService,
          useValue: { create: createRecurring },
        },
        { provide: TaskFilesService, useValue: {} },
      ],
    }).compile();
    const c = mod.get(TasksController);
    const plain = { title: 'X', assigneeIds: [2] };
    const rule = { ...plain, recurrence: { freq: 'DAILY' as const } };
    await c.create(plain, 1, 1);
    await c.create(rule, 1, 1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(plain, actor);
    expect(createRecurring).toHaveBeenCalledTimes(1);
    expect(createRecurring).toHaveBeenCalledWith(rule, actor);
  });
  it('an upload without a file is a 400; with one, the service gets the bytes, the UTF-8 name and the length', async () => {
    const actor = { userId: 1 };
    const upload = jest.fn().mockResolvedValue({});
    const mod = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: { loadActor: jest.fn().mockResolvedValue(actor) },
        },
        { provide: TasksReadService, useValue: {} },
        { provide: TaskRecurrencesService, useValue: {} },
        { provide: TaskFilesService, useValue: { upload } },
      ],
    }).compile();
    const c = mod.get(TasksController);
    await expect(c.uploadFile('T1', undefined, {}, 1, 1)).rejects.toThrow(
      'Fayl yuklanmadi',
    );
    expect(upload).not.toHaveBeenCalled();
    const buffer = Buffer.from('x');
    await c.uploadFile(
      'T1',
      { buffer, originalname: 'Ð\u009e.png' } as never,
      { name: 'Ўқув.png', durationSec: 12 },
      1,
      1,
    );
    expect(upload).toHaveBeenCalledWith(
      'T1',
      { buffer, name: 'Ўқув.png', durationSec: 12 },
      actor,
    );
  });
  it('config, list and delete go to the file service as the loaded actor', async () => {
    const actor = { userId: 1 };
    const config = jest.fn().mockReturnValue({ filesEnabled: false });
    const list = jest.fn().mockResolvedValue({ data: [] });
    const remove = jest.fn().mockResolvedValue({ event: {} });
    const mod = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: { loadActor: jest.fn().mockResolvedValue(actor) },
        },
        { provide: TasksReadService, useValue: {} },
        { provide: TaskRecurrencesService, useValue: {} },
        { provide: TaskFilesService, useValue: { config, list, remove } },
      ],
    }).compile();
    const c = mod.get(TasksController);
    expect(c.config()).toEqual({ filesEnabled: false });
    await c.fileList('T1', 1, 1);
    expect(list).toHaveBeenCalledWith('T1', actor);
    await c.removeFile('T1', 'F1', 1, 1);
    expect(remove).toHaveBeenCalledWith('T1', 'F1', actor);
  });
});
