import {
  planParticipantChange,
  type ParticipantRole,
} from './task-participants-diff';

const was = (...entries: [number, ParticipantRole][]) => new Map(entries);

describe('planParticipantChange', () => {
  it('a pure add: new people are fresh, nobody is removed or flipped', () => {
    const plan = planParticipantChange(was([40, 'ASSIGNEE']), [40, 41], [42]);
    expect(plan).toEqual({
      removed: [],
      flipped: [],
      fresh: [
        { userId: 41, role: 'ASSIGNEE' },
        { userId: 42, role: 'WATCHER' },
      ],
      added: [41, 42],
    });
  });

  it('a role flip stays on the task and is not removed; the one left out goes', () => {
    const plan = planParticipantChange(
      was([40, 'ASSIGNEE'], [41, 'WATCHER'], [43, 'WATCHER']),
      [41],
      [40],
    );
    expect(plan).toEqual({
      removed: [43],
      flipped: [
        { userId: 41, role: 'ASSIGNEE' },
        { userId: 40, role: 'WATCHER' },
      ],
      fresh: [],
      added: [41, 40],
    });
  });

  it('the same lists again change nothing; a duplicate id and an id in both lists count once', () => {
    const plan = planParticipantChange(
      was([40, 'ASSIGNEE'], [41, 'WATCHER']),
      [40, 40],
      [41, 41, 40],
    );
    expect(plan).toEqual({ removed: [], flipped: [], fresh: [], added: [] });
  });
});
