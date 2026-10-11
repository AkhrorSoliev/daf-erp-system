/**
 * Pairs an old, corrected (REVERSED) payment with the new payment its
 * correction re-posted (spec B4 §5.10). Pure, so the matching rules are tested.
 * Only an unambiguous pair is linked; anything else is listed with its reason.
 */
import { formatSom } from '../../src/payments/shared/format-som';

/** How a correction's reversal row starts: an amount fix, or the older method-only fix. */
export const CORRECTION_REASON_PREFIXES = [
  "Bekor qilindi: Summa to'g'rilandi:",
  "Bekor qilindi: To'lov usuli to'g'rilandi",
];

const WINDOW_MS = 10 * 60 * 1000;

export interface ReversedCandidate {
  id: string;
  studentId: number;
  amount: number;
  reversedAt: Date;
  reversalDescription: string | null;
}

export interface NewCandidate {
  id: string;
  studentId: number;
  createdAt: Date;
  note: string | null;
}

export function matchCorrections(
  reversed: ReversedCandidate[],
  fresh: NewCandidate[],
): {
  links: { oldId: string; newId: string }[];
  unlinked: { oldId: string; reason: string }[];
} {
  const links: { oldId: string; newId: string }[] = [];
  const unlinked: { oldId: string; reason: string }[] = [];
  const used = new Set<string>();

  const corrected = reversed
    .filter((r) =>
      CORRECTION_REASON_PREFIXES.some((p) =>
        r.reversalDescription?.startsWith(p),
      ),
    )
    .sort((a, b) => a.reversedAt.getTime() - b.reversedAt.getTime());

  for (const old of corrected) {
    const prefix = `To'g'rilangan to'lov (avvalgi summa: ${formatSom(old.amount)} so'm)`;
    const from = old.reversedAt.getTime();
    const candidates = fresh.filter(
      (n) =>
        !used.has(n.id) &&
        n.studentId === old.studentId &&
        n.createdAt.getTime() >= from &&
        n.createdAt.getTime() <= from + WINDOW_MS &&
        n.note?.startsWith(prefix),
    );
    if (candidates.length === 1) {
      used.add(candidates[0].id);
      links.push({ oldId: old.id, newId: candidates[0].id });
    } else {
      unlinked.push({
        oldId: old.id,
        reason:
          candidates.length === 0
            ? 'nomzod topilmadi'
            : `${candidates.length} ta nomzod`,
      });
    }
  }
  return { links, unlinked };
}
