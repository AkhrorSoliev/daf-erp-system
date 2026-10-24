import type { Translate } from "@/components/notifications/notification-view";
import { interpolate } from "@/i18n/translate";
import type { BranchOption, Recipient } from "./telegram-report-api";

export type RecipientFilter = "all" | "problem" | "off";

const TZ = "Asia/Tashkent";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const timeOf = (d: Date) =>
  d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dmOf = (d: Date) => {
  const [, m, day] = dayKey(d).split("-");
  return `${day}.${m}`;
};

/** «bugun 16:00» for the Tashkent day of `now`, else «16.10 16:00». */
export function formatWhen(iso: string, now: Date, t: Translate = interpolate): string {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return t("bugun {time}", { time: timeOf(d) });
  return `${dmOf(d)} ${timeOf(d)}`;
}

const failedAttempt = (r: Recipient) => r.lastAttempt !== null && !r.lastAttempt.ok;

// A linked chat whose last report failed will not get the next one either.
const isProblem = (r: Recipient) =>
  r.reach === "BLOCKED" || r.reach === "UNLINKED" || (r.reach === "LINKED" && failedAttempt(r));

export function filterRecipients(list: Recipient[], query: string, filter: RecipientFilter): Recipient[] {
  const q = query.trim().toLowerCase();
  return list.filter((r) => {
    if (filter === "problem" && !isProblem(r)) return false;
    if (filter === "off" && r.isActive) return false;
    if (!q) return true;
    return `${r.name} ${r.position ?? ""}`.toLowerCase().includes(q);
  });
}

export function summarize(list: Recipient[]) {
  const problem = list.filter(isProblem).length;
  return { total: list.length, reaching: list.length - problem, problem };
}

export interface ReachMeta {
  label: string;
  tone: "ok" | "bad" | "warn" | "off";
  note: string;
}

/**
 * The Telegram cell of a row: what to print and in which colour. A failure
 * note (`lastAttempt.note`) is the server's text and passes through as is.
 */
export function reachMeta(r: Recipient, now: Date, t: Translate = interpolate): ReachMeta {
  if (!r.isActive) return { label: t("O'chirilgan"), tone: "off", note: t("hisobot bormaydi") };
  switch (r.reach) {
    case "DELIVERED":
      return {
        label: t("Yetadi"),
        tone: "ok",
        note: r.lastAttempt
          ? t("oxirgi: {when}", { when: formatWhen(r.lastAttempt.at, now, t) })
          : t("yetib boradi"),
      };
    case "LINKED":
      if (r.lastAttempt && failedAttempt(r)) {
        return {
          label: t("Ulangan"),
          tone: "warn",
          note: t("oxirgi urinish: {reason} · {when}", {
            reason: r.lastAttempt.note ?? t("yuborilmadi"),
            when: formatWhen(r.lastAttempt.at, now, t),
          }),
        };
      }
      return { label: t("Ulangan"), tone: "ok", note: t("hali yuborilmagan") };
    case "BLOCKED": {
      const why =
        r.lastAttempt && !r.lastAttempt.ok && r.lastAttempt.note
          ? r.lastAttempt.note
          : r.blockedAt
            ? t("botni bloklagan")
            : t("xabar qabul qilinmayapti");
      const note = r.blockedAt
        ? t("{reason} · {date} dan", { reason: why, date: dmOf(new Date(r.blockedAt)) })
        : why;
      return { label: t("Yetib bormaydi"), tone: "bad", note };
    }
    default:
      return { label: t("Ulanmagan"), tone: "warn", note: t("botda /xodim kerak") };
  }
}

export function branchSummary(r: Recipient, branches: BranchOption[], t: Translate = interpolate): string {
  if (r.allBranches) return t("hamma filial");
  const names = branches.filter((b) => r.branchIds.includes(b.id)).map((b) => b.name);
  return names.length ? names.join(", ") : t("filial tanlanmagan");
}
