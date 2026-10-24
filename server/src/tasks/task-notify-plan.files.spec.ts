import { TASK_EVENTS } from './task-events';
import { planNotices } from './task-notify-plan';

// Files reuse the comment notice (ADR-0086); the plain comment cases are in task-notify-plan.spec.ts.
const task = {
  id: 'T1',
  companyId: 1,
  title: 'Oktabr banneri',
  kind: 'MANUAL',
  authorId: 30,
  dueAt: null,
  status: 'IN_PROGRESS' as const,
  participants: [
    { userId: 40, role: 'ASSIGNEE' as const },
    { userId: 50, role: 'WATCHER' as const },
  ],
};
const names = new Map([
  [30, 'Soliyev A.'],
  [40, 'Rahimov A.'],
  [50, 'Karimov B.'],
]);

it('a file: «Yangi fayl» in the bell for everyone but the uploader; Telegram for author and assignees only', () => {
  const n = planNotices(
    TASK_EVENTS.COMMENTED,
    { task, actorId: 40, text: 'chek.jpg', attachment: 'FILE' },
    names,
  );
  expect(n.map((x) => x.userId).sort()).toEqual([30, 50]);
  expect(n.every((x) => x.title === 'Yangi fayl')).toBe(true);
  expect(n.find((x) => x.userId === 30)!.message).toBe(
    'Rahimov A.: «chek.jpg» — Oktabr banneri',
  );
  expect(n.find((x) => x.userId === 30)!.telegram).toEqual({
    kind: 'COMMENT',
    by: 'Rahimov A.',
    text: 'chek.jpg',
    attachment: 'FILE',
  });
  expect(n.find((x) => x.userId === 50)!.telegram).toBeNull();
});

it('a voice message: «Ovozli xabar»', () => {
  const n = planNotices(
    TASK_EVENTS.COMMENTED,
    { task, actorId: 30, text: 'Ovozli xabar', attachment: 'VOICE' },
    names,
  );
  expect(n.map((x) => [x.userId, x.title])).toEqual([
    [40, 'Ovozli xabar'],
    [50, 'Ovozli xabar'],
  ]);
  expect(n.find((x) => x.userId === 40)!.telegram).toEqual({
    kind: 'COMMENT',
    by: 'Soliyev A.',
    text: 'Ovozli xabar',
    attachment: 'VOICE',
  });
});

it('a plain comment is unchanged: no attachment key at all', () => {
  const n = planNotices(
    TASK_EVENTS.COMMENTED,
    { task, actorId: 40, text: 'Tayyor' },
    names,
  );
  expect(n.find((x) => x.userId === 30)!.telegram).toEqual({
    kind: 'COMMENT',
    by: 'Rahimov A.',
    text: 'Tayyor',
  });
  expect(n[0].title).toBe('Yangi izoh');
});
