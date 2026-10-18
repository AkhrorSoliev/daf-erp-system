import type { OwnershipLogEntry } from "./archive-types";

const WHO = "Xodim";

/** One line of the ownership history, in words. */
export function ownershipLogText(e: OwnershipLogEntry): string {
  const from = e.from ?? WHO;
  const to = e.to ?? WHO;
  switch (e.kind) {
    case "CLAIM":
      return `${to} band qildi`;
    case "ASSIGN":
      return `${e.actor ?? WHO} lidni ${to}ga berdi`;
    case "RELEASE":
      return `${from} bo'shatdi${e.reason ? ` — ${e.reason}` : ""}`;
    case "EXPIRE":
      return `${from} muddatida ish qilmadi, lid havzaga qaytdi`;
  }
}
