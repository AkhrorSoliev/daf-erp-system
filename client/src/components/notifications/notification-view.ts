/**
 * The bell's pure rules (spec 2026-10-07 §8): types, folding, the Tashkent
 * clock. No React and no API, so vitest covers them in node.
 */
import {
  tashkentDayNumber,
  tashkentDdMm,
  tashkentHhmm,
  tashkentWallClock,
} from "@/lib/tashkent-time";

/** Mirrors `enum NotificationType` in server/prisma/schema.prisma (the test reads it). */
export const NOTIFICATION_TYPES = [
  "COMMENT",
  "TASK_ASSIGNED",
  "TASK_STATUS_CHANGED",
  "TASK_DELETED",
  "TASK_UPDATED",
  "TASK_REMINDER",
  "TASK_REVIEW",
  "TASK_OVERDUE",
  "SYSTEM",
  "LESSON_STARTED",
  "ATTENDANCE_ADMIN_ALERT",
  "ATTENDANCE_TEACHER_WARNING",
  "ATTENDANCE_MISSING_TEACHER",
  "ATTENDANCE_MISSING_ADMIN",
  "ATTENDANCE_COMPLETED",
  "LESSON_RESCHEDULED",
  "LESSON_CANCELLED",
  "PAYMENT_PROMISE_OVERDUE",
  "ABSENCE_WARNING",
  "ENROLLMENT_AUTO_PAUSED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** The server's four groups (`notification-kind.ts`); every row arrives with its `group`. */
export const NOTIFICATION_GROUPS = ["task", "attendance", "payment", "system"] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export const GROUP_LABEL: Record<NotificationGroup, string> = {
  task: "Topshiriqlar",
  attendance: "Davomat",
  payment: "To'lovlar",
  system: "Tizim",
};

export interface AppNotification {
  id: string;
  type: NotificationType;
  group: NotificationGroup;
  title: string;
  message: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  commentId: string | null;
  taskId: string | null;
  isRead: boolean;
  actionRequired: boolean;
  resolvedAt: string | null;
  groupKey: string | null;
  createdAt: string;
}

export interface NotificationCounts {
  pending: number;
  all: number;
  groups: Record<NotificationGroup, number>;
}

/** «Kutilmoqda»: waits for the viewer, read or not. */
export function isPending(n: Pick<AppNotification, "actionRequired" | "resolvedAt">): boolean {
  return n.actionRequired && n.resolvedAt === null;
}

/** "HH:mm" on the Tashkent clock. */
export const clockTime = tashkentHhmm;

/** «Bugun», «Kecha» or dd.MM.yyyy — Tashkent days, never the browser's. */
export function dayLabel(iso: string, now: Date): string {
  const diff = tashkentDayNumber(now) - tashkentDayNumber(iso);
  if (diff === 0) return "Bugun";
  if (diff === 1) return "Kecha";
  return `${tashkentDdMm(iso)}.${tashkentWallClock(iso).getUTCFullYear()}`;
}

/** «hozirgina», «5 daqiqa oldin», «2 soat oldin», then the clock. */
export function relativeTime(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "hozirgina";
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  if (minutes < 6 * 60) return `${Math.floor(minutes / 60)} soat oldin`;
  const day = dayLabel(iso, now);
  return day === "Bugun" ? clockTime(iso) : `${day}, ${clockTime(iso)}`;
}

export type NotificationRow =
  | { kind: "single"; key: string; item: AppNotification }
  | { kind: "group"; key: string; type: NotificationType; items: AppNotification[] };
type GroupRow = Extract<NotificationRow, { kind: "group" }>;

/** Rows sharing a `groupKey` fold into one line at the newest one's place. Input is newest first. */
export function groupNotifications(items: AppNotification[]): NotificationRow[] {
  const out: NotificationRow[] = [];
  const byKey = new Map<string, GroupRow>();
  for (const item of items) {
    if (!item.groupKey) {
      out.push({ kind: "single", key: item.id, item });
      continue;
    }
    const existing = byKey.get(item.groupKey);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const row: GroupRow = { kind: "group", key: item.groupKey, type: item.type, items: [item] };
    byKey.set(item.groupKey, row);
    out.push(row);
  }
  return out.map((row) =>
    row.kind === "group" && row.items.length === 1
      ? { kind: "single", key: row.items[0].id, item: row.items[0] }
      : row,
  );
}

/** Consecutive runs of one Tashkent day, newest first. */
export function groupByDay(
  items: AppNotification[],
  now: Date,
): { label: string; items: AppNotification[] }[] {
  const out: { day: number; label: string; items: AppNotification[] }[] = [];
  for (const item of items) {
    const day = tashkentDayNumber(item.createdAt);
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(item);
    else out.push({ day, label: dayLabel(item.createdAt, now), items: [item] });
  }
  return out.map(({ label, items: list }) => ({ label, items: list }));
}

/** The panel's «Kutilmoqda» tab: what waits, then today's information (closed ones greyed). */
export function panelSections(
  pending: AppNotification[],
  recent: AppNotification[],
  now: Date,
): { waiting: NotificationRow[]; todayInfo: NotificationRow[] } {
  return {
    waiting: groupNotifications(pending.filter(isPending)),
    todayInfo: groupNotifications(
      recent.filter((n) => !isPending(n) && tashkentDayNumber(n.createdAt) === tashkentDayNumber(now)),
    ),
  };
}

const LESSON_GROUP: Partial<Record<NotificationType, { title: string; hint: string }>> = {
  LESSON_STARTED: { title: "Dars boshlandi", hint: "Davomatni belgilashni unutmang" },
  ATTENDANCE_TEACHER_WARNING: { title: "Davomat olinmagan", hint: "Dars tugashiga 30 daqiqadan kam qoldi" },
  ATTENDANCE_ADMIN_ALERT: { title: "Davomat olinmagan", hint: "Dars tugashiga 30 daqiqadan kam qoldi" },
  ATTENDANCE_MISSING_TEACHER: { title: "Davomat olinmadi", hint: "Dars tugadi, davomat olinmadi" },
  ATTENDANCE_MISSING_ADMIN: { title: "Davomat olinmadi", hint: "«Dars bo'ldimi?» savoliga javob bering" },
};

/** «Davomat olinmagan · 3 guruh». */
export function groupTitle(row: GroupRow): string {
  return `${LESSON_GROUP[row.type]?.title ?? row.items[0].title} · ${row.items.length} guruh`;
}

/** The folded line's second line: what it waits for, or when the last one closed. */
export function groupHint(row: GroupRow): string {
  if (row.items.some((n) => n.resolvedAt === null)) return LESSON_GROUP[row.type]?.hint ?? "";
  const last = row.items.map((n) => n.resolvedAt ?? "").sort().pop() ?? "";
  return `O'zi yopildi · ${clockTime(last)}`;
}

/**
 * The details block every lesson alert carries (attendance-reminder.service.ts
 * `buildDetailsBlock`: «👥 Guruh: …», «🕐 Vaqt: …», «👨‍🏫 O'qituvchi: …»). A part
 * the message does not carry stays `undefined`; the value stops at the line's end.
 */
export function lessonParts(message: string): { group?: string; time?: string; teacher?: string } {
  const pick = (label: string) =>
    message.match(new RegExp(`${label}:[ \\t]*(.+)`))?.[1]?.trim() || undefined;
  return { group: pick("Guruh"), time: pick("Vaqt"), teacher: pick("O'qituvchi") };
}

/** The first line of a message that has words in it — the portal link line («🔗 https://…») is not one. */
function firstTextLine(message: string): string | undefined {
  return message
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/https?:\/\//i.test(l));
}

/**
 * «A1-3 · 09:00–10:30 · Tursunova Sardora». A message without the details block
 * (another shape, or a later wording) shows its first line of text instead of
 * dropping it (not the portal link under it); the title is the last resort.
 */
export function lessonLine(n: Pick<AppNotification, "title" | "message">): string {
  const { group, time, teacher } = lessonParts(n.message);
  return [group, time, teacher].filter(Boolean).join(" · ") || firstTextLine(n.message) || n.title;
}

export function resolvedLine(resolvedAt: string): string {
  return `Eslatma o'zi yopildi · ${clockTime(resolvedAt)}`;
}

/** A task is looked at; everything else is opened. */
export function actionLabel(type: NotificationType): string {
  return type.startsWith("TASK_") ? "Ko'rish" : "Ochish";
}

/** The page's left list, in order. */
export const PAGE_VIEWS = ["pending", "all", ...NOTIFICATION_GROUPS] as const;
export type PageView = (typeof PAGE_VIEWS)[number];

export const VIEW_LABEL: Record<PageView, string> = {
  pending: "Kutilmoqda",
  all: "Hammasi",
  ...GROUP_LABEL,
};

/** `?view=` → the API's `filter` and `type`; anything unknown reads as «Kutilmoqda». */
export function viewParams(view: string): { filter: "pending" | "all"; type?: NotificationGroup } {
  if (view === "all") return { filter: "all" };
  if ((NOTIFICATION_GROUPS as readonly string[]).includes(view)) {
    return { filter: "all", type: view as NotificationGroup };
  }
  return { filter: "pending" };
}

export function viewCount(view: PageView, counts: NotificationCounts | undefined): number | null {
  if (!counts) return null;
  if (view === "pending") return counts.pending;
  if (view === "all") return counts.all;
  return counts.groups[view];
}
