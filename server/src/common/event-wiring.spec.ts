import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Every event this app emits must have someone listening.
 *
 * An emit with no listener is the quietest kind of dead code. It reads like a
 * feature — "a notification goes out when a comment is created" — costs
 * nothing to run, throws nothing, and does nothing. Nobody discovers it by
 * using the app, because there is no symptom to notice.
 *
 * `EventEmitterModule.forRoot()` is called with NO options, so wildcards are
 * off (`wildcard` defaults to false). `@OnEvent('comment.*')` would not catch
 * `comment.created` even if someone wrote it, which is why this compares exact
 * names and does not try to be clever about prefixes. If wildcards are ever
 * switched on, this test has to learn about them — the assertion below would
 * start reporting listeners that do exist.
 *
 * Names arrive three ways: a string literal at the call site, a constant like
 * `USER_DEACTIVATED_EVENT`, and a member of an exported object such as
 * `TASK_EVENTS.ASSIGNED`. The first scan of this codebase only matched
 * literals and silently skipped four emits, so all three are resolved here.
 */

const SRC = join(__dirname, '..');

/**
 * Emitted deliberately with nobody listening. Empty, and it should stay that
 * way — an entry here is a promise that something outside this repo consumes
 * the event, and there is no such consumer today.
 */
const FIRE_AND_FORGET: string[] = [];

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

const files = walk(SRC).map((file) => ({
  path:
    'src/' +
    file
      .slice(SRC.length + 1)
      .split('\\')
      .join('/'),
  source: readFileSync(file, 'utf8'),
}));

/** `export const USER_DEACTIVATED_EVENT = 'user.deactivated';` */
const constants = new Map<string, string>();
for (const { source } of files) {
  for (const m of source.matchAll(
    /export const (\w+)\s*(?::\s*string\s*)?=\s*['"`]([^'"`]+)['"`]/g,
  )) {
    constants.set(m[1], m[2]);
  }
}

/**
 * `export const TASK_EVENTS = { ASSIGNED: 'task.assigned', … } as const;` —
 * the members of an exported object literal, named `TASK_EVENTS.ASSIGNED` at
 * the call site. Without this every `emit(TASK_EVENTS.X, …)` and
 * `@OnEvent(TASK_EVENTS.X)` is invisible to the scan and goes unchecked.
 */
for (const { source } of files) {
  for (const obj of source.matchAll(
    /export const (\w+)\s*=\s*\{([^}]*)\}\s*as const/g,
  )) {
    for (const member of obj[2].matchAll(/(\w+)\s*:\s*['"`]([^'"`]+)['"`]/g)) {
      constants.set(`${obj[1]}.${member[1]}`, member[2]);
    }
  }
}

/** A literal or a resolvable constant; anything else is unknown. */
function eventName(raw: string): string | null {
  const literal = raw.match(/^['"`]([^'"`]+)['"`]$/);
  if (literal) return literal[1];
  return constants.get(raw.trim()) ?? null;
}

function collect(pattern: RegExp) {
  const found = new Map<string, string[]>();
  for (const { path, source } of files) {
    for (const m of source.matchAll(pattern)) {
      const name = eventName(m[1]);
      if (!name) continue;
      found.set(name, [...(found.get(name) ?? []), path]);
    }
  }
  return found;
}

const emitted = collect(/\.emit(?:Async)?\(\s*([^,)]+)/g);
const heard = collect(/@OnEvent\(\s*([^,)]+)/g);

describe('event wiring', () => {
  it('found both sides — a scan that matches nothing proves nothing', () => {
    expect(emitted.size).toBeGreaterThan(15);
    expect(heard.size).toBeGreaterThan(15);
  });

  it('resolves constant-named events, not just string literals', () => {
    // Four emits use `USER_DEACTIVATED_EVENT`; the first version of this scan
    // skipped every one of them without saying so.
    expect(constants.get('USER_DEACTIVATED_EVENT')).toBe('user.deactivated');
    expect(emitted.has('user.deactivated')).toBe(true);
  });

  it('resolves members of an exported event object (TASK_EVENTS.X)', () => {
    expect(constants.get('TASK_EVENTS.ASSIGNED')).toBe('task.assigned');
    // Task events are really checked on both sides, not skipped.
    for (const name of ['task.assigned', 'task.reassigned']) {
      expect(emitted.has(name)).toBe(true);
      expect(heard.has(name)).toBe(true);
    }
  });

  it('every emitted event has a listener', () => {
    const unheard = [...emitted.keys()]
      .filter((name) => !heard.has(name))
      .filter((name) => !FIRE_AND_FORGET.includes(name))
      .sort();

    expect(unheard).toEqual([]);
  });

  it('every listener has something that emits it', () => {
    // The other direction: a handler wired to an event nobody sends is a
    // feature that can never trigger.
    const unsent = [...heard.keys()]
      .filter((name) => !emitted.has(name))
      .sort();

    expect(unsent).toEqual([]);
  });
});
