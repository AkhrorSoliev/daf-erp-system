import { describe, expect, it } from "vitest";
import type { TaskDetail, TaskPerson, TaskStatus } from "@/hooks/use-tasks";
import { footerActions, WAITING_LABEL, type FooterActions } from "./task-drawer-footer-rules";

const person = (id: number): TaskPerson => ({ id, firstName: "A", lastName: "B", photo: null });
const ME = 7;
const OTHER = 8;
const THIRD = 9;

const task = (status: TaskStatus, over: { kind?: TaskDetail["kind"]; author?: number | null; assignees?: number[] } = {}) => ({
  kind: over.kind ?? ("MANUAL" as const),
  status,
  author: over.author === null ? null : person(over.author ?? OTHER),
  assignees: (over.assignees ?? [ME]).map(person),
});
// The three roles a viewer can hold: what the server's `resolveAccess` yields for each.
const assignee = { isAssignee: true, canManage: false };
const manager = { isAssignee: false, canManage: true };
const managerAssignee = { isAssignee: true, canManage: true };
const watcher = { isAssignee: false, canManage: false };

const NOTHING: FooterActions = { start: false, done: null, accept: false, return: false, label: null };
const only = (over: Partial<FooterActions>): FooterActions => ({ ...NOTHING, ...over });

describe("footerActions: an assignee", () => {
  it.each<[TaskStatus, FooterActions]>([
    ["NEW", only({ start: true, done: { target: "IN_REVIEW" } })],
    ["IN_PROGRESS", only({ done: { target: "IN_REVIEW" } })],
    ["IN_REVIEW", only({ label: WAITING_LABEL })],
    ["DONE", NOTHING],
    ["CANCELLED", NOTHING],
  ])("on a task in %s", (status, expected) => {
    expect(footerActions(task(status), assignee, ME)).toEqual(expected);
  });
});

describe("footerActions: the author's own task (the only assignee is the author)", () => {
  const own = (status: TaskStatus) => footerActions(task(status, { author: ME, assignees: [ME] }), managerAssignee, ME);

  it("finishes straight to DONE, with no review step", () => {
    expect(own("NEW")).toEqual(only({ start: true, done: { target: "DONE" } }));
    expect(own("IN_PROGRESS")).toEqual(only({ done: { target: "DONE" } }));
  });

  it("is closed like any other task", () => {
    expect(own("DONE")).toEqual(NOTHING);
    expect(own("CANCELLED")).toEqual(NOTHING);
  });

  it("is not «own» once someone else is on it, or when the viewer is not the author", () => {
    expect(footerActions(task("NEW", { author: ME, assignees: [ME, THIRD] }), managerAssignee, ME).done).toEqual({ target: "IN_REVIEW" });
    expect(footerActions(task("NEW", { author: OTHER, assignees: [ME] }), assignee, ME).done).toEqual({ target: "IN_REVIEW" });
    // A system task has no author at all.
    expect(footerActions(task("NEW", { author: null, assignees: [ME] }), assignee, ME).done).toEqual({ target: "IN_REVIEW" });
  });

  it("does not guess when the viewer is not known yet", () => {
    expect(footerActions(task("NEW", { author: ME, assignees: [ME] }), managerAssignee, undefined).done).toEqual({ target: "IN_REVIEW" });
  });
});

describe("footerActions: a manager who is not an assignee", () => {
  it("has no status button at all: the server answers 400 to a plain status change", () => {
    expect(footerActions(task("NEW"), manager, OTHER)).toEqual(NOTHING);
    expect(footerActions(task("IN_PROGRESS"), manager, OTHER)).toEqual(NOTHING);
  });

  it("reviews a task that is in IN_REVIEW: accept and return, no waiting line", () => {
    expect(footerActions(task("IN_REVIEW"), manager, OTHER)).toEqual(only({ accept: true, return: true }));
  });

  it("has nothing to do with a closed task", () => {
    expect(footerActions(task("DONE"), manager, OTHER)).toEqual(NOTHING);
    expect(footerActions(task("CANCELLED"), manager, OTHER)).toEqual(NOTHING);
  });
});

describe("footerActions: a manager who is also an assignee (not the only one)", () => {
  const both = (status: TaskStatus) => footerActions(task(status, { author: OTHER, assignees: [ME, THIRD] }), managerAssignee, ME);

  it("works the task like an assignee while it is open", () => {
    expect(both("NEW")).toEqual(only({ start: true, done: { target: "IN_REVIEW" } }));
    expect(both("IN_PROGRESS")).toEqual(only({ done: { target: "IN_REVIEW" } }));
  });

  it("reviews at IN_REVIEW instead of waiting", () => {
    expect(both("IN_REVIEW")).toEqual(only({ accept: true, return: true }));
  });
});

describe("footerActions: a watcher", () => {
  it.each<TaskStatus>(["NEW", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"])("gets nothing in %s", (status) => {
    expect(footerActions(task(status), watcher, THIRD)).toEqual(NOTHING);
  });
});

describe("footerActions: a system task", () => {
  const system = (status: TaskStatus) => task(status, { kind: "LESSON_QUESTION", author: null });

  it("lets its assignee start it, and nothing else, because it closes itself", () => {
    expect(footerActions(system("NEW"), assignee, ME)).toEqual(only({ start: true }));
    expect(footerActions(system("IN_PROGRESS"), assignee, ME)).toEqual(NOTHING);
  });

  it("never offers a finish, a review or a waiting line", () => {
    expect(footerActions(system("IN_REVIEW"), assignee, ME)).toEqual(NOTHING);
    expect(footerActions(system("IN_REVIEW"), manager, OTHER)).toEqual(NOTHING);
    expect(footerActions(system("NEW"), manager, OTHER)).toEqual(NOTHING);
    expect(footerActions(system("NEW"), managerAssignee, ME)).toEqual(only({ start: true }));
  });

  it("gives nothing once closed", () => {
    expect(footerActions(system("DONE"), assignee, ME)).toEqual(NOTHING);
    expect(footerActions(system("CANCELLED"), assignee, ME)).toEqual(NOTHING);
  });

  it("applies to every system kind", () => {
    for (const kind of ["CALLBACK", "BROKEN_PROMISE", "UNCALLED_LEAD"] as const) {
      expect(footerActions(task("NEW", { kind, author: null }), assignee, ME)).toEqual(only({ start: true }));
    }
  });
});
