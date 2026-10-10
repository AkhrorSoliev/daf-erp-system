import { planNotices } from './task-notify-plan';
import { TASK_EVENTS, type TaskEventTask } from './task-events';

// Split off task-notify-plan.spec.ts (over the 500-line rule): the cut of the
// texts that reach Telegram.
const task: TaskEventTask = {
  id: 't1',
  companyId: 1,
  title: 'Oktabr banneri',
  kind: 'MANUAL',
  authorId: 30,
  dueAt: null,
  status: 'IN_REVIEW',
  participants: [
    { userId: 40, role: 'ASSIGNEE' },
    { userId: 41, role: 'ASSIGNEE' },
  ],
};
const names = new Map([
  [30, 'Soliyev A.'],
  [40, 'Rahimov A.'],
  [41, 'Azizova M.'],
]);

/** A lone half of a surrogate pair: what a cut through an emoji leaves. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// 299 letters, then an emoji (two UTF-16 units) that straddles unit 300.
const atTheCut = 'a'.repeat(299) + '😀' + 'tail';

describe('planNotices clips by code points (the text reaches Telegram)', () => {
  it('a returned reason cut at 300 keeps the emoji whole', () => {
    const n = planNotices(
      TASK_EVENTS.REVIEWED,
      { task, actorId: 30, accepted: false, reason: atTheCut },
      names,
    );
    const tg = n.find((x) => x.userId === 40)?.telegram;
    expect(tg).toEqual({
      kind: 'RETURNED',
      by: 'Soliyev A.',
      reason: 'a'.repeat(299) + '😀' + '…',
    });
    expect(JSON.stringify(tg)).not.toMatch(LONE_SURROGATE);
    expect(n.every((x) => !LONE_SURROGATE.test(x.title + x.message))).toBe(
      true,
    );
  });

  it('a comment cut at 300 keeps the emoji whole', () => {
    const n = planNotices(
      TASK_EVENTS.COMMENTED,
      { task, actorId: 40, text: atTheCut },
      names,
    );
    const tg = n.find((x) => x.userId === 30)?.telegram;
    expect(tg).toEqual({
      kind: 'COMMENT',
      by: 'Rahimov A.',
      text: 'a'.repeat(299) + '😀' + '…',
    });
    expect(JSON.stringify(tg)).not.toMatch(LONE_SURROGATE);
  });

  it('a text that fits is not touched', () => {
    const n = planNotices(
      TASK_EVENTS.COMMENTED,
      { task, actorId: 40, text: '😀'.repeat(300) },
      names,
    );
    expect(n.find((x) => x.userId === 30)?.telegram).toEqual({
      kind: 'COMMENT',
      by: 'Rahimov A.',
      text: '😀'.repeat(300),
    });
  });
});
