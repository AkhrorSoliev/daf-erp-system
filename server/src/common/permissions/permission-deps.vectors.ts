/**
 * Test vectors for `permission-deps.ts`. The server spec runs them, and the
 * client copy's test loads this file through `loadServerFile` and runs them
 * against `client/src/lib/permission-deps.ts` — one table, two copies. No
 * imports: the client loads it as plain data. `next`, `also` and `output`
 * are sorted.
 *
 * The graph: b needs a, c needs b, d needs a and x, e needs c and x.
 */
export const DEP_GRAPH: Record<string, { requires: string[] }> = {
  a: { requires: [] },
  b: { requires: ['a'] },
  c: { requires: ['b'] },
  x: { requires: [] },
  d: { requires: ['a', 'x'] },
  e: { requires: ['c', 'x'] },
};

export interface ToggleVector {
  name: string;
  current: string[];
  key: string;
  on: boolean;
  next: string[];
  also: string[];
}

export interface StabilizeVector {
  name: string;
  input: string[];
  output: string[];
}

export const TOGGLE_VECTORS: readonly ToggleVector[] = [
  {
    name: 'chain on brings every requirement',
    current: [],
    key: 'c',
    on: true,
    next: ['a', 'b', 'c'],
    also: ['a', 'b'],
  },
  {
    name: 'chain off takes every dependent',
    current: ['a', 'b', 'c'],
    key: 'a',
    on: false,
    next: [],
    also: ['b', 'c'],
  },
  {
    name: 'diamond on lists only what was off',
    current: ['x'],
    key: 'e',
    on: true,
    next: ['a', 'b', 'c', 'e', 'x'],
    also: ['a', 'b', 'c'],
  },
  {
    name: 'diamond off through the shared requirement',
    current: ['a', 'b', 'c', 'd', 'e', 'x'],
    key: 'x',
    on: false,
    next: ['a', 'b', 'c'],
    also: ['d', 'e'],
  },
  {
    name: 'off in the middle keeps what it needs',
    current: ['a', 'b', 'c', 'e', 'x'],
    key: 'b',
    on: false,
    next: ['a', 'x'],
    also: ['c', 'e'],
  },
  {
    name: 'on with one requirement already held',
    current: ['a'],
    key: 'd',
    on: true,
    next: ['a', 'd', 'x'],
    also: ['x'],
  },
  {
    name: 'already on changes nothing',
    current: ['a', 'b'],
    key: 'b',
    on: true,
    next: ['a', 'b'],
    also: [],
  },
  {
    name: 'already off changes nothing',
    current: ['a'],
    key: 'c',
    on: false,
    next: ['a'],
    also: [],
  },
  {
    name: 'a leaf off goes alone',
    current: ['a', 'b', 'x'],
    key: 'x',
    on: false,
    next: ['a', 'b'],
    also: [],
  },
  {
    name: 'an unknown key changes nothing',
    current: ['a'],
    key: 'zz',
    on: true,
    next: ['a'],
    also: [],
  },
];

export const STABILIZE_VECTORS: readonly StabilizeVector[] = [
  {
    name: 'a stable set stays',
    input: ['a', 'b', 'd', 'x'],
    output: ['a', 'b', 'd', 'x'],
  },
  {
    name: 'one missing requirement drops one key',
    input: ['a', 'c', 'd', 'x'],
    output: ['a', 'd', 'x'],
  },
  {
    name: 'a missing root drops the whole chain',
    input: ['b', 'c', 'e', 'x'],
    output: ['x'],
  },
  { name: 'an unknown key is dropped', input: ['a', 'zz'], output: ['a'] },
  { name: 'the empty set stays empty', input: [], output: [] },
];
