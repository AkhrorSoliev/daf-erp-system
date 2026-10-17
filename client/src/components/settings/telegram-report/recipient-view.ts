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
export function formatWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  return `${dayKey(d) === dayKey(now) ? "bugun" : dmOf(d)} ${timeOf(d)}`;
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

/** The Telegram cell of a row: what to print and in which colour. */
export function reachMeta(r: Recipient, now: Date): ReachMeta {
  if (!r.isActive) return { label: "O'chirilgan", tone: "off", note: "hisobot bormaydi" };
  switch (r.reach) {
    case "DELIVERED":
      return {
        label: "Yetadi",
        tone: "ok",
        note: r.lastAttempt ? `oxirgi: ${formatWhen(r.lastAttempt.at, now)}` : "yetib boradi",
      };
    case "LINKED":
      if (r.lastAttempt && failedAttempt(r)) {
        return {
          label: "Ulangan",
          tone: "warn",
          note: `oxirgi urinish: ${r.lastAttempt.note ?? "yuborilmadi"} · ${formatWhen(r.lastAttempt.at, now)}`,
        };
      }
      return { label: "Ulangan", tone: "ok", note: "hali yuborilmagan" };
    case "BLOCKED": {
      const why =
        r.lastAttempt && !r.lastAttempt.ok && r.lastAttempt.note
          ? r.lastAttempt.note
          : r.blockedAt
            ? "botni bloklagan"
            : "xabar qabul qilinmayapti";
      const since = r.blockedAt ? ` · ${dmOf(new Date(r.blockedAt))} dan` : "";
      return { label: "Yetmaydi", tone: "bad", note: `${why}${since}` };
    }
    default:
      return { label: "Ulanmagan", tone: "warn", note: "botda /xodim kerak" };
  }
}

export function branchSummary(r: Recipient, branches: BranchOption[]): string {
  if (r.allBranches) return "hamma filial";
  const names = branches.filter((b) => r.branchIds.includes(b.id)).map((b) => b.name);
  return names.length ? names.join(", ") : "filial tanlanmagan";
}
