import { formatPhone } from "@/lib/format-utils";
import type { ExtraPhoneStatus } from "./lib/types";

export type ExtraPhoneAction = "add" | "change" | "remove";

export interface ExtraPhoneRowState {
  value: string;
  actions: ExtraPhoneAction[];
  note: string | null;
}

export const EXTRA_PHONE_SIGN_IN_NOTE =
  "Bu raqam bilan ham tizimga kira olasiz. Parolni tiklash kodi faqat asosiy raqamga boradi.";
export const EXTRA_PHONE_STAFF_ONLY_NOTE = "Zaxira raqamni administrator qo'shadi.";

/** What the Profile row shows for the backup number (ADR-0067). */
export function extraPhoneRowState(
  status: ExtraPhoneStatus | undefined,
): ExtraPhoneRowState | null {
  if (!status) return null;
  const has = Boolean(status.phone);
  return {
    value: has ? formatPhone(status.phone as string) : "Qo'shilmagan",
    actions: status.editable ? (has ? ["change", "remove"] : ["add"]) : [],
    note: has
      ? EXTRA_PHONE_SIGN_IN_NOTE
      : status.editable
        ? null
        : EXTRA_PHONE_STAFF_ONLY_NOTE,
  };
}
