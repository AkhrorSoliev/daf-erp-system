import { describe, expect, it } from "vitest";
import { answerState, formatLessonDay, makeUpIsAhead, type UnmarkedLessonInfo } from "./unmarked-lesson";

const pending: UnmarkedLessonInfo = { id: "u1", status: "PENDING", claimedBy: null };
const admin = { id: 3, roles: [{ id: 3 }] };

describe("answerState", () => {
  it("shows the prompt to administrators, directors and the CEO only", () => {
    expect(answerState(pending, admin).visible).toBe(true);
    expect(answerState(pending, { id: 5, roles: [{ id: 2 }] }).visible).toBe(true);
    expect(answerState(pending, { id: 9, roles: [{ id: 4 }] }).visible).toBe(false);
    expect(answerState({ ...pending, status: "HELD" }, admin).visible).toBe(false);
    expect(answerState(null, admin).visible).toBe(false);
  });

  it("leaves a taken lesson to its holder, except for directors and the CEO", () => {
    const taken = { ...pending, claimedBy: { id: 4, firstName: "Ali", lastName: "Valiyev" } };
    expect(answerState(taken, admin)).toEqual({ visible: true, canAnswer: false, heldBy: "Ali Valiyev", canExempt: false });
    expect(answerState(taken, { id: 4, roles: [{ id: 3 }] }).canAnswer).toBe(true);
    expect(answerState(taken, { id: 1, roles: [{ id: 1 }] })).toEqual({ visible: true, canAnswer: true, heldBy: "Ali Valiyev", canExempt: true });
  });
});

describe("formatLessonDay", () => {
  it("writes dd.MM.yyyy", () => expect(formatLessonDay("2026-09-28")).toBe("28.09.2026"));
});

describe("makeUpIsAhead", () => {
  const now = { dateStr: "2026-09-30", minutes: 14 * 60 };
  it("accepts a later day or a later time today", () => {
    expect(makeUpIsAhead("2026-10-01", "09:00", now)).toBe(true);
    expect(makeUpIsAhead("2026-09-30", "15:00", now)).toBe(true);
  });
  it("refuses a time that has started or passed", () => {
    expect(makeUpIsAhead("2026-09-30", "14:00", now)).toBe(false);
    expect(makeUpIsAhead("2026-09-29", "18:00", now)).toBe(false);
  });
});
