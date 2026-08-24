/**
 * Turn an `unknown` into something a human can read in a log line.
 *
 * `String(value)` is the reflex, and on an object it produces the single
 * least useful string in JavaScript: `[object Object]`. That is worst
 * precisely where it is most common — inside a `catch`, logging the thing
 * that just went wrong. The error is recorded, the log says nothing, and the
 * incident is investigated without it.
 *
 * Primitives pass through unchanged, so ordinary log lines look exactly as
 * they did. Objects are JSON, truncated: a log line is not a data store, and
 * an unbounded one is its own problem.
 */
const MAX_LENGTH = 500;

export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof Error) return value.message;

  // Narrowed by `typeof` rather than asserted, so `String()` is only ever
  // reached with something that has a meaningful string form. That is the
  // whole point of this file — it must not contain the bug it exists to fix.
  if (typeof value === 'string') return truncate(value);
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') return `[function ${value.name}]`;

  try {
    // `JSON.stringify` returns undefined for a bare `undefined`, which is
    // already handled above; anything else here is an object or array.
    return truncate(JSON.stringify(value) ?? '[qiymat yoq]');
  } catch {
    // Circular, or a toJSON that throws. Still better than nothing.
    return "[serialization qilib bo'lmadi]";
  }
}

function truncate(text: string): string {
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}
