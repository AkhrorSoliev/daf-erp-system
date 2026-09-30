import { BadRequestException } from '@nestjs/common';
import {
  assertMakeUpAhead,
  CANCELLED_BEFORE_REASON,
  closeTasksOfDeletedGroup,
  MOVED_BEFORE_REASON,
  markUnmarkedLessonCancelled,
  markUnmarkedLessonRescheduled,
  reopenAfterCancellationRemoved,
  reopenAfterRescheduleRemoved,
} from './unmarked-lesson-transitions';

const date = new Date('2026-09-28T00:00:00.000Z');
// A cancellation or move made the day before that lesson (28.09 16:00–17:30).
const before = new Date('2026-09-27T10:00:00.000Z');
// The removed move, read by id: 28.09 moved to Tuesday 29.09.
const makeUpDay = new Date('2026-09-29T00:00:00.000Z');
const removedMove = (over = {}) => ({
  groupId: 'g1',
  originalDate: date,
  newDate: makeUpDay,
  createdAt: before,
  ...over,
});
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
    lessonReschedule: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      ...mocks.lessonReschedule,
    },
    lessonCancellation: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...mocks.lessonCancellation,
    },
    holiday: {
      findMany: jest.fn().mockResolvedValue([]),
      ...mocks.holiday,
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
      cancelledAt: before,
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
      cancelledAt: before,
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

  // Human ruling 2026-09-30: only the CEO grants pay (Q9). A cancellation made
  // once the lesson had ended (17:30 Tashkent on 28.09), then deleted, opens a
  // normal question — else cancel-then-delete after the lesson pays the teacher.
  it('opens a question that is not exempt when the cancellation came at or after the lesson end', async () => {
    const tx = makeTx();
    await reopenAfterCancellationRemoved(tx, {
      cancellationId: 'x1',
      groupId: 'g1',
      date,
      cancelledAt: new Date('2026-09-28T12:30:00.000Z'), // 17:30 Tashkent
      now,
      holidays: new Set(),
    });
    expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teacherPayExempt: false,
        exemptReason: null,
      }),
    });
  });

  it('keeps it exempt for a cancellation made a minute before the end', async () => {
    const tx = makeTx();
    await reopenAfterCancellationRemoved(tx, {
      cancellationId: 'x1',
      groupId: 'g1',
      date,
      cancelledAt: new Date('2026-09-28T12:29:00.000Z'), // 17:29 Tashkent
      now,
      holidays: new Set(),
    });
    expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teacherPayExempt: true,
        exemptReason: CANCELLED_BEFORE_REASON,
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
      cancelledAt: before,
      now,
      holidays: new Set(),
    });
    const later = makeTx();
    await reopenAfterCancellationRemoved(later, {
      cancellationId: 'x1',
      groupId: 'g1',
      date: new Date('2026-10-05T00:00:00.000Z'),
      cancelledAt: before,
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
      cancelledAt: before,
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
    tx.lessonReschedule.findUnique.mockResolvedValue(removedMove());
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
    tx.lessonReschedule.findUnique.mockResolvedValue(removedMove());
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

  // A lesson answered «Bo'ldi» and then cancelled keeps its (EXCUSED) rows:
  // PENDING again would refuse «Bo'ldi» for ever. The row stays as it is.
  it('leaves an answered row as it is when its day already has attendance', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findFirst.mockResolvedValue(
      row({ status: 'NOT_HELD', cancellationId: 'x1' }),
    );
    tx.attendance.findFirst.mockResolvedValue({ id: 'a1' });
    await reopenAfterCancellationRemoved(tx, {
      cancellationId: 'x1',
      groupId: 'g1',
      date,
      cancelledAt: before,
      now,
      holidays: new Set(),
    });
    expect(tx.attendance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 'g1', date } }),
    );
    expect(tx.unmarkedLesson.update).not.toHaveBeenCalled();
    expect(tx.comment.create).not.toHaveBeenCalled();
  });

  // The make-up lesson was held on 29.09: asking about 28.09 again and
  // answering «Bo'ldi» would bill the one lesson twice.
  it.each([
    ['an answered move', row({ status: 'RESCHEDULED', rescheduleId: 'r1' })],
    ['a move made in advance', null],
  ])(
    'asks nothing again for %s whose make-up lesson has attendance',
    async (_label, answered) => {
      const tx = makeTx();
      tx.lessonReschedule.findUnique.mockResolvedValue(removedMove());
      tx.unmarkedLesson.findFirst.mockResolvedValue(answered);
      tx.attendance.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.date.getTime() === makeUpDay.getTime() ? { id: 'a9' } : null,
        ),
      );
      await reopenAfterRescheduleRemoved(tx, {
        rescheduleId: 'r1',
        now,
        holidays: new Set(),
      });
      expect(tx.unmarkedLesson.update).not.toHaveBeenCalled();
      expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
      expect(tx.comment.create).not.toHaveBeenCalled();
    },
  );
});

// Addendum A: a move made in advance leaves no UnmarkedLesson row, so deleting
// it after the original lesson ended must ask about that lesson for the first
// time — the way deleting a cancellation does.
describe('reopenAfterRescheduleRemoved — a move made in advance', () => {
  const now = new Date('2026-09-30T09:00:00.000Z'); // Wed 14:00 Tashkent
  const args = { rescheduleId: 'r1', now, holidays: new Set<string>() };

  // No row carries this move; the removed move is read by id.
  const txWithRemovedMove = (
    originalDate: Date = date,
    createdAt: Date = before,
  ) => {
    const tx = makeTx();
    tx.lessonReschedule.findUnique.mockResolvedValue(
      removedMove({ originalDate, createdAt }),
    );
    return tx;
  };

  // Human ruling 2026-09-30, as for a cancellation.
  it('opens a question that is not exempt when the move came after the lesson end', async () => {
    const tx = txWithRemovedMove(date, new Date('2026-09-28T14:00:00.000Z'));
    await reopenAfterRescheduleRemoved(tx, args);
    expect(tx.lessonReschedule.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ createdAt: true }),
      }),
    );
    expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        date,
        teacherPayExempt: false,
        exemptReason: null,
      }),
    });
  });

  it('opens an exempt question for the original date once it has ended', async () => {
    const tx = txWithRemovedMove();
    await reopenAfterRescheduleRemoved(tx, args);

    expect(tx.lessonReschedule.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' } }),
    );
    expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
      data: {
        companyId: 1,
        branchId: 2,
        groupId: 'g1',
        date,
        lessonStartTime: '16:00',
        lessonEndTime: '17:30',
        teacherPayExempt: true,
        exemptReason: MOVED_BEFORE_REASON,
        taskCommentId: 'c2',
      },
    });
    expect(MOVED_BEFORE_REASON).toBe("Dars oldindan ko'chirilgan edi");
    // Wednesday 30.09 → the next working day is Thursday 01.10, 10:00 Tashkent.
    expect(tx.comment.create.mock.calls[0][0].data.dueDate).toEqual(
      new Date('2026-10-01T05:00:00.000Z'),
    );
  });

  it('skips a holiday when it sets the task due date', async () => {
    const tx = txWithRemovedMove();
    await reopenAfterRescheduleRemoved(tx, {
      ...args,
      holidays: new Set(['2026-10-01']),
    });
    expect(tx.comment.create.mock.calls[0][0].data.dueDate).toEqual(
      new Date('2026-10-02T05:00:00.000Z'),
    );
  });

  it('opens nothing while the original lesson has not ended', async () => {
    const later = txWithRemovedMove(new Date('2026-10-05T00:00:00.000Z'));
    await reopenAfterRescheduleRemoved(later, args);

    // Today's lesson, 17:30 not yet reached at 14:00.
    const today = txWithRemovedMove(new Date('2026-09-30T00:00:00.000Z'));
    await reopenAfterRescheduleRemoved(today, args);

    expect(later.unmarkedLesson.create).not.toHaveBeenCalled();
    expect(today.unmarkedLesson.create).not.toHaveBeenCalled();
  });

  it('opens nothing when the original day already has attendance', async () => {
    const tx = txWithRemovedMove();
    tx.attendance.findFirst.mockResolvedValue({ id: 'a1' });
    await reopenAfterRescheduleRemoved(tx, args);
    expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
  });

  it('opens nothing when a row already exists for the original date', async () => {
    const tx = txWithRemovedMove();
    tx.unmarkedLesson.findUnique.mockResolvedValue({ id: 'u9' });
    await reopenAfterRescheduleRemoved(tx, args);
    expect(tx.unmarkedLesson.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId_date: { groupId: 'g1', date } },
      }),
    );
    expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
  });

  // The lesson-end sweep never asks about a holiday or a cancelled day, and a
  // move can outlive both (a holiday declared after it, a stale-tab cancel).
  it('opens nothing when the original day is a holiday for the branch', async () => {
    const tx = txWithRemovedMove();
    tx.holiday.findMany.mockResolvedValue([
      { date, endDate: date }, // 28.09, the original day
    ]);
    await reopenAfterRescheduleRemoved(tx, args);
    expect(tx.holiday.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ branchId: null }, { branchId: 2 }],
        }),
      }),
    );
    expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
  });

  it('opens nothing when the original day has a live cancellation', async () => {
    const tx = txWithRemovedMove();
    tx.lessonCancellation.findFirst.mockResolvedValue({ id: 'x9' });
    await reopenAfterRescheduleRemoved(tx, args);
    expect(tx.lessonCancellation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'g1', date, deletedAt: null },
      }),
    );
    expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
  });

  it('opens nothing for a deleted group', async () => {
    const tx = txWithRemovedMove();
    tx.group.findUnique.mockResolvedValue({
      name: '#014',
      companyId: 1,
      branchId: 2,
      lessonStartTime: '16:00',
      lessonEndTime: '17:30',
      deletedAt: new Date('2026-09-29T00:00:00.000Z'),
    });
    await reopenAfterRescheduleRemoved(tx, args);
    expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
  });

  it('leaves an answered move on the existing path', async () => {
    const tx = txWithRemovedMove();
    tx.unmarkedLesson.findFirst.mockResolvedValue(
      row({ status: 'RESCHEDULED', rescheduleId: 'r1' }),
    );
    await reopenAfterRescheduleRemoved(tx, args);
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
    expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
  });

  it('opens nothing when the removed move cannot be read', async () => {
    const tx = makeTx();
    await reopenAfterRescheduleRemoved(tx, args);
    expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
  });

  it("times the question by another live move's times when the original day is its new date", async () => {
    const tx = txWithRemovedMove(new Date('2026-09-30T00:00:00.000Z'));
    // Group meets 16:00–17:30, but today's lesson was moved here for 10:00–11:00.
    tx.lessonReschedule.findFirst.mockResolvedValue({
      newLessonStartTime: '10:00',
      newLessonEndTime: '11:00',
    });
    await reopenAfterRescheduleRemoved(tx, args);
    expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lessonStartTime: '10:00',
        lessonEndTime: '11:00',
        exemptReason: MOVED_BEFORE_REASON,
      }),
    });
  });
});

// Addendum A item 2: a day that is itself the new date of another live move
// runs on that move's times, both for «has it ended» and for the row.
describe('reopenAfterCancellationRemoved — a day moved here', () => {
  const now = new Date('2026-09-30T09:00:00.000Z'); // Wed 14:00 Tashkent
  const today = new Date('2026-09-30T00:00:00.000Z');
  const args = {
    cancellationId: 'x1',
    groupId: 'g1',
    date: today,
    cancelledAt: before,
    now,
    holidays: new Set<string>(),
  };

  // The lesson's end is the move's 11:00, not the group's 17:30.
  it("judges the cancellation's time against the move's end", async () => {
    const tx = makeTx();
    tx.lessonReschedule.findFirst.mockResolvedValue({
      newLessonStartTime: '10:00',
      newLessonEndTime: '11:00',
    });
    await reopenAfterCancellationRemoved(tx, {
      ...args,
      cancelledAt: new Date('2026-09-30T06:30:00.000Z'), // 11:30 Tashkent
    });
    expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teacherPayExempt: false,
        exemptReason: null,
      }),
    });
  });

  it("carries the move's times and judges «ended» on them", async () => {
    const tx = makeTx();
    // Group ends 17:30 (not yet at 14:00), the move ended at 11:00.
    tx.lessonReschedule.findFirst.mockResolvedValue({
      newLessonStartTime: '10:00',
      newLessonEndTime: '11:00',
    });
    await reopenAfterCancellationRemoved(tx, args);

    expect(tx.lessonReschedule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'g1', deletedAt: null, newDate: today },
      }),
    );
    expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        date: today,
        lessonStartTime: '10:00',
        lessonEndTime: '11:00',
        teacherPayExempt: true,
        exemptReason: CANCELLED_BEFORE_REASON,
      }),
    });
  });

  it('opens nothing while the move has not ended, even if the group time has', async () => {
    const tx = makeTx({
      group: {
        findUnique: jest.fn().mockResolvedValue({
          name: '#014',
          companyId: 1,
          branchId: 2,
          lessonStartTime: '08:00',
          lessonEndTime: '09:30',
          deletedAt: null,
        }),
      },
    });
    tx.lessonReschedule.findFirst.mockResolvedValue({
      newLessonStartTime: '18:00',
      newLessonEndTime: '19:00',
    });
    await reopenAfterCancellationRemoved(tx, args);
    expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
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
