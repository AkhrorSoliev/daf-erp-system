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
]);

function isPlainValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value instanceof Date) return true;
  if (Array.isArray(value)) return false;
  if (typeof value === 'object') return false;
  return true;
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
): { oldValues: Record<string, any>; newValues: Record<string, any> } | null {
  const oldValues: Record<string, any> = {};
  const newValues: Record<string, any> = {};
  let hasChanges = false;

  for (const key of Object.keys(newObj)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    if (!isPlainValue(newObj[key])) continue;
    if (!(key in oldObj)) continue;
    if (!isPlainValue(oldObj[key])) continue;

    if (!valuesEqual(oldObj[key], newObj[key])) {
      if (key === 'photo') {
        oldValues[key] = oldObj[key] ? 'eski rasm' : null;
        newValues[key] = newObj[key] ? 'yangi rasm' : null;
      } else {
        oldValues[key] = oldObj[key] ?? null;
        newValues[key] = newObj[key] ?? null;
      }
      hasChanges = true;
    }
  }

  return hasChanges ? { oldValues, newValues } : null;
}

export function stripSensitiveFields(
  obj: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    if (!isPlainValue(obj[key])) continue;
    result[key] = obj[key] ?? null;
  }
  return result;
}
