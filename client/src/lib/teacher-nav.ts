/**
 * The teacher's bottom bar: which section a path belongs to, which bar a page
 * shows, and where «orqaga» goes. Pure, so the rules are tested without a DOM.
 *
 * Three states (CEO-approved scheme, 17.10.2026):
 * - `global`: five sections, on every main page;
 * - `group`: inside a group, its tabs with «‹ Guruhlar» first;
 * - `hidden`: the attendance form, which has its own «Orqaga» / «Saqlash» bar.
 */

import { msg } from "@/i18n/msg";

export type TeacherNavKey = "groups" | "schedule" | "tasks" | "salary" | "profile";

export const TEACHER_NAV: ReadonlyArray<{ key: TeacherNavKey; label: string; href: string }> = [
  { key: "groups", label: msg("Guruhlar"), href: "/groups" },
  { key: "schedule", label: msg("Jadval"), href: "/schedule" },
  { key: "tasks", label: msg("Topshiriq"), href: "/tasks" },
  { key: "salary", label: msg("Oylik"), href: "/profile/salary" },
  { key: "profile", label: msg("Profil"), href: "/profile" },
];

/** The group tabs that sit on the bar; the rest open from «Yana». */
export const GROUP_MAIN_TABS = [
  { key: "davomat", label: msg("Davomat") },
  { key: "darslar", label: msg("Darslar") },
  { key: "oquvchilar", label: msg("O'quvchilar") },
] as const;

export const GROUP_MORE_TABS = [
  { key: "materiallar", label: msg("Materiallar") },
  { key: "imtihonlar", label: msg("Imtihonlar") },
  { key: "statistika", label: msg("Statistika") },
  { key: "ilova", label: msg("Ilova faolligi") },
] as const;

export const DEFAULT_GROUP_TAB = "davomat";

const clean = (pathname: string) => (pathname.replace(/\/+$/, "") || "/");

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(base + "/");

/** The section a path lights up. `/profile/salary` is «Oylik», not «Profil». */
export function teacherNavActive(pathname: string): TeacherNavKey | null {
  const p = clean(pathname);
  if (under(p, "/profile/salary")) return "salary";
  if (under(p, "/profile") || under(p, "/qollanma")) return "profile";
  if (under(p, "/groups")) return "groups";
  if (under(p, "/tasks")) return "tasks";
  if (p === "/" || under(p, "/schedule")) return "schedule";
  return null;
}

const TOP_LEVEL = new Set(["/", "/groups", "/schedule", "/tasks", "/profile", "/profile/salary"]);

/** A page of the global bar itself: nothing above it, so no «orqaga» there. */
export function isTeacherTopLevel(pathname: string): boolean {
  return TOP_LEVEL.has(clean(pathname));
}

export function groupIdFromPath(pathname: string): string | null {
  const m = clean(pathname).match(/^\/groups\/([^/]+)$/);
  return m ? m[1] : null;
}

export function groupTab(search: string): string {
  return new URLSearchParams(search).get("tab") ?? DEFAULT_GROUP_TAB;
}

/** Link to a group tab. Changing tab always leaves the attendance form (`sana`). */
export function groupTabHref(pathname: string, search: string, tab: string): string {
  const params = new URLSearchParams(search);
  params.delete("sana");
  if (tab === DEFAULT_GROUP_TAB) params.delete("tab");
  else params.set("tab", tab);
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}`;
}

/** The attendance form is open: a date is picked on the group's attendance tab. */
export function inAttendanceForm(pathname: string, search: string): boolean {
  return (
    groupIdFromPath(pathname) !== null &&
    groupTab(search) === "davomat" &&
    new URLSearchParams(search).has("sana")
  );
}

export type TeacherBarMode = "global" | "group" | "hidden";

export function teacherBarMode(pathname: string, search: string): TeacherBarMode {
  if (inAttendanceForm(pathname, search)) return "hidden";
  if (groupIdFromPath(pathname) !== null) return "group";
  return "global";
}

/** Whether Telegram's own «←» is shown: everywhere but the main pages. */
export function showTelegramBack(pathname: string): boolean {
  return !isTeacherTopLevel(pathname);
}

/** Where «orqaga» goes when the browser has no history to go back to. */
export function backFallback(pathname: string, search: string): string {
  if (inAttendanceForm(pathname, search)) return groupTabHref(pathname, search, "davomat");
  if (groupIdFromPath(pathname) !== null) return "/groups";
  return "/groups";
}
