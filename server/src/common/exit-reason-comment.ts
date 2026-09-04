/**
 * "Boshqa sabab" — the catch-all entry in the company-editable exit-reason
 * list. Picking it records that the student left but nothing about WHY, so
 * the free-text comment is mandatory alongside it. Every other configured
 * reason ("Narx qimmat", "Filial almashdi", ...) is self-explanatory and
 * keeps its optional comment.
 *
 * There is no schema flag for this — StudentExitReason rows are plain
 * name/appliesTo data the CEO edits in settings — so the catch-all is
 * matched by normalized name. The match is EXACT on purpose: a prefix match
 * would also swallow "Boshqa guruhga ko'chdi", which is a real reason.
 *
 * Client mirror: client/src/lib/exit-reason-utils.ts — keep the two in sync.
 */
export const EXIT_REASON_COMMENT_MIN_LENGTH = 5;

const CATCH_ALL_REASON_NAMES = new Set(['boshqa sabab', 'boshqa', 'other']);

export function exitReasonRequiresComment(name: string): boolean {
  return CATCH_ALL_REASON_NAMES.has(
    name.trim().toLowerCase().replace(/\s+/g, ' '),
  );
}

export const EXIT_REASON_COMMENT_ERROR =
  "«Boshqa sabab» tanlanganda izoh yozish majburiy (kamida 5 belgi) — o'quvchi nega ketayotganini yozing";
