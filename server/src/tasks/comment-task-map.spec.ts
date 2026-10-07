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

  describe('a system task takes its status from the lesson row', () => {
    it('PENDING lesson, nobody opened it → NEW, not closed', () => {
      const m = mapCommentTask({ ...system, assignees: [pendingAssignee] }, 2);
      expect(m.task).toMatchObject({ status: 'NEW', closedAt: null });
    });

    it('PENDING lesson, an assignee SEEN it → IN_PROGRESS', () => {
      const m = mapCommentTask(system, 2);
      expect(m.task).toMatchObject({ status: 'IN_PROGRESS', closedAt: null });
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

    it('a system comment its lesson no longer points at keeps the assignee rule', () => {
      const m = mapCommentTask({ ...system, unmarkedLesson: null }, 2);
      expect(m.task).toMatchObject({
        kind: 'LESSON_QUESTION',
        status: 'IN_PROGRESS',
        sourceKey: null,
      });
      expect(m.lessonLink).toBe(false);
    });
  });
});
