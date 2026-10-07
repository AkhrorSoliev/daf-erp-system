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

describe('planNotices: the actor never hears about their own action', () => {
  it('a self task (author = the only assignee) notifies nobody', () => {
    const selfTask: TaskEventTask = {
      ...task,
      participants: [{ userId: 30, role: 'ASSIGNEE' }],
    };
    expect(
      planNotices(
        TASK_EVENTS.ASSIGNED,
        { task: selfTask, actorId: 30, userIds: [30] },
        names,
      ),
    ).toEqual([]);
  });

  it('assigned: a watcher gets the watcher wording and no action to take', () => {
    const n = planNotices(
      TASK_EVENTS.ASSIGNED,
      { task, actorId: 30, userIds: [40, 50] },
      names,
    );
    expect(n).toHaveLength(2);
    expect(n.find((x) => x.userId === 40)).toMatchObject({
      title: 'Yangi topshiriq',
      actionRequired: true,
    });
    const watcher = n.find((x) => x.userId === 50)!;
    expect(watcher).toMatchObject({
      type: 'TASK_ASSIGNED',
      title: 'Kuzatuvchi qilindingiz',
      actionRequired: false,
    });
    expect(watcher.message).toBe(
      'Soliyev A. sizni kuzatuvchi qildi: «Oktabr banneri»',
    );
  });

  it('assigned by the system names "Tizim" and keeps every recipient', () => {
    const n = planNotices(
      TASK_EVENTS.ASSIGNED,
      { task, actorId: null, userIds: [40] },
      names,
    );
    expect(n).toHaveLength(1);
    expect(n[0].message).toContain('Tizim');
  });

  it('unassigned: removing yourself tells nobody', () => {
    expect(
      planNotices(
        TASK_EVENTS.UNASSIGNED,
        { task, actorId: 41, userIds: [41] },
        names,
      ),
    ).toEqual([]);
  });

  it('review requested by the author (one of two assignees) → nobody', () => {
    const t: TaskEventTask = {
      ...task,
      participants: [
        { userId: 30, role: 'ASSIGNEE' },
        { userId: 40, role: 'ASSIGNEE' },
      ],
    };
    expect(
      planNotices(
        TASK_EVENTS.REVIEW_REQUESTED,
        { task: t, actorId: 30 },
        names,
      ),
    ).toEqual([]);
  });

  it('reviewed: the reviewer is left out when they also hold a seat on the task', () => {
    const accepted = planNotices(
      TASK_EVENTS.REVIEWED,
      { task, actorId: 50, accepted: true, reason: null },
      names,
    );
    expect(accepted.map((x) => x.userId)).toEqual([40, 41]);
    const t: TaskEventTask = {
      ...task,
      participants: [
        { userId: 30, role: 'ASSIGNEE' },
        { userId: 40, role: 'ASSIGNEE' },
      ],
    };
    const returned = planNotices(
      TASK_EVENTS.REVIEWED,
      { task: t, actorId: 30, accepted: false, reason: 'Qayta qiling' },
      names,
    );
    expect(returned.map((x) => x.userId)).toEqual([40]);
  });

  it('reviewed: a long return reason is clipped to 80 characters', () => {
    const n = planNotices(
      TASK_EVENTS.REVIEWED,
      { task, actorId: 30, accepted: false, reason: 'x'.repeat(200) },
      names,
    );
    expect(n[0].message).toContain('x'.repeat(80) + '…');
    expect(n[0].message).not.toContain('x'.repeat(81));
  });

  it('cancelled by a watcher: that watcher is not told', () => {
    expect(
      planNotices(
        TASK_EVENTS.CANCELLED,
        { task, actorId: 50, reason: null },
        names,
      )
        .map((x) => x.userId)
        .sort(),
    ).toEqual([40, 41]);
  });
});

describe('planNotices: status changes and due dates', () => {
  it.each(['IN_REVIEW', 'DONE'] as const)(
    'status changed to %s is left to the review notices',
    (to) => {
      expect(
        planNotices(
          TASK_EVENTS.STATUS_CHANGED,
          { task, actorId: 40, from: 'IN_PROGRESS', to },
          names,
        ),
      ).toEqual([]);
    },
  );

  it('status changed by the author themselves tells nobody', () => {
    expect(
      planNotices(
        TASK_EVENTS.STATUS_CHANGED,
        { task, actorId: 30, from: 'NEW', to: 'IN_PROGRESS' },
        names,
      ),
    ).toEqual([]);
  });

  it('due changed → assignees except the actor, with the new date on the Tashkent clock', () => {
    const t: TaskEventTask = {
      ...task,
      dueAt: new Date('2026-10-08T13:00:00.000Z'),
    };
    const n = planNotices(
      TASK_EVENTS.DUE_CHANGED,
      { task: t, actorId: 40 },
      names,
    );
    expect(n.map((x) => x.userId)).toEqual([41]);
    expect(n[0]).toMatchObject({
      type: 'TASK_UPDATED',
      title: "Muddat o'zgardi",
      actionRequired: false,
    });
    expect(n[0].message).toBe('«Oktabr banneri» — yangi muddat: 08.10, 18:00');
  });

  it('due changed late in the evening rolls the Tashkent date over', () => {
    const t: TaskEventTask = {
      ...task,
      dueAt: new Date('2026-12-31T20:05:00.000Z'),
    };
    const n = planNotices(
      TASK_EVENTS.DUE_CHANGED,
      { task: t, actorId: 30 },
      names,
    );
    expect(n[0].message).toContain('yangi muddat: 01.01, 01:05');
  });

  it('due removed says so', () => {
    const n = planNotices(
      TASK_EVENTS.DUE_CHANGED,
      { task: { ...task, dueAt: null }, actorId: 30 },
      names,
    );
    expect(n.map((x) => x.userId)).toEqual([40, 41]);
    expect(n[0].message).toBe('«Oktabr banneri» — muddat olib tashlandi');
  });

  it('an event nobody plans for yields nothing', () => {
    expect(planNotices('task.unknown', { task }, names)).toEqual([]);
  });
});
