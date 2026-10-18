import { interpolate, type Params } from "@/i18n/translate";

type Translate = (source: string, params?: Params) => string;

/**
 * What deleting a group would do to its students, as
 * `GET /groups/:id/delete-preview` reports it: live enrollments by status.
 */
export interface GroupDeletePreview {
  active: number;
  frozen: number;
}

/**
 * The delete dialog's count line, or null for a group with nobody in it.
 *
 * Frozen students are named because the groups table counts ACTIVE students
 * only, and a deletion takes the frozen ones out too — the students left
 * behind by earlier deletions were all frozen.
 *
 * `t` translates the sentence (default: the Uzbek text with its figures filled
 * in), so a page without a language keeps its output.
 */
export function liveStudentsLine(
  { active, frozen }: GroupDeletePreview,
  t: Translate = interpolate,
): string | null {
  const total = active + frozen;
  if (total === 0) return null;
  if (active === 0) return t("Guruhda hali {n} ta muzlatilgan o'quvchi bor.", { n: frozen });
  if (frozen === 0) return t("Guruhda hali {n} ta o'quvchi bor.", { n: total });
  return t("Guruhda hali {n} ta o'quvchi bor ({frozen} tasi muzlatilgan).", { n: total, frozen });
}
