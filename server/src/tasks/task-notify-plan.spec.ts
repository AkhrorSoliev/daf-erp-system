import { noticeUserIds, planNotices } from './task-notify-plan';
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
        { task, actorId: 30, userIds: [41], removedAssigneeIds: [41] },
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
        { task, actorId: 41, userIds: [41], removedAssigneeIds: [41] },
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
  it('status changed to IN_REVIEW is left to the review notice', () => {
    expect(
      planNotices(
        TASK_EVENTS.STATUS_CHANGED,
        { task, actorId: 40, from: 'IN_PROGRESS', to: 'IN_REVIEW' },
        names,
      ),
    ).toEqual([]);
  });

  it('a self-task closed by its author → its watchers hear «Bajarildi»', () => {
    const self: TaskEventTask = {
      ...task,
      participants: [
        { userId: 30, role: 'ASSIGNEE' },
        { userId: 50, role: 'WATCHER' },
      ],
    };
    const n = planNotices(
      TASK_EVENTS.STATUS_CHANGED,
      { task: self, actorId: 30, from: 'IN_PROGRESS', to: 'DONE' },
      names,
    );
    expect(n).toEqual([
      expect.objectContaining({
        userId: 50,
        title: 'Bajarildi',
        actionRequired: false,
        telegram: { kind: 'DONE', by: 'Soliyev A.' },
      }),
    ]);
  });

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

describe('planNotices: the Telegram leg (spec §6.1)', () => {
  const tgOf = (n: ReturnType<typeof planNotices>) =>
    n.map((x) => [x.userId, x.telegram]);

  it('a new task → assignees «Yangi topshiriq», watchers nothing', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.ASSIGNED,
          { task, actorId: 30, userIds: [40, 41, 50], created: true },
          names,
        ),
      ),
    ).toEqual([
      [40, { kind: 'ASSIGNED' }],
      [41, { kind: 'ASSIGNED' }],
      [50, null],
    ]);
  });

  it("someone added later → «Siz topshiriqqa qo'shildingiz» with who added", () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.ASSIGNED,
          { task, actorId: 30, userIds: [41] },
          names,
        ),
      ),
    ).toEqual([[41, { kind: 'ADDED', by: 'Soliyev A.' }]]);
  });

  it('a watcher added later hears nothing on Telegram', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.ASSIGNED,
          { task, actorId: 30, userIds: [41, 50] },
          names,
        ),
      ),
    ).toEqual([
      [41, { kind: 'ADDED', by: 'Soliyev A.' }],
      [50, null],
    ]);
  });

  it('a removed watcher is told on the bell only, a removed assignee on both', () => {
    const n = planNotices(
      TASK_EVENTS.UNASSIGNED,
      { task, actorId: 30, userIds: [41, 50], removedAssigneeIds: [41] },
      names,
    );
    expect(n.map((x) => [x.userId, x.title])).toEqual([
      [41, 'Topshiriqdan olib tashlandingiz'],
      [50, 'Topshiriqdan olib tashlandingiz'],
    ]);
    expect(tgOf(n)).toEqual([
      [41, { kind: 'REMOVED', by: 'Soliyev A.' }],
      [50, null],
    ]);
  });

  it('moved, removed, review', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.REASSIGNED,
          { task, fromUserId: 41, toUserIds: [40] },
          names,
        ),
      ),
    ).toEqual([[40, { kind: 'MOVED', from: 'Azizova M.' }]]);
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.UNASSIGNED,
          { task, actorId: 30, userIds: [41], removedAssigneeIds: [41] },
          names,
        ),
      ),
    ).toEqual([[41, { kind: 'REMOVED', by: 'Soliyev A.' }]]);
    expect(
      tgOf(
        planNotices(TASK_EVENTS.REVIEW_REQUESTED, { task, actorId: 40 }, names),
      ),
    ).toEqual([[30, { kind: 'REVIEW', by: 'Rahimov A.' }]]);
  });

  it('accepted → assignees «Qabul qilindi», watchers «Bajarildi»; returned → the reason', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.REVIEWED,
          { task, actorId: 30, accepted: true, reason: null },
          names,
        ),
      ),
    ).toEqual([
      [40, { kind: 'ACCEPTED', by: 'Soliyev A.' }],
      [41, { kind: 'ACCEPTED', by: 'Soliyev A.' }],
      [50, { kind: 'DONE', by: 'Soliyev A.' }],
    ]);
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.REVIEWED,
          { task, actorId: 30, accepted: false, reason: 'Doska artilmagan' },
          names,
        ),
      ),
    ).toEqual([
      [40, { kind: 'RETURNED', by: 'Soliyev A.', reason: 'Doska artilmagan' }],
      [41, { kind: 'RETURNED', by: 'Soliyev A.', reason: 'Doska artilmagan' }],
    ]);
  });

  it('a comment reaches author and assignees but not watchers', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.COMMENTED,
          { task, actorId: 40, text: 'Narx 450 000 qoldimi?' },
          names,
        ),
      ),
    ).toEqual([
      [
        30,
        { kind: 'COMMENT', by: 'Rahimov A.', text: 'Narx 450 000 qoldimi?' },
      ],
      [
        41,
        { kind: 'COMMENT', by: 'Rahimov A.', text: 'Narx 450 000 qoldimi?' },
      ],
      [50, null],
    ]);
  });

  it('cancelled → only watchers on Telegram (the bell still tells assignees)', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.CANCELLED,
          { task, actorId: 30, reason: null },
          names,
        ),
      ),
    ).toEqual([
      [40, null],
      [41, null],
      [50, { kind: 'CANCELLED', by: 'Soliyev A.' }],
    ]);
  });

  it('status to IN_PROGRESS and due changes stay on the bell', () => {
    for (const n of [
      ...planNotices(
        TASK_EVENTS.STATUS_CHANGED,
        { task, actorId: 40, from: 'NEW', to: 'IN_PROGRESS' },
        names,
      ),
      ...planNotices(TASK_EVENTS.DUE_CHANGED, { task, actorId: 30 }, names),
    ]) {
      expect(n.telegram).toBeNull();
    }
  });

  it("«Dars bo'ldimi?» never goes to Telegram, the bell is kept", () => {
    const lesson: TaskEventTask = {
      ...task,
      kind: 'LESSON_QUESTION',
      authorId: null,
    };
    const n = planNotices(
      TASK_EVENTS.REASSIGNED,
      { task: lesson, fromUserId: 41, toUserIds: [40] },
      names,
    );
    expect(n).toHaveLength(1);
    expect(n[0].telegram).toBeNull();
  });

  it('nobody is ever told about what they did themselves', () => {
    // [event, payload, who is told]: the others are named too, so a plan that
    // told nobody at all would fail as well.
    const twoWatchers: TaskEventTask = {
      ...task,
      participants: [...task.participants, { userId: 51, role: 'WATCHER' }],
    };
    const cases: [string, unknown, number[]][] = [
      [
        TASK_EVENTS.ASSIGNED,
        { task, actorId: 40, userIds: [40, 41], created: true },
        [41],
      ],
      [
        TASK_EVENTS.UNASSIGNED,
        { task, actorId: 41, userIds: [41, 40], removedAssigneeIds: [41, 40] },
        [40],
      ],
      // The author is the only one this event tells, and the author did it.
      [
        TASK_EVENTS.REVIEW_REQUESTED,
        { task: { ...task, authorId: 40 }, actorId: 40 },
        [],
      ],
      [
        TASK_EVENTS.REVIEWED,
        { task, actorId: 40, accepted: true, reason: null },
        [41, 50],
      ],
      [
        TASK_EVENTS.STATUS_CHANGED,
        { task: twoWatchers, actorId: 50, from: 'IN_PROGRESS', to: 'DONE' },
        [51],
      ],
      [TASK_EVENTS.COMMENTED, { task, actorId: 50, text: 'x' }, [30, 40, 41]],
      [TASK_EVENTS.CANCELLED, { task, actorId: 50, reason: null }, [40, 41]],
      [TASK_EVENTS.DUE_CHANGED, { task, actorId: 40 }, [41]],
    ];
    for (const [event, payload, told] of cases) {
      const actor = (payload as { actorId: number }).actorId;
      const ids = planNotices(event, payload, names).map((n) => n.userId);
      expect(ids).not.toContain(actor);
      expect([...ids].sort()).toEqual(told);
    }
  });

  it('noticeUserIds names author, participants, actor and moved people once', () => {
    expect(
      noticeUserIds({
        task,
        actorId: 99,
        userIds: [41],
        toUserIds: [60],
        fromUserId: 61,
      } as unknown as { task: TaskEventTask }).sort(),
    ).toEqual([30, 40, 41, 50, 60, 61, 99]);
  });
});
