import { interpolate } from "@/i18n/translate";
import type { Translate } from "@/components/notifications/notification-view";
import type { OwnershipLogEntry } from "./archive-types";

/** One line of the ownership history, in words. Names and the reason are data. */
export function ownershipLogText(
  e: OwnershipLogEntry,
  t: Translate = interpolate,
): string {
  const who = t("Xodim");
  const from = e.from ?? who;
  const to = e.to ?? who;
  switch (e.kind) {
    case "CLAIM":
      return t("{name} band qildi", { name: to });
    case "ASSIGN":
      return t("{actor} lidni {to}ga berdi", { actor: e.actor ?? who, to });
    case "RELEASE":
      return e.reason
        ? t("{name} bo'shatdi — {reason}", { name: from, reason: e.reason })
        : t("{name} bo'shatdi", { name: from });
    case "EXPIRE":
      return t("{name} muddatida ish qilmadi, lid havzaga qaytdi", {
        name: from,
      });
  }
}
