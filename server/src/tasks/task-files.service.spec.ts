/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TaskFilesService } from './task-files.service';
import { TASK_EVENTS } from './task-events';
import { hasFreshPhoto } from './task-status-writes';
import {
  DELETE_REFUSED_MESSAGE,
  FILES_OFF_MESSAGE,
  FILE_TYPE_MESSAGE,
  UPLOAD_REFUSED_MESSAGE,
} from './task-file-rules';

const PNG = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  Buffer.alloc(32),
]);
const OGG = Buffer.concat([
  Buffer.from('OggS'),
  Buffer.alloc(24),
  Buffer.from('OpusHead'),
  Buffer.alloc(32),
]);
const NOW = new Date('2026-11-20T00:00:00Z');
const actor = (userId: number, via?: 'WEB' | 'TELEGRAM') =>
  ({
    userId,
    companyId: 1,
    roleIds: [4],
    roleNames: [],
    scope: { kind: 'branches', branchIds: [1] },
    headerBranchId: null,
    ...(via && { via }),
  }) as never;
const participants = [
  { userId: 30, role: 'WATCHER' },
  { userId: 40, role: 'ASSIGNEE' },
];
const row = (over: Record<string, unknown> = {}) => ({
  id: 'T1',
  companyId: 1,
  requiresPhoto: false,
  createdAt: new Date('2026-10-11T05:00:00Z'),
  lastReturnedAt: null,
  participants,
  ...over,
});
const person = { id: 40, firstName: 'Ali', lastName: 'Rahimov', photo: null };
const fileRow = (over: Record<string, unknown> = {}) => ({
  id: 'F1',
  key: 'tasks/1/T1/u.png',
  name: 'chek.png',
  size: 40,
  mime: 'image/png',
  kind: 'IMAGE',
  durationSec: null,
  via: 'WEB',
  createdAt: NOW,
  uploadedById: 40,
  uploadedBy: person,
  ...over,
});

let prisma: any;
let tasks: any;
let storage: any;
let emitter: any;
let svc: TaskFilesService;
const access = (over: Record<string, boolean> = {}) => ({
  canManage: false,
  canWork: true,
  ...over,
});

beforeEach(() => {
  prisma = {
    taskFile: {
      create: jest.fn().mockResolvedValue(fileRow()),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    taskEvent: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'E1', type: 'FILE', fileId: 'F1' }),
    },
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  tasks = {
    loadForAccess: jest
      .fn()
      .mockResolvedValue({ row: row(), access: access() }),
    eventTask: jest.fn((r: { id: string }) => ({ id: r.id })),
  };
  storage = {
    enabled: true,
    put: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(true),
    signedGet: jest.fn(
      (_k: string, _m: string, _n: string, download: boolean) =>
        Promise.resolve(download ? 'https://dl' : 'https://view'),
    ),
  };
  emitter = { emit: jest.fn() };
  svc = new TaskFilesService(prisma, emitter, tasks, storage);
});

describe('upload', () => {
  it('stores the object, then the row and its FILE event; tells the others after the commit', async () => {
    const out = await svc.upload(
      'T1',
      { buffer: PNG, name: 'C:\\x\\chek.PNG' },
      actor(40),
    );
    const [key, body, mime] = storage.put.mock.calls[0];
    expect(key).toMatch(/^tasks\/1\/T1\/[0-9a-f-]{36}\.png$/);
    expect(body).toBe(PNG);
    expect(mime).toBe('image/png');
    expect(prisma.taskFile.create.mock.calls[0][0].data).toEqual({
      taskId: 'T1',
      key,
      name: 'chek.png',
      size: PNG.length,
      mime: 'image/png',
      kind: 'IMAGE',
      durationSec: null,
      uploadedById: 40,
      via: 'WEB',
    });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toEqual({
      taskId: 'T1',
      type: 'FILE',
      actorId: 40,
      text: 'chek.png',
      fileId: 'F1',
      via: 'WEB',
    });
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.COMMENTED, {
      task: { id: 'T1' },
      actorId: 40,
      text: 'chek.png',
      attachment: 'FILE',
    });
    expect(out.file).toMatchObject({
      id: 'F1',
      canDelete: true,
      url: 'https://view',
      downloadUrl: 'https://dl',
    });
    expect(out.file).not.toHaveProperty('key');
    expect(out.event).toEqual({ id: 'E1', type: 'FILE', fileId: 'F1' });
  });

  it('a voice message from Telegram: VOICE row and event, its length, «Ovozli xabar»', async () => {
    prisma.taskFile.create.mockResolvedValue(
      fileRow({ kind: 'VOICE', mime: 'audio/ogg', durationSec: 42 }),
    );
    await svc.upload(
      'T1',
      { buffer: OGG, name: 'ovozli-xabar.ogg', durationSec: 42 },
      actor(40, 'TELEGRAM'),
    );
    expect(prisma.taskFile.create.mock.calls[0][0].data).toMatchObject({
      kind: 'VOICE',
      durationSec: 42,
      via: 'TELEGRAM',
    });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'VOICE',
      via: 'TELEGRAM',
    });
    expect(emitter.emit.mock.calls[0][1]).toMatchObject({
      text: 'Ovozli xabar',
      attachment: 'VOICE',
    });
  });

  it('a refused type: 400 before anything is stored', async () => {
    await expect(
      svc.upload(
        'T1',
        { buffer: Buffer.from('<html>'), name: 'a.html' },
        actor(40),
      ),
    ).rejects.toThrow(FILE_TYPE_MESSAGE);
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.taskFile.create).not.toHaveBeenCalled();
  });

  it('a task the caller cannot see: its 404, nothing stored', async () => {
    tasks.loadForAccess.mockRejectedValue(
      new NotFoundException('Topshiriq topilmadi'),
    );
    await expect(svc.upload('T1', { buffer: PNG }, actor(99))).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('a watcher sees the task but may not upload: 403, nothing stored', async () => {
    tasks.loadForAccess.mockResolvedValue({
      row: row(),
      access: access({ canWork: false }),
    });
    await expect(svc.upload('T1', { buffer: PNG }, actor(50))).rejects.toThrow(
      new ForbiddenException(UPLOAD_REFUSED_MESSAGE),
    );
    expect(storage.put).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('the giver who is not an assignee may upload (a reference photo)', async () => {
    tasks.loadForAccess.mockResolvedValue({
      row: row(),
      access: access({ canWork: false, canManage: true }),
    });
    await expect(
      svc.upload('T1', { buffer: PNG }, actor(30)),
    ).resolves.toBeDefined();
  });

  it('the row does not commit: the object is removed, the error goes on, nobody is told', async () => {
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    await expect(svc.upload('T1', { buffer: PNG }, actor(40))).rejects.toThrow(
      'db down',
    );
    expect(storage.remove).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('files off: 503 with the files-off message, the task is not even loaded', async () => {
    storage.enabled = false;
    await expect(svc.upload('T1', { buffer: PNG }, actor(40))).rejects.toThrow(
      new ServiceUnavailableException(FILES_OFF_MESSAGE),
    );
    expect(tasks.loadForAccess).not.toHaveBeenCalled();
  });
});

describe('remove', () => {
  beforeEach(() =>
    prisma.taskFile.findFirst.mockResolvedValue({
      id: 'F1',
      name: 'chek.png',
      uploadedById: 40,
    }),
  );

  it('the uploader: soft delete and a FILE_DELETED line', async () => {
    await svc.remove('T1', 'F1', actor(40));
    expect(prisma.taskFile.updateMany).toHaveBeenCalledWith({
      where: { id: 'F1', deletedAt: null },
      data: { deletedAt: expect.any(Date), deletedById: 40 },
    });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toEqual({
      taskId: 'T1',
      type: 'FILE_DELETED',
      actorId: 40,
      text: 'chek.png',
      fileId: 'F1',
      via: 'WEB',
    });
    expect(emitter.emit).not.toHaveBeenCalled();
  });
  it('a manager of the task may; anyone else gets 403', async () => {
    tasks.loadForAccess.mockResolvedValue({
      row: row(),
      access: access({ canManage: true }),
    });
    await expect(svc.remove('T1', 'F1', actor(30))).resolves.toBeDefined();
    tasks.loadForAccess.mockResolvedValue({ row: row(), access: access() });
    await expect(svc.remove('T1', 'F1', actor(50))).rejects.toThrow(
      new ForbiddenException(DELETE_REFUSED_MESSAGE),
    );
  });
  it('a missing or already deleted file: 404; a delete that lost the race: 404, no line', async () => {
    prisma.taskFile.findFirst.mockResolvedValue(null);
    await expect(svc.remove('T1', 'F9', actor(40))).rejects.toThrow(
      NotFoundException,
    );
    prisma.taskFile.findFirst.mockResolvedValue({
      id: 'F1',
      name: 'chek.png',
      uploadedById: 40,
    });
    prisma.taskFile.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.remove('T1', 'F1', actor(40))).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
  });
  it('files off: 503 with the files-off message, nothing touched', async () => {
    storage.enabled = false;
    await expect(svc.remove('T1', 'F1', actor(40))).rejects.toThrow(
      new ServiceUnavailableException(FILES_OFF_MESSAGE),
    );
    expect(tasks.loadForAccess).not.toHaveBeenCalled();
    expect(prisma.taskFile.updateMany).not.toHaveBeenCalled();
  });
});

describe('list', () => {
  it('live files with fresh links, who may delete each; no photo question for an ordinary task', async () => {
    prisma.taskFile.findMany.mockResolvedValue([
      fileRow(),
      fileRow({ id: 'F2', uploadedById: 41, uploadedBy: null }),
    ]);
    const out = await svc.list('T1', actor(40));
    expect(prisma.taskFile.findMany.mock.calls[0][0].where).toEqual({
      taskId: 'T1',
      deletedAt: null,
    });
    expect(out.data.map((f) => [f.id, f.canDelete, f.url])).toEqual([
      ['F1', true, 'https://view'],
      ['F2', false, 'https://view'],
    ]);
    expect(out.hasFreshPhoto).toBe(false);
    expect(out.enabled).toBe(true);
    expect(prisma.taskFile.count).not.toHaveBeenCalled();
  });
  it('a photo task: counts images by the assignees after the last return', async () => {
    const lastReturnedAt = new Date('2026-10-12T05:00:00Z');
    tasks.loadForAccess.mockResolvedValue({
      row: row({ requiresPhoto: true, lastReturnedAt }),
      access: access(),
    });
    prisma.taskFile.count.mockResolvedValue(1);
    expect((await svc.list('T1', actor(40))).hasFreshPhoto).toBe(true);
    expect(prisma.taskFile.count).toHaveBeenCalledWith({
      where: {
        taskId: 'T1',
        kind: 'IMAGE',
        deletedAt: null,
        uploadedById: { in: [40] },
        createdAt: { gt: lastReturnedAt },
      },
    });
  });
  it('files off: an empty list, enabled false, nothing read or signed', async () => {
    storage.enabled = false;
    const out = await svc.list('T1', actor(40));
    expect(out).toEqual({ data: [], hasFreshPhoto: false, enabled: false });
    expect(prisma.taskFile.findMany).not.toHaveBeenCalled();
    expect(storage.signedGet).not.toHaveBeenCalled();
  });
  it('a task the caller cannot see: no links', async () => {
    tasks.loadForAccess.mockRejectedValue(new NotFoundException('x'));
    await expect(svc.list('T1', actor(99))).rejects.toThrow(NotFoundException);
    expect(storage.signedGet).not.toHaveBeenCalled();
  });
});

describe('hasFreshPhoto (the photo rule)', () => {
  const created = new Date('2026-10-11T05:00:00Z');
  const task = (over: Record<string, unknown> = {}) => ({
    id: 'T1',
    createdAt: created,
    lastReturnedAt: null,
    participants,
    ...over,
  });

  it("an assignee's photo counts: only assignees' images are asked for, since creation", async () => {
    prisma.taskFile.count.mockResolvedValue(1);
    await expect(hasFreshPhoto(prisma, task())).resolves.toBe(true);
    expect(prisma.taskFile.count).toHaveBeenCalledWith({
      where: {
        taskId: 'T1',
        kind: 'IMAGE',
        deletedAt: null,
        uploadedById: { in: [40] },
        createdAt: { gt: created },
      },
    });
  });
  it("the author's reference photo does not count (the author is not an assignee)", async () => {
    await hasFreshPhoto(prisma, task());
    const where = prisma.taskFile.count.mock.calls[0][0].where;
    expect(where.uploadedById.in).not.toContain(30);
  });
  it('a self-task: the author is the assignee, so their photo counts', async () => {
    prisma.taskFile.count.mockResolvedValue(1);
    const self = task({ participants: [{ userId: 30, role: 'ASSIGNEE' }] });
    await expect(hasFreshPhoto(prisma, self)).resolves.toBe(true);
    expect(prisma.taskFile.count.mock.calls[0][0].where.uploadedById).toEqual({
      in: [30],
    });
  });
  it('a photo before the last return does not count: the window starts at the return', async () => {
    const lastReturnedAt = new Date('2026-10-12T05:00:00Z');
    await expect(hasFreshPhoto(prisma, task({ lastReturnedAt }))).resolves.toBe(
      false,
    );
    expect(prisma.taskFile.count.mock.calls[0][0].where.createdAt).toEqual({
      gt: lastReturnedAt,
    });
  });
  it('no assignee at all: false without a query', async () => {
    await expect(
      hasFreshPhoto(
        prisma,
        task({ participants: [{ userId: 30, role: 'WATCHER' }] }),
      ),
    ).resolves.toBe(false);
    expect(prisma.taskFile.count).not.toHaveBeenCalled();
  });
});

describe('purge (03:00)', () => {
  it('deletes the objects of files deleted 30+ days ago and stamps only those that went', async () => {
    prisma.taskFile.findMany.mockResolvedValue([
      { id: 'F1', key: 'k1' },
      { id: 'F2', key: 'k2' },
    ]);
    storage.remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(svc.purge(NOW)).resolves.toBe(1);
    expect(prisma.taskFile.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        deletedAt: { lt: new Date('2026-10-21T00:00:00Z') },
        purgedAt: null,
      },
      take: 500,
    });
    expect(prisma.taskFile.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['F1'] } },
      data: { purgedAt: NOW },
    });
  });
  it('nothing due: no stamp', async () => {
    await expect(svc.purge(NOW)).resolves.toBe(0);
    expect(prisma.taskFile.updateMany).not.toHaveBeenCalled();
  });
  it('files off: nothing', async () => {
    storage.enabled = false;
    await expect(svc.purge(NOW)).resolves.toBe(0);
    expect(prisma.taskFile.findMany).not.toHaveBeenCalled();
  });
});

it('config says whether files are on', () => {
  expect(svc.config()).toEqual({ filesEnabled: true });
  storage.enabled = false;
  expect(svc.config()).toEqual({ filesEnabled: false });
});

it('BadRequestException is what a refused file throws (the controller relies on it)', () => {
  expect(new BadRequestException(FILE_TYPE_MESSAGE).getStatus()).toBe(400);
});
