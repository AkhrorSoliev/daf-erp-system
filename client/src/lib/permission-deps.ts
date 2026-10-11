/**
 * Capability dependencies (spec §5). Turning a capability on brings what it
 * requires; turning it off takes what requires it; `stabilize` drops a
 * capability whose requirement is missing.
 *
 * Pure and import-free on purpose: `client/src/lib/permission-deps.ts` is a
 * byte-for-byte copy, so the «Ruxsatlar» page plans a toggle with the same
 * code the server checks it with (ADR-0086). Edit this file, run Prettier on
 * it, then copy it to the client; the client's `permission-deps.test.ts`
 * fails until the two are equal.
 */

export type DepGraph = Readonly<
  Record<string, { readonly requires: readonly string[] }>
>;

/** `keys` plus everything they require, transitively. */
export function withRequirements(
  keys: Iterable<string>,
  graph: DepGraph,
): Set<string> {
  const out = new Set<string>();
  const todo = [...keys];
  for (let key = todo.pop(); key !== undefined; key = todo.pop()) {
    if (out.has(key)) continue;
    out.add(key);
    if (Object.hasOwn(graph, key)) todo.push(...graph[key].requires);
  }
  return out;
}

/** `keys` plus every capability that requires one of them, transitively. */
export function withDependents(
  keys: Iterable<string>,
  graph: DepGraph,
): Set<string> {
  const out = new Set(keys);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [key, def] of Object.entries(graph)) {
      if (!out.has(key) && def.requires.some((needed) => out.has(needed))) {
        out.add(key);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * `keys` without every capability whose requirement is missing, or that the
 * graph does not know, repeated until nothing more drops.
 */
export function stabilize(
  keys: Iterable<string>,
  graph: DepGraph,
): Set<string> {
  const out = new Set(keys);
  let dropped = true;
  while (dropped) {
    dropped = false;
    for (const key of out) {
      if (
        !Object.hasOwn(graph, key) ||
        graph[key].requires.some((needed) => !out.has(needed))
      ) {
        out.delete(key);
        dropped = true;
      }
    }
  }
  return out;
}

export interface TogglePlan {
  /** The role's capabilities after the toggle. */
  readonly next: Set<string>;
  /** What changes along with the key, sorted («Birga yoqiladi / o'chadi»). */
  readonly also: string[];
}

/**
 * What turning `key` on or off for one role changes. `current` is not
 * touched. A key the graph does not know changes nothing.
 */
export function planToggle(
  current: ReadonlySet<string>,
  key: string,
  on: boolean,
  graph: DepGraph,
): TogglePlan {
  const next = new Set(current);
  if (!Object.hasOwn(graph, key)) return { next, also: [] };
  const changed = on
    ? [...withRequirements([key], graph)].filter((k) => !current.has(k))
    : [...withDependents([key], graph)].filter((k) => current.has(k));
  for (const k of changed) {
    if (on) next.add(k);
    else next.delete(k);
  }
  return { next, also: changed.filter((k) => k !== key).sort() };
}
