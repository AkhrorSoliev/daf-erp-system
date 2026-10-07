import { mapCommentTask } from '../../scripts/lib/comment-task-map';

const base = {
  id: 'c1',
  entityType: 'Student',
  entityId: '10001',
  content: 'Shartnomani imzolatish',
  isSystem: false,
  dueDate: new Date('2026-10-06T13:00:00Z'),
  priority: 'URGENT' as const,
  authorId: 30,
  companyId: 1,
  createdAt: new Date('2026-10-01T05:00:00Z'),
  assignees: [
    {
      userId: 40,
      status: 'SEEN' as const,
      seenAt: new Date('2026-10-02T05:00:00Z'),
      doneAt: null,
    },
  ],
  unmarkedLesson: null,
};

const lesson = {
  id: 'u1',
  groupId: 'g1',
  date: new Date('2026-10-05T00:00:00Z'),
  claimedById: 40,
  status: 'PENDING' as const,
  decidedAt: null,
};
const system = {
  ...base,
  isSystem: true,
  authorId: null,
  entityType: 'Group',
  entityId: 'g1',
  unmarkedLesson: lesson,
};
const pendingAssignee = {
  userId: 40,
  status: 'PENDING' as const,
  seenAt: null,
  doneAt: null,
};

describe('mapCommentTask', () => {
  it('manual SEEN → IN_PROGRESS, title = content, author kept', () => {
    const m = mapCommentTask(base, 1);
    expect(m.task).toMatchObject({
      kind: 'MANUAL',
      status: 'IN_PROGRESS',
      title: 'Shartnomani imzolatish',
      authorId: 30,
      priority: 'URGENT',
      branchId: 1,
      companyId: 1,
    });
    expect(m.participants).toEqual([
      { userId: 40, role: 'ASSIGNEE', seenAt: base.assignees[0].seenAt },
    ]);
  });

  it('all DONE → DONE with closedAt = last doneAt', () => {
    const done = new Date('2026-10-03T05:00:00Z');
    const m = mapCommentTask(
      {
        ...base,
        assignees: [{ userId: 40, status: 'DONE', seenAt: null, doneAt: done }],
      },
      1,
    );
    expect(m.task).toMatchObject({ status: 'DONE', closedAt: done });
  });

  it('system → LESSON_QUESTION with sourceKey and no author', () => {
    const m = mapCommentTask(system, 2);
    expect(m.task).toMatchObject({
      kind: 'LESSON_QUESTION',
      authorId: null,
      sourceKey: 'unmarked:g1:2026-10-05',
      claimedById: 40,
    });
    expect(m.lessonLink).toBe(true);
  });

  it('a long content splits into title (200) + description', () => {
    const m = mapCommentTask({ ...base, content: 'x'.repeat(250) }, 1);
    expect(m.task.title).toHaveLength(200);
    expect(m.task.description).toHaveLength(50);
  });

  it('exactly 200 characters stay whole, with no description', () => {
    const m = mapCommentTask({ ...base, content: 'x'.repeat(200) }, 1);
    expect(m.task.title).toHaveLength(200);
    expect(m.task.description).toBeNull();
    const short = mapCommentTask({ ...base, content: 'x'.repeat(199) }, 1);
    expect(short.task.description).toBeNull();
  });

  it('no priority → MEDIUM', () => {
    expect(mapCommentTask({ ...base, priority: null }, 1).task.priority).toBe(
      'MEDIUM',
    );
  });

  describe('manual task statuses', () => {
    it('nobody opened it → NEW, not started, not closed', () => {
      const m = mapCommentTask({ ...base, assignees: [pendingAssignee] }, 1);
      expect(m.task).toMatchObject({
        status: 'NEW',
        startedAt: null,
        closedAt: null,
      });
    });

    it('no assignees at all → NEW (never DONE by an empty every())', () => {
      const m = mapCommentTask({ ...base, assignees: [] }, 1);
      expect(m.task.status).toBe('NEW');
      expect(m.participants).toEqual([]);
    });

    it('mixed PENDING and DONE → IN_PROGRESS', () => {
      const m = mapCommentTask(
        {
          ...base,
          assignees: [
            pendingAssignee,
            {
              userId: 41,
              status: 'DONE',
              seenAt: null,
              doneAt: new Date('2026-10-03T05:00:00Z'),
            },
          ],
        },
        1,
      );
      expect(m.task).toMatchObject({ status: 'IN_PROGRESS', closedAt: null });
    });

    it('IN_PROGRESS starts at the earliest seenAt, else createdAt', () => {
      const early = new Date('2026-10-01T09:00:00Z');
      const m = mapCommentTask(
        {
          ...base,
          assignees: [
            { ...base.assignees[0], seenAt: new Date('2026-10-02T05:00:00Z') },
            { userId: 41, status: 'SEEN', seenAt: early, doneAt: null },
          ],
        },
        1,
      );
      expect(m.task.startedAt).toEqual(early);

      const noSeenAt = mapCommentTask(
        {
          ...base,
          assignees: [
            { userId: 40, status: 'SEEN', seenAt: null, doneAt: null },
          ],
        },
        1,
      );
      expect(noSeenAt.task.startedAt).toEqual(base.createdAt);
    });

    it('DONE without any doneAt closes at createdAt', () => {
      const m = mapCommentTask(
        {
          ...base,
          assignees: [
            { userId: 40, status: 'DONE', seenAt: null, doneAt: null },
          ],
        },
        1,
      );
      expect(m.task).toMatchObject({
        status: 'DONE',
        closedAt: base.createdAt,
      });
    });
  });

  describe('events', () => {
    it('an open task has one CREATED event by the author, from the system', () => {
      const m = mapCommentTask(base, 1);
      expect(m.events).toEqual([
        {
          type: 'CREATED',
          actorId: 30,
          via: 'SYSTEM',
          createdAt: base.createdAt,
        },
      ]);
    });

    it('a system task is created by nobody (Tizim)', () => {
      const m = mapCommentTask(system, 2);
      expect(m.events).toEqual([
        {
          type: 'CREATED',
          actorId: null,
          via: 'SYSTEM',
          createdAt: base.createdAt,
        },
      ]);
    });

    it('a DONE manual task gets a STATUS event at closedAt', () => {
      const done = new Date('2026-10-03T05:00:00Z');
      const m = mapCommentTask(
        {
          ...base,
          assignees: [
            { userId: 40, status: 'DONE', seenAt: null, doneAt: done },
          ],
        },
        1,
      );
      expect(m.events).toEqual([
        expect.objectContaining({ type: 'CREATED' }),
        {
          type: 'STATUS',
          actorId: null,
          via: 'SYSTEM',
          meta: { to: 'DONE' },
          createdAt: done,
        },
      ]);
    });

    it('a DONE lesson task gets an AUTO_CLOSED event at closedAt', () => {
      const decidedAt = new Date('2026-10-06T07:00:00Z');
      const m = mapCommentTask(
        {
          ...system,
          unmarkedLesson: { ...lesson, status: 'HELD', decidedAt },
        },
        2,
      );
      expect(m.events[1]).toEqual({
        type: 'AUTO_CLOSED',
        actorId: null,
        via: 'SYSTEM',
        meta: { to: 'DONE' },
        createdAt: decidedAt,
      });
    });
  });

  describe('a system task takes its status from the lesson row', () => {
    it('PENDING lesson, nobody opened it → NEW, not closed', () => {
      const m = mapCommentTask({ ...system, assignees: [pendingAssignee] }, 2);
      expect(m.task).toMatchObject({
        status: 'NEW',
        startedAt: null,
        closedAt: null,
      });
    });

    it('PENDING lesson, an assignee SEEN it → IN_PROGRESS', () => {
      const m = mapCommentTask(system, 2);
      expect(m.task).toMatchObject({
        status: 'IN_PROGRESS',
        startedAt: base.assignees[0].seenAt,
        closedAt: null,
      });
    });

    it('HELD lesson whose assignees are still PENDING → DONE at decidedAt', () => {
      const decidedAt = new Date('2026-10-06T07:00:00Z');
      const m = mapCommentTask(
        {
          ...system,
          assignees: [pendingAssignee],
          unmarkedLesson: { ...lesson, status: 'HELD', decidedAt },
        },
        2,
      );
      expect(m.task).toMatchObject({ status: 'DONE', closedAt: decidedAt });
    });

    it('answered without decidedAt → DONE at the last doneAt, else createdAt', () => {
      const done = new Date('2026-10-06T08:00:00Z');
      const answered = { ...lesson, status: 'NOT_HELD' as const };
      const withDone = mapCommentTask(
        {
          ...system,
          assignees: [
            { userId: 40, status: 'DONE', seenAt: null, doneAt: done },
          ],
          unmarkedLesson: answered,
        },
        2,
      );
      expect(withDone.task).toMatchObject({ status: 'DONE', closedAt: done });

      const bare = mapCommentTask(
        { ...system, assignees: [], unmarkedLesson: answered },
        2,
      );
      expect(bare.task).toMatchObject({
        status: 'DONE',
        closedAt: system.createdAt,
      });
    });

    it('a system comment its lesson no longer points at is DONE, flagged no-lesson', () => {
      const m = mapCommentTask({ ...system, unmarkedLesson: null }, 2);
      expect(m.task).toMatchObject({
        kind: 'LESSON_QUESTION',
        status: 'DONE',
        closedAt: system.createdAt,
        sourceKey: null,
      });
      expect(m.noLesson).toBe(true);
      expect(m.lessonLink).toBe(false);
      expect(m.events[1]).toMatchObject({
        type: 'STATUS',
        meta: { to: 'DONE' },
      });
    });

    it('…closing at the last doneAt when a copy was done', () => {
      const done = new Date('2026-10-04T08:00:00Z');
      const m = mapCommentTask(
        {
          ...system,
          unmarkedLesson: null,
          assignees: [
            { userId: 40, status: 'DONE', seenAt: null, doneAt: done },
          ],
        },
        2,
      );
      expect(m.task.closedAt).toEqual(done);
    });

    it('a lesson task with a lesson is not flagged no-lesson', () => {
      expect(mapCommentTask(system, 2).noLesson).toBe(false);
      expect(mapCommentTask(base, 1).noLesson).toBe(false);
    });
  });

  describe('a taken open lesson task belongs to its claimant', () => {
    const other = {
      userId: 41,
      status: 'PENDING' as const,
      seenAt: null,
      doneAt: null,
    };

    it('keeps only the claimant as ASSIGNEE', () => {
      const m = mapCommentTask(
        { ...system, assignees: [base.assignees[0], other] },
        2,
      );
      expect(m.participants.map((p) => p.userId)).toEqual([40]);
    });

    it('keeps everyone when nobody claimed it', () => {
      const m = mapCommentTask(
        {
          ...system,
          unmarkedLesson: { ...lesson, claimedById: null },
          assignees: [base.assignees[0], other],
        },
        2,
      );
      expect(m.participants.map((p) => p.userId)).toEqual([40, 41]);
    });

    it('keeps everyone when the claimant has no copy left', () => {
      const m = mapCommentTask(
        { ...system, assignees: [other, { ...other, userId: 42 }] },
        2,
      );
      expect(m.participants.map((p) => p.userId)).toEqual([41, 42]);
    });

    it('keeps everyone on a closed one (history)', () => {
      const m = mapCommentTask(
        {
          ...system,
          unmarkedLesson: { ...lesson, status: 'HELD' },
          assignees: [base.assignees[0], other],
        },
        2,
      );
      expect(m.participants.map((p) => p.userId)).toEqual([40, 41]);
    });
  });

  describe('superseded by a live task', () => {
    const holder = {
      id: 't-live',
      createdAt: new Date('2026-10-07T04:00:00Z'),
    };

    it('becomes DONE at the live task’s creation, sourceKey kept, everyone kept', () => {
      const other = {
        userId: 41,
        status: 'PENDING' as const,
        seenAt: null,
        doneAt: null,
      };
      const m = mapCommentTask(
        { ...system, assignees: [base.assignees[0], other] },
        2,
        holder,
      );
      expect(m.task).toMatchObject({
        status: 'DONE',
        closedAt: holder.createdAt,
        sourceKey: 'unmarked:g1:2026-10-05',
        startedAt: null,
      });
      expect(m.supersededBy).toBe('t-live');
      expect(m.participants.map((p) => p.userId)).toEqual([40, 41]);
      expect(m.events[1]).toMatchObject({
        type: 'AUTO_CLOSED',
        createdAt: holder.createdAt,
      });
    });

    it('is null for an ordinary mapping', () => {
      expect(mapCommentTask(system, 2).supersededBy).toBeNull();
    });
  });
});
