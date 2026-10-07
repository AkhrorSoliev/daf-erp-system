import { describe, expect, it, vi } from "vitest";
import { assigneeFromUrl } from "./task-all-table-rules";
import { allTabHref, onTimeTile, personLine } from "./task-workload-rules";

// task-all-table-rules pulls in use-tasks, which pulls in the axios instance.
vi.mock("@/lib/api", () => ({ default: {} }));

describe("onTimeTile", () => {
  it("mean of the shares weighted by what each person closed", () => {
    // (10 × 100 + 30 × 50) / 40 = 62.5 → 63
    expect(onTimeTile([{ doneThisMonth: 10, onTimePercent: 100 }, { doneThisMonth: 30, onTimePercent: 50 }])).toBe(63);
  });
  it("leaves out people without a share (nothing closed with a due date)", () => {
    expect(onTimeTile([{ doneThisMonth: 4, onTimePercent: null }, { doneThisMonth: 2, onTimePercent: 50 }])).toBe(50);
  });
  it("null when there is nothing to average", () => {
    expect(onTimeTile([])).toBeNull();
    expect(onTimeTile([{ doneThisMonth: 3, onTimePercent: null }])).toBeNull();
    expect(onTimeTile([{ doneThisMonth: 0, onTimePercent: 100 }])).toBeNull();
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
