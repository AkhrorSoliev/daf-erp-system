import { planNotices } from './task-notify-plan';
import { TASK_EVENTS, type TaskEventTask } from './task-events';

const task: TaskEventTask = {
  id: 't1',
  companyId: 1,
  title: 'Oktabr banneri',
  kind: 'MANUAL',
  authorId: 30,
  dueAt: null,
  status: 'NEW',
  participants: [
    { userId: 40, role: 'ASSIGNEE' },
    { userId: 41, role: 'ASSIGNEE' },
    { userId: 50, role: 'WATCHER' },
  ],
};
const names = new Map([
  [30, 'Soliyev A.'],
  [40, 'Rahimov A.'],
  [41, 'Azizova M.'],
  [50, 'CEO'],
]);

describe('planNotices (spec §6.1 table, bell leg)', () => {
  it('assigned → each added user, TASK_ASSIGNED, action required', () => {
    const n = planNotices(
      TASK_EVENTS.ASSIGNED,
      { task, actorId: 30, userIds: [40, 41] },
      names,
    );
    expect(n.map((x) => x.userId)).toEqual([40, 41]);
    expect(n[0]).toMatchObject({
      type: 'TASK_ASSIGNED',
      actionRequired: true,
      title: 'Yangi topshiriq',
    });
    expect(n[0].message).toContain('Soliyev A.');
  });

  it('review requested → author only, TASK_REVIEW', () => {
    const n = planNotices(
      TASK_EVENTS.REVIEW_REQUESTED,
      { task, actorId: 40 },
      names,
    );
    expect(n).toEqual([
      expect.objectContaining({
        userId: 30,
        type: 'TASK_REVIEW',
        actionRequired: true,
      }),
    ]);
  });

  it('reviewed → assignees (accepted also watchers), accepted vs returned wording', () => {
    const ok = planNotices(
      TASK_EVENTS.REVIEWED,
      { task, actorId: 30, accepted: true, reason: null },
      names,
    );
    expect(ok.map((x) => x.userId)).toEqual([40, 41, 50]);
    expect(ok[0].title).toBe('Qabul qilindi');
    const back = planNotices(
      TASK_EVENTS.REVIEWED,
      { task, actorId: 30, accepted: false, reason: 'Doska artilmagan' },
      names,
    );
    expect(back.map((x) => x.userId)).toEqual([40, 41]);
    expect(back[0].title).toBe('Topshiriq qaytarildi');
    expect(back[0].message).toContain('Doska artilmagan');
    expect(back[0].actionRequired).toBe(true);
  });

  it('commented → everyone but the actor, info only', () => {
    const n = planNotices(
      TASK_EVENTS.COMMENTED,
      { task, actorId: 40, text: 'Narx 450 000 qoldimi?' },
      names,
    );
    expect(n.map((x) => x.userId).sort()).toEqual([30, 41, 50]);
    expect(n[0].actionRequired).toBe(false);
  });

  it('status changed by an assignee → author (not for a system task)', () => {
    expect(
      planNotices(
        TASK_EVENTS.STATUS_CHANGED,
        { task, actorId: 40, from: 'NEW', to: 'IN_PROGRESS' },
        names,
      ).map((x) => x.userId),
    ).toEqual([30]);
    expect(
      planNotices(
        TASK_EVENTS.STATUS_CHANGED,
        {
          task: { ...task, authorId: null, kind: 'LESSON_QUESTION' },
          actorId: 40,
          from: 'NEW',
          to: 'IN_PROGRESS',
        },
        names,
      ),
    ).toEqual([]);
  });

  it('cancelled → assignees + watchers; done (accept) also reaches watchers', () => {
    expect(
      planNotices(
        TASK_EVENTS.CANCELLED,
        { task, actorId: 30, reason: null },
        names,
      )
        .map((x) => x.userId)
        .sort(),
    ).toEqual([40, 41, 50]);
    expect(
      planNotices(
        TASK_EVENTS.REVIEWED,
        { task, actorId: 30, accepted: true, reason: null },
        names,
      ).map((x) => x.userId),
    ).toContain(50);
  });

  it('unassigned → removed users; reassigned → new assignees', () => {
    expect(
      planNotices(
        TASK_EVENTS.UNASSIGNED,
        { task, actorId: 30, userIds: [41] },
        names,
      )[0],
    ).toMatchObject({ userId: 41, type: 'TASK_UPDATED' });
    expect(
      planNotices(
        TASK_EVENTS.REASSIGNED,
        { task, fromUserId: 40, toUserIds: [30] },
        names,
      )[0],
    ).toMatchObject({ userId: 30, type: 'TASK_ASSIGNED' });
  });
});
