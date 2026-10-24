import { formatPhone } from "@/lib/format-utils";
import { msg } from "@/i18n/msg";
import { interpolate, type Params } from "@/i18n/translate";
import type { ExtraPhoneStatus } from "./lib/types";

export type ExtraPhoneAction = "add" | "change" | "remove";

export interface ExtraPhoneRowState {
  value: string;
  actions: ExtraPhoneAction[];
  note: string | null;
}

/** The page's `t`; without it the row reads the Uzbek source. */
type Translate = (source: string, params?: Params) => string;

export const EXTRA_PHONE_SIGN_IN_NOTE = msg(
  "Bu raqam bilan ham tizimga kira olasiz. Parolni tiklash kodi faqat asosiy raqamga boradi.",
);
export const EXTRA_PHONE_STAFF_ONLY_NOTE = msg(
  "Zaxira raqamni administrator qo'shadi.",
);

/** What the Profile row shows for the backup number (ADR-0070). */
export function extraPhoneRowState(
  status: ExtraPhoneStatus | undefined,
  t: Translate = interpolate,
): ExtraPhoneRowState | null {
  if (!status) return null;
  const has = Boolean(status.phone);
  return {
    value: has ? formatPhone(status.phone as string) : t("Qo'shilmagan"),
    actions: status.editable ? (has ? ["change", "remove"] : ["add"]) : [],
    note: has
      ? t(EXTRA_PHONE_SIGN_IN_NOTE)
      : status.editable
        ? null
        : t(EXTRA_PHONE_STAFF_ONLY_NOTE),
  };
}
