import { describe, expect, it, vi } from "vitest";
import { assigneeFromUrl } from "./task-all-table-rules";
import { allTabHref, onTimeTile, personLine } from "./task-workload-rules";

// task-all-table-rules pulls in use-tasks, which pulls in the axios instance.
vi.mock("@/lib/api", () => ({ default: {} }));

describe("onTimeTile", () => {
  it("is onTime over withDue, rounded", () => {
    expect(onTimeTile({ onTime: 1, withDue: 2 })).toBe(50);
    expect(onTimeTile({ onTime: 2, withDue: 3 })).toBe(67);
    expect(onTimeTile({ onTime: 0, withDue: 4 })).toBe(0);
  });
  it("counts every task with a due date once, so it is not the mean of people's shares (1 of 1 and 0 of 5 is 17%, not 50%)", () => {
    expect(onTimeTile({ onTime: 1, withDue: 6 })).toBe(17);
  });
  it("is null when nothing closed this month had a due date", () => {
    expect(onTimeTile({ onTime: 0, withDue: 0 })).toBeNull();
  });
});

describe("personLine", () => {
  it("highest role in Uzbek, then the branches", () => {
    expect(personLine({ roleNames: ["Teacher", "Administrator"], branchNames: ["Farg'ona", "Namangan"] })).toBe("Administrator · Farg'ona, Namangan");
    expect(personLine({ roleNames: ["Teacher"], branchNames: ["Farg'ona"] })).toBe("Ustoz · Farg'ona");
  });
  it("skips what is missing, and a role it does not know", () => {
    expect(personLine({ roleNames: [], branchNames: ["Farg'ona"] })).toBe("Farg'ona");
    expect(personLine({ roleNames: ["Cleaner"], branchNames: [] })).toBe("");
  });
});

describe("the row link and the table's read of it", () => {
  it("leads to «Barchasi» with the person, and the table reads the same id back", () => {
    const href = allTabHref(10234);
    expect(href).toBe("/tasks?tab=all&assignee=10234");
    expect(assigneeFromUrl(new URL(href, "http://x").searchParams.get("assignee"))).toEqual([10234]);
  });
});
