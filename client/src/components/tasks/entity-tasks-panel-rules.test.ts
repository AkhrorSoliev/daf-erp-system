import { describe, expect, it } from "vitest";
import { countLabel, taskMeta } from "./entity-tasks-panel-rules";

const person = (firstName: string, lastName: string) => ({ id: 1, firstName, lastName, photo: null });

describe("taskMeta", () => {
  it("names the assignees by first name and the initial of the last", () => {
    expect(taskMeta({ kind: "MANUAL", assignees: [person("Ali", "Valiyev"), person("Vali", "Karimov")] })).toBe("Ali V., Vali K.");
  });
  it("says «Tizim» first for a task the system made", () => {
    expect(taskMeta({ kind: "CALLBACK", assignees: [person("Ali", "Valiyev")] })).toBe("Tizim · Ali V.");
    expect(taskMeta({ kind: "LESSON_QUESTION", assignees: [] })).toBe("Tizim");
  });
  it("is empty for a manual task nobody holds", () => {
    expect(taskMeta({ kind: "MANUAL", assignees: [] })).toBe("");
  });
  it("ends with how many separate copies are done, when the card stands for a batch", () => {
    const batch = { total: 3, done: 1, statuses: [] };
    expect(taskMeta({ kind: "MANUAL", assignees: [person("Ali", "Valiyev"), person("Vali", "Karimov")], batch })).toBe("Ali V., Vali K. · 1/3 bajardi");
    expect(taskMeta({ kind: "MANUAL", assignees: [], batch })).toBe("1/3 bajardi");
  });
});

describe("countLabel", () => {
  it("adds a plus when the page was cut short", () => {
    expect(countLabel(20, true)).toBe("20+");
    expect(countLabel(3, false)).toBe("3");
  });
});
