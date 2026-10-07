import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Task rows have one door: `src/tasks/`.
 *
 * A task is written together with its participants, its event log and its
 * outbox rows, and every one of those writes carries a rule — who may do it,
 * what the log records, which notice it queues, which reminder it cancels. A
 * status change made from some other module with `tx.task.update` would skip
 * all of it: the board shows a task `DONE` that nobody was told about, with a
 * reminder still queued for it.
 *
 * The «Dars bo'ldimi?» task (`lesson-task.ts`) and the departed-employee
 * listener sit inside the module on purpose: they are system writers with no
 * caller to check, and they live next to the rest. Everything else — leads,
 * attendance, groups, branch reset — asks `TasksService` or `lesson-task.ts`.
 *
 * `branch-reset-plan.ts` only COUNTS task rows (`.count`, not matched here); it
 * must stay that way — a branch reset that deleted tasks would need the rest
 * of the module's rules too.
 */

const SRC = join(__dirname, '..');

/** The module that owns the tables. Specs are not scanned (they mock). */
const OWNER_DIR = 'src/tasks/';

const WRITE =
  /\b(tx|prisma|db|this\.prisma)\.task(?:Participant|Step|Event|Outbox)?\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

const writes = walk(SRC).flatMap((file) => {
  const path =
    'src/' +
    file
      .slice(SRC.length + 1)
      .split('\\')
      .join('/');
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(WRITE)].map((m) => ({ path, call: m[0] }));
});

describe('task rows are written only inside src/tasks', () => {
  it('found the writes — a scan that matches nothing proves nothing', () => {
    expect(writes.length).toBeGreaterThanOrEqual(10);
    // The two system writers named in the brief are among them.
    const files = new Set(writes.map((w) => w.path));
    expect(files.has('src/tasks/lesson-task.ts')).toBe(true);
    expect(files.has('src/tasks/task-user-lifecycle.listener.ts')).toBe(true);
  });

  it('no other module writes a Task, TaskParticipant, TaskStep, TaskEvent or TaskOutbox row', () => {
    const offenders = writes
      .filter((w) => !w.path.startsWith(OWNER_DIR))
      .map((w) => `${w.path}: ${w.call}`);

    expect(offenders).toEqual([]);
  });
});
