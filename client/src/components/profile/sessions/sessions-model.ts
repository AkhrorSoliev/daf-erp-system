import { relativeTime } from "@/components/notifications/notification-view";

/** One row of `GET /users/sessions` (ADR-0112). */
export interface ActiveSession {
  id: string;
  /** "Chrome · macOS" — the server names the device; the client never parses a User-Agent. */
  device: string;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

/** Below this the device is "Hozir faol": the server only learns of activity at a token refresh. */
const ACTIVE_NOW_MINUTES = 5;

/** The device the user is holding first, then the rest as the server sent them (newest activity first). */
export function sortSessions(rows: ActiveSession[]): ActiveSession[] {
  return [...rows].sort((a, b) => Number(b.current) - Number(a.current));
}

/** «Hozir faol», «5 daqiqa oldin», «Kecha, 14:05» — Tashkent clock. */
export function lastSeenText(lastUsedAt: string, now: Date): string {
  const minutes = (now.getTime() - new Date(lastUsedAt).getTime()) / 60_000;
  if (minutes < ACTIVE_NOW_MINUTES) return "Hozir faol";
  return relativeTime(lastUsedAt, now);
}

/** A phone or tablet gets the phone icon; everything else, including an unknown device, the monitor. */
export function isMobileDevice(device: string): boolean {
  return /iOS|Android/.test(device);
}
