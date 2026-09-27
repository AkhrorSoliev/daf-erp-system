// The birth-date rule the onboarding screen checks before sending. The server
// (`server/src/students/shared/student-onboarding.ts`) checks the same thing
// and is the authority; this copy only saves a round trip on a typo.

export const MIN_STUDENT_AGE = 5;
export const MAX_STUDENT_AGE = 100;

/** 'YYYY-MM-DD' of a Date in the browser's own calendar. */
export function localDateStr(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Full years between two 'YYYY-MM-DD' dates — string arithmetic, no timezone. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Why a birth date is refused, or null when it is fine. */
export function birthDateProblem(
  birthDate: string,
  today: string = localDateStr(),
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return "Tug'ilgan sanangizni tanlang";
  }
  if (birthDate > today) return "Tug'ilgan sana kelajakda bo'lishi mumkin emas";
  const age = ageOn(birthDate, today);
  if (age < MIN_STUDENT_AGE || age > MAX_STUDENT_AGE) {
    return `Yosh ${MIN_STUDENT_AGE} dan ${MAX_STUDENT_AGE} gacha bo'lishi kerak`;
  }
  return null;
}

/** `min` / `max` for the date input, so the picker cannot offer a wrong year. */
export function birthDateBounds(today: string = localDateStr()): {
  min: string;
  max: string;
} {
  const [y, m, d] = today.split("-");
  return {
    min: `${Number(y) - MAX_STUDENT_AGE}-${m}-${d}`,
    max: `${Number(y) - MIN_STUDENT_AGE}-${m}-${d}`,
  };
}
