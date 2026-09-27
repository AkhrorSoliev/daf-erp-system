// Birth-date entry for the first-run screen. The field is typed as DD.MM.YYYY
// (no native date picker: adding one is a native module, which an OTA update
// cannot ship). The server checks the same range and is the authority; this
// copy only saves a round trip on a typo.

export const MIN_STUDENT_AGE = 5;
export const MAX_STUDENT_AGE = 100;

/** Live mask: keeps digits only and inserts the dots — "1503200" → "15.03.200". */
export function maskBirthDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

/** 'YYYY-MM-DD' of a Date in the device's own calendar. */
export function localDateStr(date: Date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Full years between two 'YYYY-MM-DD' dates — string arithmetic, no timezone. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export type BirthDateResult =
  | { ok: true; iso: string; age: number }
  | { ok: false; reason: 'format' | 'invalid' | 'future' | 'age' };

/** Parses the masked "DD.MM.YYYY" and checks it against today. */
export function parseBirthDate(masked: string, today: string = localDateStr()): BirthDateResult {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(masked);
  if (!m) return { ok: false, reason: 'format' };
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return { ok: false, reason: 'invalid' };
  }
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (iso > today) return { ok: false, reason: 'future' };
  const age = ageOn(iso, today);
  if (age < MIN_STUDENT_AGE || age > MAX_STUDENT_AGE) return { ok: false, reason: 'age' };
  return { ok: true, iso, age };
}
