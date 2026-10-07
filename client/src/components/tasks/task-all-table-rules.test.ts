import { describe, expect, it, vi } from "vitest";
import type { TaskCard, TaskPerson } from "@/hooks/use-tasks";
import { allParams, allTiles, assigneeFromUrl, assigneeLabel, branchLabel, statusesToAsk, topicLine, withSelected, type AllQuery } from "./task-all-table-rules";

// use-tasks pulls in the axios instance; nothing here calls it.
vi.mock("@/lib/api", () => ({ default: {} }));

const person = (id: number, firstName: string, lastName = "X"): TaskPerson => ({ id, firstName, lastName, photo: null });
const card = (over: Partial<TaskCard> = {}): TaskCard => ({
  id: "t", kind: "MANUAL", title: "t", status: "NEW", priority: "MEDIUM", dueAt: null, branchId: null,
  entityType: null, entityId: null, requiresPhoto: false, batchId: null, claimedById: null,
  returnedCount: 0, closedAt: null, createdAt: "2026-10-01T00:00:00Z", author: null,
  assignees: [], watchers: [], stepsTotal: 0, stepsDone: 0, eventsCount: 0, unmarkedLesson: null, ...over,
});
const query = (over: Partial<AllQuery> = {}): AllQuery => ({ filters: {}, statuses: [], showClosed: false, ...over });

describe("statusesToAsk", () => {
  it("defaults to the three open statuses", () => {
    expect(statusesToAsk(query())).toEqual(["NEW", "IN_PROGRESS", "IN_REVIEW"]);
  });
  it("«Yopilganlar» adds DONE and CANCELLED", () => {
    expect(statusesToAsk(query({ showClosed: true }))).toEqual(["NEW", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]);
  });
  it("a pick in «Holat» wins over the toggle", () => {
    expect(statusesToAsk(query({ statuses: ["DONE"], showClosed: false }))).toEqual(["DONE"]);
    expect(statusesToAsk(query({ statuses: ["IN_REVIEW"], showClosed: true }))).toEqual(["IN_REVIEW"]);
  });
});

describe("allParams", () => {
  it("open set: no closedDays, filters sent the way the board sends them", () => {
    const p = allParams(query({ filters: { assigneeId: [7, 9], branchId: [1], q: "" } }));
    expect(p).toMatchObject({ view: "all", limit: 50, status: "NEW,IN_PROGRESS,IN_REVIEW", assigneeId: "7,9", branchId: "1" });
    expect(p.closedDays).toBeUndefined();
    expect(p.q).toBeUndefined();
    expect(p.cursor).toBeUndefined();
  });
  it("closedDays=30 whenever DONE is asked for, and only then", () => {
    expect(allParams(query({ showClosed: true })).closedDays).toBe(30);
    expect(allParams(query({ statuses: ["DONE"] })).closedDays).toBe(30);
    expect(allParams(query({ statuses: ["CANCELLED"] })).closedDays).toBeUndefined();
  });
  it("passes the cursor on", () => {
    expect(allParams(query(), "abc").cursor).toBe("abc");
  });
});

describe("assigneeFromUrl", () => {
  it("reads one id or a comma list", () => {
    expect(assigneeFromUrl("10234")).toEqual([10234]);
    expect(assigneeFromUrl("1, 2")).toEqual([1, 2]);
  });
  it("ignores junk, zero and an absent param", () => {
    expect(assigneeFromUrl(null)).toBeUndefined();
    expect(assigneeFromUrl("")).toBeUndefined();
    expect(assigneeFromUrl("abc,-3,0,1.5")).toBeUndefined();
    expect(assigneeFromUrl("abc,5")).toEqual([5]);
  });
});

describe("allTiles", () => {
  const now = new Date("2026-10-07T05:00:00Z"); // 10:00 Tashkent
  const rows = [
    card({ id: "a", status: "NEW", dueAt: "2026-10-06T10:00:00Z" }), // overdue
    card({ id: "b", status: "IN_REVIEW", dueAt: "2026-10-06T10:00:00Z" }), // overdue + review
    card({ id: "c", status: "IN_PROGRESS", dueAt: "2026-10-09T10:00:00Z" }),
    card({ id: "d", status: "DONE", dueAt: "2026-10-01T10:00:00Z", closedAt: "2026-10-07T01:00:00Z" }), // closed today (06:00 Tashkent)
    card({ id: "e", status: "DONE", closedAt: "2026-10-06T18:59:00Z" }), // 23:59 Tashkent yesterday
    card({ id: "f", status: "CANCELLED", dueAt: "2026-10-01T10:00:00Z" }),
  ];
  it("counts open, overdue and in-review from the open rows only", () => {
    expect(allTiles(rows, now, true)).toMatchObject({ open: 3, overdue: 2, review: 1 });
  });
  it("closed today follows the Tashkent day", () => {
    expect(allTiles(rows, now, true).closedToday).toBe(1);
    // 19:00Z is already tomorrow in Tashkent, 18:59Z still yesterday
    expect(allTiles([card({ status: "DONE", closedAt: "2026-10-06T19:00:00Z" })], now, true).closedToday).toBe(1);
    expect(allTiles([card({ status: "DONE", closedAt: "2026-10-06T18:59:59Z" })], now, true).closedToday).toBe(0);
  });
  it("closed today is unknown (null) while no closed task is asked for", () => {
    expect(allTiles(rows.slice(0, 3), now, false).closedToday).toBeNull();
  });
  it("an empty list is all zeros", () => {
    expect(allTiles([], now, true)).toEqual({ open: 0, overdue: 0, review: 0, closedToday: 0 });
  });
});

describe("assigneeLabel", () => {
  it("names, shortened after two", () => {
    expect(assigneeLabel({ assignees: [person(1, "Ali", "Valiyev")], batch: undefined })).toBe("Ali Valiyev");
    expect(assigneeLabel({ assignees: [person(1, "A"), person(2, "B")], batch: undefined })).toBe("A X, B X");
    expect(assigneeLabel({ assignees: [person(1, "A"), person(2, "B"), person(3, "C"), person(4, "D")], batch: undefined })).toBe("A X, B X +2");
    expect(assigneeLabel({ assignees: [], batch: undefined })).toBe("—");
  });
  it("a batch reads «N xodim · k/N bajardi»", () => {
    expect(assigneeLabel({ assignees: [], batch: { total: 5, done: 2, statuses: [] } })).toBe("5 xodim · 2/5 bajardi");
  });
});

describe("withSelected", () => {
  it("adds a picked id the list does not hold, leaves the rest alone", () => {
    const options = [{ value: "1", label: "Ali" }];
    expect(withSelected(options, ["1"])).toEqual(options);
    expect(withSelected(options, ["1", "9"])).toEqual([...options, { value: "9", label: "Xodim 9" }]);
  });
});

describe("topicLine / branchLabel", () => {
  it("system kind and entity, in Uzbek, skipping what is empty or unknown", () => {
    expect(topicLine({ kind: "LESSON_QUESTION", entityType: "Group" })).toBe("Dars bo'ldimi? · Guruh");
    expect(topicLine({ kind: "MANUAL", entityType: "Student" })).toBe("O'quvchi");
    expect(topicLine({ kind: "MANUAL", entityType: null })).toBe("");
    expect(topicLine({ kind: "MANUAL", entityType: "Whatever" })).toBe("");
  });
  it("branch name from the switcher list, «—» when unknown", () => {
    const branches = [{ id: 1, name: "Farg'ona" }];
    expect(branchLabel(1, branches)).toBe("Farg'ona");
    expect(branchLabel(2, branches)).toBe("—");
    expect(branchLabel(null, branches)).toBe("—");
  });
});
