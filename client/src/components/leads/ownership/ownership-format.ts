import { interpolate } from "@/i18n/translate";
import type { Translate } from "@/components/notifications/notification-view";
import { tashkentDayNumber, tashkentDdMm, tashkentHhmm } from "@/lib/tashkent-time";

/** A lead's owner as the server sends it (ADR-0093). */
export interface LeadOwner {
  id: number;
  firstName: string;
  lastName: string;
}

export function ownerName(o: LeadOwner): string {
  return `${o.firstName} ${o.lastName}`.trim();
}

export function ownerInitials(o: LeadOwner): string {
  return `${o.firstName.charAt(0)}${o.lastName.charAt(0)}`.toUpperCase();
}

/** Under an hour left: the deadline turns orange. */
export const URGENT_MS = 60 * 60 * 1000;

export type DueTone = "normal" | "urgent" | "overdue";

export function dueTone(dueAt: string, now: Date): DueTone {
  const left = new Date(dueAt).getTime() - now.getTime();
  if (left <= 0) return "overdue";
  return left <= URGENT_MS ? "urgent" : "normal";
}

/** «14:30 gacha» today, «22.10, 18:00 gacha» another day — on the Tashkent clock. */
export function dueLabel(dueAt: string, now: Date, t: Translate = interpolate): string {
  const time = tashkentHhmm(dueAt);
  return tashkentDayNumber(dueAt) === tashkentDayNumber(now)
    ? t("{time} gacha", { time })
    : t("{date}, {time} gacha", { date: tashkentDdMm(dueAt), time });
}
