import type { Holiday } from "@/hooks/use-edit-holiday";
import { msg } from "@/i18n/msg";
import { interpolate, type Params } from "@/i18n/translate";

/** Translates a text; the default fills placeholders and keeps the Uzbek source. */
type Translate = (source: string, params?: Params) => string;

/**
 * Whose a holiday is (CEO decision 10.10.2026). A holiday with no branch
 * (`branchId` null on the server) is the whole centre's, and only the CEO
 * creates, edits or deletes it. Any other holiday is one branch's.
 */
export const CENTRE_WIDE = "centre";
export const CENTRE_WIDE_LABEL = msg("Butun markaz");

/** A row of `GET /holidays`, or the answer of a create/update. */
export interface ApiHoliday {
  id: string;
  name: string;
  date: string;
  endDate: string;
  branchId: number | null;
  /** Only the list carries it (`include: { branch }`). */
  branch?: { name: string } | null;
}

export function toHoliday(h: ApiHoliday): Holiday {
  return {
    id: h.id,
    name: h.name,
    date: h.date,
    endDate: h.endDate,
    branchId: h.branchId,
    branchName: h.branch?.name ?? null,
  };
}

/** The badge on a row: «Butun markaz» or the branch's name. */
export function holidayScopeLabel(
  h: Pick<Holiday, "branchId" | "branchName">,
  t: Translate = interpolate,
): string {
  if (h.branchId == null) return t(CENTRE_WIDE_LABEL);
  return h.branchName ?? t("Filial #{id}", { id: h.branchId });
}

/** The row's «Amallar»: a centre-wide holiday is the CEO's alone. */
export function mayManageHoliday(
  isCeo: boolean,
  branchId: number | null,
): boolean {
  return isCeo || branchId != null;
}

interface BranchRef {
  id: number;
  name: string;
}

/**
 * The branches the CEO may give a new holiday besides «Butun markaz»: the one
 * the switcher shows, or all of them on «Barcha filiallar». The list the CEO
 * is looking at shows exactly these, so a new holiday never lands out of sight.
 */
export function holidayBranchChoices(
  selected: BranchRef | null,
  branches: BranchRef[],
): BranchRef[] {
  return selected ? [selected] : branches;
}

/**
 * `branchId` for `POST /holidays`. A number means that branch. `null` means
 * the whole centre, and the field is left out. `undefined` means a non-CEO
 * whose branch is not known yet, and the request must not go out.
 */
export function newHolidayBranchId(
  isCeo: boolean,
  scope: string,
  selected: { id: number } | null,
): number | null | undefined {
  if (isCeo) return scope === CENTRE_WIDE ? null : Number(scope);
  return selected?.id;
}
