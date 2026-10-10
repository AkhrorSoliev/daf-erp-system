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
const toast = (message: string) => ({ kind: "toast", message });
const own = (over: Partial<TaskCard> = {}) => card({ author: person(1), assignees: [person(1)], ...over });

describe("judgeDrop", () => {
  it("dropping on the same column does nothing", () => {
    expect(judgeDrop(card(), "NEW", 1)).toEqual({ kind: "skip" });
  });
  it("a manual card moves to «Jarayonda» and «Tekshiruvda» after a confirmation", () => {
    expect(judgeDrop(card(), "IN_PROGRESS", 1)).toEqual({ kind: "confirm" });
    expect(judgeDrop(card(), "IN_REVIEW", 1)).toEqual({ kind: "confirm" });
    expect(judgeDrop(card({ status: "IN_PROGRESS" }), "IN_REVIEW", 1)).toEqual({ kind: "confirm" });
  });
  it("DONE is a confirmation only for a task the user gave to themselves alone", () => {
    expect(judgeDrop(own(), "DONE", 1)).toEqual({ kind: "confirm" });
    expect(judgeDrop(own({ status: "IN_PROGRESS" }), "DONE", 1)).toEqual({ kind: "confirm" });
    expect(judgeDrop(card(), "DONE", 1)).toEqual(toast("Bajardim deb belgilash uchun «Tekshiruvga yuborish» ni bosing"));
    expect(judgeDrop(card({ author: person(1), assignees: [person(1), person(2)] }), "DONE", 1).kind).toBe("toast");
    expect(judgeDrop(own(), "DONE", undefined).kind).toBe("toast");
  });
  it("a closed card cannot be moved out of «Bajarildi»", () => {
    const done = card({ status: "DONE" });
    for (const to of ["NEW", "IN_PROGRESS", "IN_REVIEW"] as const) {
      expect(judgeDrop(done, to, 1)).toEqual(toast("Yopilgan topshiriq qayta ochilmaydi"));
    }
    expect(judgeDrop(card({ kind: "CALLBACK", status: "DONE" }), "IN_PROGRESS", 1)).toEqual(toast("Yopilgan topshiriq qayta ochilmaydi"));
  });
  it("a card in review is the author's to accept or return", () => {
    const review = card({ status: "IN_REVIEW" });
    expect(judgeDrop(review, "NEW", 1)).toEqual(toast("Tekshiruvdagi topshiriqni beruvchi qaytaradi"));
    expect(judgeDrop(review, "IN_PROGRESS", 1)).toEqual(toast("Tekshiruvdagi topshiriqni beruvchi qaytaradi"));
    expect(judgeDrop(review, "DONE", 1)).toEqual(toast("Tekshiruvdagi topshiriqni beruvchi qabul qiladi"));
  });
  it("a self task has no review step: it can be started and finished, nothing else", () => {
    const msg = toast("O'zingizga yozilgan topshiriqda tekshiruv bosqichi yo'q");
    expect(judgeDrop(own(), "IN_REVIEW", 1)).toEqual(msg);
    expect(judgeDrop(own({ status: "IN_PROGRESS" }), "IN_REVIEW", 1)).toEqual(msg);
    expect(judgeDrop(own({ status: "IN_PROGRESS" }), "NEW", 1)).toEqual(msg);
    expect(judgeDrop(own(), "IN_PROGRESS", 1)).toEqual({ kind: "confirm" });
  });
  it("a card that needs a photo cannot be sent to review from the board", () => {
    const photo = toast("Tekshiruvga yuborish uchun rasm qo'shing");
    expect(judgeDrop(card({ requiresPhoto: true }), "IN_REVIEW", 1)).toEqual(photo);
    expect(judgeDrop(card({ requiresPhoto: true, status: "IN_PROGRESS" }), "IN_REVIEW", 1)).toEqual(photo);
    expect(judgeDrop(card({ requiresPhoto: true }), "IN_PROGRESS", 1)).toEqual({ kind: "confirm" });
  });
  it("a started card cannot go back to «Yangi»", () => {
    expect(judgeDrop(card({ status: "IN_PROGRESS" }), "NEW", 1)).toEqual(toast("Bu o'tish ijrochiga ruxsat etilmagan"));
  });
  it("a system card may only be started; every other drop is refused", () => {
    const sys = card({ kind: "LESSON_QUESTION" });
    expect(judgeDrop(sys, "IN_PROGRESS", 1)).toEqual({ kind: "confirm" });
    expect(judgeDrop(sys, "DONE", 1)).toEqual(toast("Bu topshiriqni tizim o'zi yopadi"));
    expect(judgeDrop(sys, "IN_REVIEW", 1).kind).toBe("toast");
    expect(judgeDrop(card({ kind: "CALLBACK", status: "IN_PROGRESS" }), "NEW", 1).kind).toBe("toast");
  });
});
