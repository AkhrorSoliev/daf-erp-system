import type { Prisma, PrismaClient } from '@prisma/client';
import {
  applyCommentTask,
  planCommentTask,
  TX_OPTIONS,
  tryApplyCommentTask,
} from '../../scripts/lib/comment-task-apply';
import {
  mapCommentTask,
  type CommentTaskRow,
} from '../../scripts/lib/comment-task-map';
import { scheduleTaskOutbox } from './task-outbox.service';

jest.mock('./task-outbox.service', () => ({ scheduleTaskOutbox: jest.fn() }));

const manual: CommentTaskRow = {
  id: 'c1',
  entityType: 'Student',
  entityId: '10001',
  content: 'Shartnomani imzolatish',
  isSystem: false,
  dueDate: new Date('2026-10-09T05:00:00Z'),
  priority: 'HIGH',
  authorId: 30,
  companyId: 1,
  createdAt: new Date('2026-10-01T05:00:00Z'),
  assignees: [
    {
      userId: 40,
      status: 'SEEN',
      seenAt: new Date('2026-10-02T05:00:00Z'),
      doneAt: null,
    },
    { userId: 41, status: 'PENDING', seenAt: null, doneAt: null },
  ],
  unmarkedLesson: null,
};

const lessonTask: CommentTaskRow = {
  ...manual,
  id: 'c2',
  isSystem: true,
  authorId: null,
  entityType: 'Group',
  entityId: 'g1',
  assignees: [manual.assignees[0]],
  unmarkedLesson: {
    id: 'u1',
    groupId: 'g1',
    date: new Date('2026-10-05T00:00:00Z'),
    claimedById: 40,
    status: 'PENDING',
    decidedAt: null,
  },
};

function makeTx() {
  return {
    task: { create: jest.fn().mockResolvedValue({ id: 't-new' }) },
    comment: { update: jest.fn().mockResolvedValue({}) },
    notification: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    unmarkedLesson: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}
const asTx = (tx: ReturnType<typeof makeTx>) =>
  tx as unknown as Prisma.TransactionClient;

beforeEach(() => jest.clearAllMocks());

describe('applyCommentTask', () => {
  it('writes the task with its participants and events, then stamps the comment', async () => {
    const tx = makeTx();
    const m = mapCommentTask(manual, 1);

    const id = await applyCommentTask(asTx(tx), manual, m);

    expect(id).toBe('t-new');
    expect(tx.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'MANUAL',
        status: 'IN_PROGRESS',
        branchId: 1,
        createdAt: manual.createdAt,
        participants: { create: m.participants },
        events: { create: m.events },
      }),
      select: { id: true },
    });
    expect(tx.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { migratedTaskId: 't-new' },
    });
  });

  it('points the legacy notifications at the task and changes nothing else on them', async () => {
    const tx = makeTx();
    await applyCommentTask(asTx(tx), manual, mapCommentTask(manual, 1));

    expect(tx.notification.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.notification.updateMany).toHaveBeenCalledWith({
      where: { commentId: 'c1' },
      data: { taskId: 't-new' },
    });
  });

  it('a manual task touches no lesson row', async () => {
    const tx = makeTx();
    await applyCommentTask(asTx(tx), manual, mapCommentTask(manual, 1));
    expect(tx.unmarkedLesson.updateMany).not.toHaveBeenCalled();
  });

  it('links a lesson only while no task points at it yet', async () => {
    const tx = makeTx();
    await applyCommentTask(asTx(tx), lessonTask, mapCommentTask(lessonTask, 2));

    expect(tx.unmarkedLesson.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', taskId: null },
      data: { taskId: 't-new' },
    });
  });

  describe('the reminder rows', () => {
    it('an open task is scheduled for its deadline, assignees only', async () => {
      const tx = makeTx();
      const m = mapCommentTask(manual, 1);
      await applyCommentTask(asTx(tx), manual, m);

      expect(scheduleTaskOutbox).toHaveBeenCalledTimes(1);
      expect(scheduleTaskOutbox).toHaveBeenCalledWith(tx, {
        id: 't-new',
        kind: 'MANUAL',
        priority: 'HIGH',
        dueAt: manual.dueDate,
        authorId: 30,
        participants: [
          { userId: 40, role: 'ASSIGNEE' },
          { userId: 41, role: 'ASSIGNEE' },
        ],
      });
    });

    it('a system task has no author to be told it is overdue', async () => {
      const tx = makeTx();
      await applyCommentTask(
        asTx(tx),
        lessonTask,
        mapCommentTask(lessonTask, 2),
      );
      expect(scheduleTaskOutbox).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ authorId: null }),
      );
    });

    it('a DONE task is scheduled for nothing', async () => {
      const tx = makeTx();
      const done: CommentTaskRow = {
        ...manual,
        assignees: [
          {
            userId: 40,
            status: 'DONE',
            seenAt: null,
            doneAt: new Date('2026-10-03T05:00:00Z'),
          },
        ],
      };
      await applyCommentTask(asTx(tx), done, mapCommentTask(done, 1));
      expect(scheduleTaskOutbox).not.toHaveBeenCalled();
    });
  });
});

describe('planCommentTask — a question asked again after the deploy', () => {
  const holder = { id: 't-live', createdAt: new Date('2026-10-07T04:00:00Z') };

  it('looks for an OPEN task with the lesson’s sourceKey', async () => {
    const db = { task: { findFirst: jest.fn().mockResolvedValue(null) } };
    const m = await planCommentTask(
      db as unknown as PrismaClient,
      lessonTask,
      2,
    );

    expect(db.task.findFirst).toHaveBeenCalledWith({
      where: {
        sourceKey: 'unmarked:g1:2026-10-05',
        status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] },
      },
      select: { id: true, createdAt: true },
    });
    expect(m.task.status).toBe('IN_PROGRESS');
    expect(m.supersededBy).toBeNull();
  });

  it('writes the old comment as a DONE row closed at the live task’s creation, sourceKey kept', async () => {
    const db = { task: { findFirst: jest.fn().mockResolvedValue(holder) } };
    const m = await planCommentTask(
      db as unknown as PrismaClient,
      lessonTask,
      2,
    );
    const tx = makeTx();

    await applyCommentTask(asTx(tx), lessonTask, m);

    expect(tx.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'DONE',
        closedAt: holder.createdAt,
        sourceKey: 'unmarked:g1:2026-10-05',
      }),
      select: { id: true },
    });
    // The comment is still stamped, and no reminder is queued for a closed row.
    expect(tx.comment.update).toHaveBeenCalledWith({
      where: { id: 'c2' },
      data: { migratedTaskId: 't-new' },
    });
    expect(scheduleTaskOutbox).not.toHaveBeenCalled();
    expect(m.supersededBy).toBe('t-live');
  });

  it('asks nothing for a task that is DONE anyway, or has no sourceKey', async () => {
    const db = { task: { findFirst: jest.fn() } };
    const held: CommentTaskRow = {
      ...lessonTask,
      unmarkedLesson: { ...lessonTask.unmarkedLesson!, status: 'HELD' },
    };
    await planCommentTask(db as unknown as PrismaClient, held, 2);
    await planCommentTask(db as unknown as PrismaClient, manual, 1);
    expect(db.task.findFirst).not.toHaveBeenCalled();
  });
});

describe('tryApplyCommentTask', () => {
  it('runs the steps in one transaction with the Neon timeouts', async () => {
    const tx = makeTx();
    const prisma = {
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };

    const r = await tryApplyCommentTask(
      prisma as unknown as PrismaClient,
      manual,
      mapCommentTask(manual, 1),
    );

    expect(r).toEqual({ ok: true, taskId: 't-new' });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      TX_OPTIONS,
    );
  });

  it('a failing task.create is reported, and the comment is never stamped', async () => {
    const tx = makeTx();
    tx.task.create.mockRejectedValue(new Error('unique violation'));
    const prisma = {
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };

    const r = await tryApplyCommentTask(
      prisma as unknown as PrismaClient,
      manual,
      mapCommentTask(manual, 1),
    );

    expect(r).toEqual({ ok: false, error: 'unique violation' });
    expect(tx.comment.update).not.toHaveBeenCalled();
    expect(tx.notification.updateMany).not.toHaveBeenCalled();
    expect(scheduleTaskOutbox).not.toHaveBeenCalled();
  });

  it('a failure after the task was created (comment stamp) is reported too — the transaction rolls it back', async () => {
    const tx = makeTx();
    tx.comment.update.mockRejectedValue(new Error('boom'));
    const prisma = {
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };

    const r = await tryApplyCommentTask(
      prisma as unknown as PrismaClient,
      manual,
      mapCommentTask(manual, 1),
    );

    expect(r).toEqual({ ok: false, error: 'boom' });
    expect(scheduleTaskOutbox).not.toHaveBeenCalled();
  });
});
