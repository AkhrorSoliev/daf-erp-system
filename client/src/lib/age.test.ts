import { describe, expect, it } from "vitest";
import { ageFromStoredDate, ageOn, localDateStr } from "./age";

describe("age", () => {
  it("counts full years and turns over on the birthday itself", () => {
    expect(ageOn("2004-09-28", "2026-09-27")).toBe(21);
    expect(ageOn("2004-09-27", "2026-09-27")).toBe(22);
  });

  it("reads a stored date on the day the card displays it", () => {
    // Whatever the two writers stored, the viewer's calendar day is the answer.
    const iso = new Date(2004, 2, 15).toISOString(); // staff picker: local midnight
    expect(localDateStr(new Date(iso))).toBe("2004-03-15");
    expect(ageFromStoredDate(iso, "2026-03-14")).toBe(21);
    expect(ageFromStoredDate(iso, "2026-03-15")).toBe(22);
  });
});
