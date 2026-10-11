import { stripLoneSurrogates } from '../utils/text.util';

const EXCLUDED_KEYS = new Set([
  'updatedAt',
  'createdAt',
  'deletedAt',
  'deletedById',
  'deletionBatchId',
  'statusChangedAt',
  'statusChangedById',
  'statusChangeReason',
  'password',
  // A security counter (ADR-0030), not business data: bumping it is journaled
  // as the password change or logout that caused it, never as a raw number.
  'sessionVersion',
]);

/**
 * Fields left out of ONE entity type's history, on top of `EXCLUDED_KEYS`.
 * `User.balance` is the employee's salary balance (ADR-0086): an employee's
 * history and timeline open with `teachers.view` / `employees.view`, and
 * neither means «may see pay». `Student.balance` stays: the student's
 * history is a money view behind its own capabilities.
 */
export const ENTITY_EXCLUDED_KEYS: Readonly<Record<string, readonly string[]>> =
  {
    User: ['balance'],
  };

function excludedFor(entityType: string | undefined): readonly string[] {
  // `hasOwnProperty`: the read side passes a type from the URL, and
  // `ENTITY_EXCLUDED_KEYS['toString']` is a function, not a list.
  return entityType !== undefined &&
    Object.prototype.hasOwnProperty.call(ENTITY_EXCLUDED_KEYS, entityType)
    ? ENTITY_EXCLUDED_KEYS[entityType]
    : [];
}

function isPlainValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value instanceof Date) return true;
  if (Array.isArray(value)) return false;
  if (typeof value === 'object') return false;
  return true;
}

/**
 * PostgreSQL rejects a lone UTF-16 surrogate in `jsonb` ("invalid input syntax
 * for type json"), and a caller that truncated a string with a plain
 * `slice(n)` can easily hand us one — that is how the 2026-08-18 payment
 * receipts lost their audit rows. Every history payload passes through here,
 * so cleaning strings at this single point means no caller can break the
 * write, whatever they did upstream.
 */
function jsonSafe(value: unknown): unknown {
  return typeof value === 'string' ? stripLoneSurrogates(value) : value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return a === b;
}

export function computeChangedFields(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  entityType?: string,
): { oldValues: Record<string, any>; newValues: Record<string, any> } | null {
  const oldValues: Record<string, any> = {};
  const newValues: Record<string, any> = {};
  const typeExcluded = excludedFor(entityType);
  let hasChanges = false;

  for (const key of Object.keys(newObj)) {
    if (EXCLUDED_KEYS.has(key) || typeExcluded.includes(key)) continue;
    if (!isPlainValue(newObj[key])) continue;
    if (!(key in oldObj)) continue;
    if (!isPlainValue(oldObj[key])) continue;

    if (!valuesEqual(oldObj[key], newObj[key])) {
      if (key === 'photo') {
        oldValues[key] = oldObj[key] ? 'eski rasm' : null;
        newValues[key] = newObj[key] ? 'yangi rasm' : null;
      } else {
        oldValues[key] = jsonSafe(oldObj[key] ?? null);
        newValues[key] = jsonSafe(newObj[key] ?? null);
      }
      hasChanges = true;
    }
  }

  return hasChanges ? { oldValues, newValues } : null;
}

export function stripSensitiveFields(
  obj: Record<string, any>,
  entityType?: string,
): Record<string, any> {
  const typeExcluded = excludedFor(entityType);
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (EXCLUDED_KEYS.has(key) || typeExcluded.includes(key)) continue;
    if (!isPlainValue(obj[key])) continue;
    result[key] = jsonSafe(obj[key] ?? null);
  }
  return result;
}

/**
 * The read side: rows stored before a field was excluded still carry it, so
 * every reader of `oldValues`/`newValues` passes them through here. Anything
 * that is not a plain object (null, an array) comes back unchanged.
 */
export function redactHistoryValues(
  entityType: string,
  values: unknown,
): unknown {
  const typeExcluded = excludedFor(entityType);
  if (
    typeExcluded.length === 0 ||
    values === null ||
    typeof values !== 'object' ||
    Array.isArray(values)
  ) {
    return values;
  }
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !typeExcluded.includes(key)),
  );
}
