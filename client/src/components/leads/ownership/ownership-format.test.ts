import { describe, expect, it } from "vitest";
import { dueLabel, dueTone, ownerInitials, ownerName } from "./ownership-format";

// Tashkent wall clock to an instant.
const t = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:00`);
const iso = (day: string, hhmm: string) => t(day, hhmm).toISOString();
const owner = { id: 11, firstName: "Nodira", lastName: "Rahimova" };

describe("owner name", () => {
  it("joins the name and takes the initials", () => {
    expect(ownerName(owner)).toBe("Nodira Rahimova");
    expect(ownerInitials(owner)).toBe("NR");
  });
});

describe("dueTone", () => {
  it("is calm with more than an hour left", () => {
    expect(dueTone(iso("2026-10-19", "14:00"), t("2026-10-19", "12:00"))).toBe("normal");
  });
  it("turns urgent within the last hour", () => {
    expect(dueTone(iso("2026-10-19", "14:00"), t("2026-10-19", "13:10"))).toBe("urgent");
  });
  it("is overdue once the time has passed", () => {
    expect(dueTone(iso("2026-10-19", "14:00"), t("2026-10-19", "14:00"))).toBe("overdue");
  });
});

describe("dueLabel", () => {
  it("shows only the time on the same Tashkent day", () => {
    expect(dueLabel(iso("2026-10-19", "14:30"), t("2026-10-19", "09:00"))).toBe("14:30 gacha");
  });
  it("adds the day when the deadline is on another day", () => {
    expect(dueLabel(iso("2026-10-22", "18:00"), t("2026-10-19", "09:00"))).toBe("22.10, 18:00 gacha");
  });
});
