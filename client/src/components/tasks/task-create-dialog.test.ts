import { describe, expect, it } from "vitest";
import { tashkentDateTime } from "./task-create-dialog";

// The picker hands over local midnight; the instant must not depend on the machine's zone.
describe("tashkentDateTime", () => {
  const day = new Date(2026, 9, 7);

  it("reads the time as Tashkent (UTC+5)", () => {
    expect(tashkentDateTime(day, "18:00")).toBe("2026-10-07T13:00:00.000Z");
    expect(tashkentDateTime(day, "08:30")).toBe("2026-10-07T03:30:00.000Z");
  });

  it("falls back to 18:00 when the time is empty", () => {
    expect(tashkentDateTime(day, "")).toBe("2026-10-07T13:00:00.000Z");
  });

  it("rolls back into the previous UTC day before 05:00", () => {
    expect(tashkentDateTime(day, "00:30")).toBe("2026-10-06T19:30:00.000Z");
  });
});
