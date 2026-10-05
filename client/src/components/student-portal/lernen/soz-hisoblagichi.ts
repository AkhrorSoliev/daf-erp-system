/**
 * What the unit page says about a section's words (ADR-0071): the section's
 * pool is larger than one lesson, and each repeat of a lesson brings the
 * words the student has not met yet. The counts come from the server.
 */
export interface SozHisoblagichi {
  matn: string;
  foiz: number;
  qoldi: number;
  tugadi: boolean;
  /** The line under a finished lesson; `null` once every word is met. */
  yanaMashq: string | null;
}

export function sozHisoblagichi(
  woerter: { jami: number; gesehen: number } | undefined,
): SozHisoblagichi | null {
  if (!woerter || woerter.jami <= 0) return null;
  const { jami } = woerter;
  const gesehen = Math.min(Math.max(woerter.gesehen, 0), jami);
  const qoldi = jami - gesehen;
  return {
    matn: `So'zlar: ${gesehen} / ${jami}`,
    foiz: Math.round((gesehen / jami) * 100),
    qoldi,
    tugadi: qoldi === 0,
    yanaMashq: qoldi > 0 ? `Yana mashq qilish · ${qoldi} yangi so'z` : null,
  };
}
