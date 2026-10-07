import { describe, expect, it } from "vitest";
import type { TaskCard, TaskPerson } from "@/hooks/use-tasks";
import { judgeDrop } from "./task-drop";

const person = (id: number): TaskPerson => ({ id, firstName: "A", lastName: "B", photo: null });
const card = (over: Partial<TaskCard> = {}): TaskCard => ({
  id: "t1", kind: "MANUAL", title: "t", status: "NEW", priority: "MEDIUM", dueAt: null, branchId: null,
  entityType: null, entityId: null, requiresPhoto: false, batchId: null, claimedById: null,
  returnedCount: 0, closedAt: null, createdAt: "2026-10-01T00:00:00Z", author: person(9),
  assignees: [person(1)], watchers: [], stepsTotal: 0, stepsDone: 0, eventsCount: 0, unmarkedLesson: null, ...over,
});

describe("judgeDrop", () => {
  it("dropping on the same column does nothing", () => {
    expect(judgeDrop(card(), "NEW", 1)).toEqual({ kind: "skip" });
  });
  it("a manual card moves to «Jarayonda» and «Tekshiruvda» after a confirmation", () => {
    expect(judgeDrop(card(), "IN_PROGRESS", 1)).toEqual({ kind: "confirm" });
    expect(judgeDrop(card(), "IN_REVIEW", 1)).toEqual({ kind: "confirm" });
  });
  it("DONE is a confirmation only for a task the user gave to themselves alone", () => {
    const own = card({ author: person(1), assignees: [person(1)] });
    expect(judgeDrop(own, "DONE", 1)).toEqual({ kind: "confirm" });
    expect(judgeDrop(card(), "DONE", 1)).toEqual({ kind: "toast", message: "Bajardim deb belgilash uchun «Tekshiruvga yuborish» ni bosing" });
    expect(judgeDrop(card({ author: person(1), assignees: [person(1), person(2)] }), "DONE", 1).kind).toBe("toast");
    expect(judgeDrop(own, "DONE", undefined).kind).toBe("toast");
  });
  it("a system card may only be started; every other drop is refused", () => {
    const sys = card({ kind: "LESSON_QUESTION" });
    expect(judgeDrop(sys, "IN_PROGRESS", 1)).toEqual({ kind: "confirm" });
    expect(judgeDrop(sys, "DONE", 1)).toEqual({ kind: "toast", message: "Bu topshiriqni tizim o'zi yopadi" });
    expect(judgeDrop(sys, "IN_REVIEW", 1).kind).toBe("toast");
    expect(judgeDrop(card({ kind: "CALLBACK", status: "IN_PROGRESS" }), "NEW", 1).kind).toBe("toast");
  });
});
