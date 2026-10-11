import {
  EDITABLE_ROLE_IDS,
  PERMISSIONS,
  defaultKeysForRoles,
} from './permission-catalog';
import {
  planToggle,
  stabilize,
  withDependents,
  withRequirements,
} from './permission-deps';
import {
  DEP_GRAPH,
  STABILIZE_VECTORS,
  TOGGLE_VECTORS,
} from './permission-deps.vectors';

const sorted = (keys: Iterable<string>): string[] => [...keys].sort();

describe('capability dependencies (spec §5)', () => {
  it.each(TOGGLE_VECTORS.map((v) => [v.name, v] as const))(
    'toggle: %s',
    (_name, v) => {
      const plan = planToggle(new Set(v.current), v.key, v.on, DEP_GRAPH);
      expect(sorted(plan.next)).toEqual(v.next);
      expect(plan.also).toEqual(v.also);
    },
  );

  it.each(STABILIZE_VECTORS.map((v) => [v.name, v] as const))(
    'stabilize: %s',
    (_name, v) => {
      expect(sorted(stabilize(v.input, DEP_GRAPH))).toEqual(v.output);
    },
  );

  it('walks requirements and dependents transitively', () => {
    expect(sorted(withRequirements(['e'], DEP_GRAPH))).toEqual([
      'a',
      'b',
      'c',
      'e',
      'x',
    ]);
    expect(sorted(withDependents(['a'], DEP_GRAPH))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('never changes the set it plans from', () => {
    const current = new Set(['a', 'b', 'c']);
    planToggle(current, 'a', false, DEP_GRAPH);
    planToggle(current, 'e', true, DEP_GRAPH);
    expect(sorted(current)).toEqual(['a', 'b', 'c']);
  });

  it.each([...EDITABLE_ROLE_IDS])(
    "leaves role %i's catalog defaults as they are",
    (roleId) => {
      const defaults = defaultKeysForRoles([roleId]);
      expect(sorted(stabilize(defaults, PERMISSIONS))).toEqual(
        sorted(defaults),
      );
    },
  );
});
