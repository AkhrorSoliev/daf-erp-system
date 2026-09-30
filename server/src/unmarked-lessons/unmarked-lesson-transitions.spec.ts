import { BadRequestException } from '@nestjs/common';
import {
  assertMakeUpAhead,
  closeTasksOfDeletedGroup,
  markUnmarkedLessonCancelled,
  markUnmarkedLessonRescheduled,
  reopenAfterCancellationRemoved,
  reopenAfterRescheduleRemoved,
} from './unmarked-lesson-transitions';

const date = new Date('2026-09-28T00:00:00.000Z');
const row = (over = {}) => ({
  id: 'u1',
  companyId: 1,
  branchId: 2,
  groupId: 'g1',
  date,
  lessonStartTime: '16:00',
  lessonEndTime: '17:30',
  status: 'PENDING',
  teacherPayExempt: false,
  claimedById: null,
  taskCommentId: 'c1',
  ...over,
});

function makeTx(mocks: any = {}) {
  return {
    unmarkedLesson: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      ...mocks.unmarkedLesson,
    },
    group: {
      findUnique: jest.fn().mockResolvedValue({
        name: '#014',
        companyId: 1,
        branchId: 2,
        lessonStartTime: '16:00',
        lessonEndTime: '17:30',
        deletedAt: null,
      }),
      ...mocks.group,
    },
    attendance: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...mocks.attendance,
    },
    commentAssignee: {
      findUnique: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      ...mocks.commentAssignee,
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }]), ...mocks.user },
    comment: {
      create: jest.fn().mockResolvedValue({ id: 'c2' }),
      ...mocks.comment,
    },
  } as any;
}

describe('markUnmarkedLessonCancelled', () => {
  it('answers a pending lesson NOT_HELD and closes its task', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findUnique.mockResolvedValue(row());
    const decision = await markUnmarkedLessonCancelled(tx, {
      groupId: 'g1',
      date,
      cancellationId: 'x1',
      actorId: 9,
    });
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        status: 'NOT_HELD',
        cancellationId: 'x1',
        decidedById: 9,
        decidedAt: expect.any(Date),
      },
    });
    expect(tx.commentAssignee.updateMany).toHaveBeenCalled();
    expect(tx.unmarkedLesson.updateMany).toHaveBeenCalledWith({
      where: { taskCommentId: 'c1' },
      data: { claimedById: 9 },
    });
    expect(decision).toEqual({
      companyId: 1,
      branchId: 2,
      groupId: 'g1',
      groupName: '#014',
      date: '2026-09-28',
      lessonStartTime: '16:00',
      lessonEndTime: '17:30',
    });
  });

  it("turns a wrong «Bo'ldi» into NOT_HELD without touching the closed task", async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findUnique.mockResolvedValue(row({ status: 'HELD' }));
    expect(
      await markUnmarkedLessonCancelled(tx, {
        groupId: 'g1',
        date,
        cancellationId: 'x1',
        actorId: 9,
      }),
    ).not.toBeNull();
    expect(tx.commentAssignee.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing for a lesson nobody asked about', async () => {
    const tx = makeTx();
    expect(
      await markUnmarkedLessonCancelled(tx, {
        groupId: 'g1',
        date,
        cancellationId: 'x1',
        actorId: 9,
      }),
    ).toBeNull();
    expect(tx.unmarkedLesson.update).not.toHaveBeenCalled();
  });
});

describe('assertMakeUpAhead', () => {
  const now = new Date('2026-09-30T09:00:00.000Z'); // 14:00 Tashkent

  it('accepts a later day, or later today', () => {
    expect(() =>
      assertMakeUpAhead(new Date('2026-10-01T00:00:00.000Z'), '10:00', now),
    ).not.toThrow();
    expect(() =>
      assertMakeUpAhead(new Date('2026-09-30T00:00:00.000Z'), '15:00', now),
    ).not.toThrow();
  });

  it('refuses a make-up lesson that has already started', () => {
    expect(() =>
      assertMakeUpAhead(new Date('2026-09-30T00:00:00.000Z'), '14:00', now),
    ).toThrow(BadRequestException);
    expect(() =>
      assertMakeUpAhead(new Date('2026-09-29T00:00:00.000Z'), '18:00', now),
    ).toThrow(BadRequestException);
  });
});

describe('markUnmarkedLessonRescheduled', () => {
  const args = {
    groupId: 'g1',
    originalDate: date,
    rescheduleId: 'r1',
    actorId: 9,
    newDate: new Date('2026-10-01T00:00:00.000Z'),
    newStartTime: '16:00',
    now: new Date('2026-09-30T09:00:00.000Z'),
  };

  it('answers a pending lesson RESCHEDULED', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findUnique.mockResolvedValue(row());
    expect(await markUnmarkedLessonRescheduled(tx, args)).not.toBeNull();
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        status: 'RESCHEDULED',
        rescheduleId: 'r1',
        decidedById: 9,
        decidedAt: args.now,
      },
    });
  });

  it("refuses to move a lesson answered «Bo'ldi»", async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findUnique.mockResolvedValue(row({ status: 'HELD' }));
    await expect(markUnmarkedLessonRescheduled(tx, args)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses a make-up lesson in the past', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findUnique.mockResolvedValue(row());
    await expect(
      markUnmarkedLessonRescheduled(tx, {
        ...args,
        newDate: new Date('2026-09-29T00:00:00.000Z'),
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('reopening', () => {
  const now = new Date('2026-09-30T09:00:00.000Z');

  it('puts a cancelled answer back to PENDING with a new task', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findFirst.mockResolvedValue(
      row({ status: 'NOT_HELD', cancellationId: 'x1' }),
    );
    await reopenAfterCancellationRemoved(tx, {
      cancellationId: 'x1',
      groupId: 'g1',
      date,
      now,
      holidays: new Set(),
    });
    expect(tx.comment.create).toHaveBeenCalled();
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        status: 'PENDING',
        cancellationId: null,
        rescheduleId: null,
        decidedById: null,
        decidedAt: null,
        claimedById: null,
        taskCommentId: 'c2',
      },
    });
  });

  it('opens an exempt question for an ended lesson that was cancelled beforehand', async () => {
    const tx = makeTx();
    await reopenAfterCancellationRemoved(tx, {
      cancellationId: 'x1',
      groupId: 'g1',
      date,
      now,
      holidays: new Set(),
    });
    expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: 'g1',
        date,
        teacherPayExempt: true,
        taskCommentId: 'c2',
      }),
    });
  });

  it('opens nothing when the lesson was marked or has not ended', async () => {
    const tx = makeTx();
    tx.attendance.findFirst.mockResolvedValue({ id: 'a1' });
    await reopenAfterCancellationRemoved(tx, {
      cancellationId: 'x1',
      groupId: 'g1',
      date,
      now,
      holidays: new Set(),
    });
    const later = makeTx();
    await reopenAfterCancellationRemoved(later, {
      cancellationId: 'x1',
      groupId: 'g1',
      date: new Date('2026-10-05T00:00:00.000Z'),
      now,
      holidays: new Set(),
    });
    expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
    expect(later.unmarkedLesson.create).not.toHaveBeenCalled();
  });

  it('skips holidays when calculating task due date', async () => {
    const tx = makeTx();
    // Oct 1 is a holiday, so next working day is Oct 2
    const holidays = new Set(['2026-10-01']);
    await reopenAfterCancellationRemoved(tx, {
      cancellationId: 'x1',
      groupId: 'g1',
      date,
      now,
      holidays,
    });
    // Task due date should be Oct 2 at 05:00 UTC (10:00 Tashkent)
    const createCall = tx.comment.create.mock.calls[0][0];
    expect(createCall.data.dueDate).toEqual(
      new Date('2026-10-02T05:00:00.000Z'),
    );
  });

  it('skips multiple holidays when calculating task due date for reschedule', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findFirst.mockResolvedValue(
      row({ status: 'RESCHEDULED', rescheduleId: 'r1' }),
    );
    // Oct 1-3 are holidays, so next working day skips to Oct 5 (Oct 4 is Sunday)
    const holidays = new Set(['2026-10-01', '2026-10-02', '2026-10-03']);
    await reopenAfterRescheduleRemoved(tx, {
      rescheduleId: 'r1',
      now,
      holidays,
    });
    // Task due date should be Oct 5 at 05:00 UTC (10:00 Tashkent)
    const createCall = tx.comment.create.mock.calls[0][0];
    expect(createCall.data.dueDate).toEqual(
      new Date('2026-10-05T05:00:00.000Z'),
    );
  });

  it('puts a moved answer back to PENDING', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findFirst.mockResolvedValue(
      row({ status: 'RESCHEDULED', rescheduleId: 'r1' }),
    );
    await reopenAfterRescheduleRemoved(tx, {
      rescheduleId: 'r1',
      now,
      holidays: new Set(),
    });
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });
});

describe('closeTasksOfDeletedGroup', () => {
  it('closes the tasks of every pending lesson', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findMany.mockResolvedValue([
      { taskCommentId: 'c1' },
      { taskCommentId: 'c3' },
    ]);
    await closeTasksOfDeletedGroup(tx, 'g1');
    expect(tx.commentAssignee.updateMany).toHaveBeenCalledTimes(2);
  });
});
