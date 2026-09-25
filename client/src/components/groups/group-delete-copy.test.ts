import { describe, expect, it } from "vitest";
import { liveStudentsLine } from "./group-delete-copy";

describe("group delete dialog count line", () => {
  it("counts active students", () => {
    expect(liveStudentsLine({ active: 5, frozen: 0 })).toBe(
      "Guruhda hali 5 ta o'quvchi bor.",
    );
  });

  it("counts frozen students too, and says how many are frozen", () => {
    expect(liveStudentsLine({ active: 5, frozen: 2 })).toBe(
      "Guruhda hali 7 ta o'quvchi bor (2 tasi muzlatilgan).",
    );
  });

  it("names a group that holds only frozen students", () => {
    // The groups table shows 0 students for this group.
    expect(liveStudentsLine({ active: 0, frozen: 3 })).toBe(
      "Guruhda hali 3 ta muzlatilgan o'quvchi bor.",
    );
  });

  it("has no count line for an empty group", () => {
    expect(liveStudentsLine({ active: 0, frozen: 0 })).toBeNull();
  });
});
