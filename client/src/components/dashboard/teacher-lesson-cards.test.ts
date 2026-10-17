import { describe, expect, it } from "vitest";
import { canOfferAttendance } from "./teacher-lesson-cards";

describe("canOfferAttendance — «Davomat olish» on a lesson card", () => {
  it("is offered today while the register is not taken", () => {
    expect(canOfferAttendance(true, "NOT_TAKEN")).toBe(true);
    // Not started yet: the window opens before the lesson, the server decides.
    expect(canOfferAttendance(true, "PENDING")).toBe(true);
  });

  it("is not offered once the register is taken", () => {
    expect(canOfferAttendance(true, "TAKEN")).toBe(false);
  });

  it("is not offered for a lesson that ended unmarked: a teacher cannot mark it, an administrator answers it", () => {
    expect(canOfferAttendance(true, "MISSED")).toBe(false);
  });

  it("is never offered on another day", () => {
    expect(canOfferAttendance(false, "NOT_TAKEN")).toBe(false);
    expect(canOfferAttendance(false, "PENDING")).toBe(false);
    expect(canOfferAttendance(false, undefined)).toBe(false);
  });
});
