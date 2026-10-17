import { describe, expect, it } from "vitest";
import {
  backFallback,
  groupIdFromPath,
  groupTab,
  groupTabHref,
  inAttendanceForm,
  isTeacherTopLevel,
  showTelegramBack,
  teacherBarMode,
  teacherNavActive,
} from "./teacher-nav";

describe("teacherNavActive — the section a path lights up", () => {
  it.each([
    ["/groups", "groups"],
    ["/groups/g1", "groups"],
    ["/groups/g1/", "groups"],
    ["/schedule", "schedule"],
    ["/", "schedule"],
    ["/tasks", "tasks"],
    ["/profile", "profile"],
    ["/qollanma/davomat/jadval", "profile"],
  ])("%s → %s", (path, key) => {
    expect(teacherNavActive(path)).toBe(key);
  });

  it("lights «Oylik», not «Profil», for the salary page", () => {
    expect(teacherNavActive("/profile/salary")).toBe("salary");
  });

  it("lights nothing on a page that belongs to no section", () => {
    expect(teacherNavActive("/notifications")).toBeNull();
  });
});

describe("isTeacherTopLevel / showTelegramBack", () => {
  it("the five sections' own pages have no «orqaga»", () => {
    for (const p of ["/", "/groups", "/schedule", "/tasks", "/profile", "/profile/salary"]) {
      expect(isTeacherTopLevel(p)).toBe(true);
      expect(showTelegramBack(p)).toBe(false);
    }
  });

  it("every deeper page has one", () => {
    for (const p of ["/groups/g1", "/qollanma/boshlash/interfeys", "/notifications"]) {
      expect(showTelegramBack(p)).toBe(true);
    }
  });
});

describe("the bar a page shows", () => {
  it("global on main pages", () => {
    expect(teacherBarMode("/groups", "")).toBe("global");
    expect(teacherBarMode("/profile/salary", "")).toBe("global");
  });

  it("group bar inside a group, on any of its tabs", () => {
    expect(teacherBarMode("/groups/g1", "")).toBe("group");
    expect(teacherBarMode("/groups/g1", "?tab=darslar")).toBe("group");
  });

  it("hidden while the attendance form is open", () => {
    expect(teacherBarMode("/groups/g1", "?sana=2026-10-18")).toBe("hidden");
    expect(inAttendanceForm("/groups/g1", "?tab=davomat&sana=2026-10-18")).toBe(true);
  });

  it("a date on another tab is not the form", () => {
    expect(inAttendanceForm("/groups/g1", "?tab=darslar&sana=2026-10-18")).toBe(false);
    expect(teacherBarMode("/groups/g1", "?tab=darslar&sana=2026-10-18")).toBe("group");
  });
});

describe("group tabs in the URL", () => {
  it("defaults to davomat", () => {
    expect(groupTab("")).toBe("davomat");
    expect(groupTab("?tab=oquvchilar")).toBe("oquvchilar");
  });

  it("keeps the default tab out of the URL and always leaves the form", () => {
    expect(groupTabHref("/groups/g1", "?tab=darslar", "davomat")).toBe("/groups/g1");
    expect(groupTabHref("/groups/g1", "?sana=2026-10-18", "oquvchilar")).toBe(
      "/groups/g1?tab=oquvchilar",
    );
  });

  it("reads the group id only on the group page itself", () => {
    expect(groupIdFromPath("/groups/g1")).toBe("g1");
    expect(groupIdFromPath("/groups")).toBeNull();
    expect(groupIdFromPath("/groups/g1/edit")).toBeNull();
  });
});

describe("backFallback — «orqaga» with no history", () => {
  it("from the form it returns to the calendar of the same group", () => {
    expect(backFallback("/groups/g1", "?sana=2026-10-18")).toBe("/groups/g1");
  });

  it("from a group it returns to the groups", () => {
    expect(backFallback("/groups/g1", "?tab=darslar")).toBe("/groups");
  });
});
