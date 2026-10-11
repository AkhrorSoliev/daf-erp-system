import { BadRequestException } from '@nestjs/common';
import { changeStatusTx } from './task-status-writes';
import { PHOTO_REQUIRED_MESSAGE } from './task-transitions';

const createdAt = new Date('2026-10-11T05:00:00Z');
const tx = (photos: number) => ({
  taskFile: { count: jest.fn().mockResolvedValue(photos) },
  task: { update: jest.fn().mockResolvedValue({ id: 'T1' }) },
  taskEvent: { create: jest.fn() },
  taskParticipant: { updateMany: jest.fn() },
  taskOutbox: { deleteMany: jest.fn() },
});
const ctx = (over: Record<string, unknown> = {}) =>
  ({
    row: {
      id: 'T1',
      status: 'IN_PROGRESS',
      kind: 'MANUAL',
      authorId: 30,
      requiresPhoto: true,
      createdAt,
      lastReturnedAt: null,
      claimedById: null,
      startedAt: createdAt,
      participants: [{ userId: 40, role: 'ASSIGNEE' }],
      ...over,
    },
    access: { canWork: true, isAssignee: true },
  }) as never;

it('a photo task without a fresh photo stays where it is: 400, nothing written', async () => {
  const t = tx(0);
  await expect(
    changeStatusTx(t as never, ctx(), 'IN_REVIEW', 40),
  ).rejects.toThrow(new BadRequestException(PHOTO_REQUIRED_MESSAGE));
  expect(t.task.update).not.toHaveBeenCalled();
  // Only the assignees' images count (Task 4, I2), read with the same tx.
  expect(t.taskFile.count).toHaveBeenCalledWith({
    where: {
      taskId: 'T1',
      kind: 'IMAGE',
      deletedAt: null,
      uploadedById: { in: [40] },
      createdAt: { gt: createdAt },
    },
  });
});

it('with a photo added after the last return it goes to review', async () => {
  const lastReturnedAt = new Date('2026-10-12T05:00:00Z');
  const t = tx(1);
  await changeStatusTx(t as never, ctx({ lastReturnedAt }), 'IN_REVIEW', 40);
  expect(t.taskFile.count.mock.calls[0][0].where.createdAt).toEqual({
    gt: lastReturnedAt,
  });
  expect(t.task.update).toHaveBeenCalled();
});

it('no question asked when no photo is required, or when only starting', async () => {
  const plain = tx(0);
  await changeStatusTx(
    plain as never,
    ctx({ requiresPhoto: false }),
    'IN_REVIEW',
    40,
  );
  await changeStatusTx(
    plain as never,
    ctx({ status: 'NEW' }),
    'IN_PROGRESS',
    40,
  );
  expect(plain.taskFile.count).not.toHaveBeenCalled();
});

it('a self-task (author = only assignee) closes without a photo, as the table says', async () => {
  const t = tx(0);
  await changeStatusTx(t as never, ctx({ authorId: 40 }), 'DONE', 40);
  expect(t.taskFile.count).not.toHaveBeenCalled();
  expect(t.task.update).toHaveBeenCalled();
});
