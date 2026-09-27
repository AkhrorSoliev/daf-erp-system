// The birth-date rule the onboarding screen checks before sending. The server
// (`server/src/students/shared/student-onboarding.ts`) checks the same thing
// and is the authority; this copy only saves a round trip on a typo.

import { ageOn, localDateStr } from "@/lib/age";

export { ageOn, localDateStr };

export const MIN_STUDENT_AGE = 5;
export const MAX_STUDENT_AGE = 100;

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
