/**
 * Shared mock-exam pricing + level helpers.
 *
 * A mock exam has a public `price` and an optional discounted `studentPrice`
 * for real DaF students. Every place that must know "how much does THIS
 * registrant owe" routes through `resolveParticipantFee` so the discount is
 * applied consistently across the bot, the gateway match, the payment
 * deep-link, the balance auto-deduct, and the revenue summary.
 */

/** CEFR levels an exam may offer. Order matters for the bot button layout. */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];

export function isCefrLevel(value: unknown): value is CefrLevel {
  return (
    typeof value === 'string' && (CEFR_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * Keep only valid, de-duplicated CEFR codes, preserving canonical order.
 * Used when persisting an admin-selected offered-levels set.
 */
export function sanitizeOfferedLevels(input: unknown): CefrLevel[] {
  if (!Array.isArray(input)) return [];
  const set = new Set(input.filter(isCefrLevel));
  return CEFR_LEVELS.filter((l) => set.has(l));
}

/**
 * The fee a single participant owes for one registration.
 *
 * - Non-DaF (outsider): always the full `price`.
 * - DaF student: the discounted `studentPrice` when set, else full `price`.
 *
 * `studentPrice` of 0 is respected (a free mock for DaF students) — only
 * `null`/`undefined` falls back to `price`.
 */
export function resolveParticipantFee(
  exam: { price: number; studentPrice?: number | null },
  isDafStudent: boolean,
): number {
  if (isDafStudent && exam.studentPrice != null) {
    return exam.studentPrice;
  }
  return exam.price;
}
