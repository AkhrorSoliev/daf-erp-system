import { describe, expect, it } from "vitest";
import { countLabel, panelView, taskMeta } from "./entity-tasks-panel-rules";

const person = (firstName: string, lastName: string) => ({ id: 1, firstName, lastName, photo: null });

describe("panelView", () => {
  it("asks for everything on the entity only when the server will answer it (CEO, Branch Director)", () => {
    expect(panelView([1])).toBe("all");
    expect(panelView([2])).toBe("all");
    expect(panelView([3, 2])).toBe("all");
  });
  it("asks for the viewer's own tasks otherwise, so the 403 toast never fires", () => {
    expect(panelView([3])).toBe("my");
    expect(panelView([4, 5])).toBe("my");
    expect(panelView([])).toBe("my");
  });
});

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
});

describe("countLabel", () => {
  it("adds a plus when the page was cut short", () => {
    expect(countLabel(20, true)).toBe("20+");
    expect(countLabel(3, false)).toBe("3");
  });
});
