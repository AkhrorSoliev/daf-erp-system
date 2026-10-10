export type ParticipantRole = 'ASSIGNEE' | 'WATCHER';
export type ParticipantChange = { userId: number; role: ParticipantRole };

/**
 * What it takes to turn the task's current participants into the wanted lists.
 * An id in both lists is an assignee. `fresh` are new people, `flipped` stay
 * but change role (assignee ↔ watcher), `removed` go; `added` is every id that
 * is told about the task (fresh and flipped), in the order the lists name them.
 */
export function planParticipantChange(
  was: ReadonlyMap<number, ParticipantRole>,
  assigneeIds: readonly number[],
  watcherIds: readonly number[],
) {
  const wanted = new Map<number, ParticipantRole>();
  for (const userId of assigneeIds) wanted.set(userId, 'ASSIGNEE');
  for (const userId of watcherIds) {
    if (!wanted.has(userId)) wanted.set(userId, 'WATCHER');
  }
  const removed = [...was.keys()].filter((userId) => !wanted.has(userId));
  const fresh: ParticipantChange[] = [];
  const flipped: ParticipantChange[] = [];
  const added: number[] = [];
  for (const [userId, role] of wanted) {
    if (!was.has(userId)) fresh.push({ userId, role });
    else if (was.get(userId) !== role) flipped.push({ userId, role });
    else continue;
    added.push(userId);
  }
  return { removed, flipped, fresh, added };
}
