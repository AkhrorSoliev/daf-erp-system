import { describe, expect, it } from "vitest";
import { dueState, formatDue, groupByDue } from "./task-due";
const now = new Date("2026-10-07T05:00:00Z"); // 10:00 Tashkent, Wednesday
const card = (id: string, dueAt: string | null, priority = "MEDIUM", status = "NEW") => ({ id, dueAt, priority, status }) as any;
describe("dueState", () => {
  it("overdue / today / soon (≤7 days) / later / none", () => {
    expect(dueState("2026-10-07T04:00:00Z", now)).toBe("overdue");
    expect(dueState("2026-10-07T13:00:00Z", now)).toBe("today");
    expect(dueState("2026-10-10T13:00:00Z", now)).toBe("soon");
    expect(dueState("2026-10-30T13:00:00Z", now)).toBe("later");
    expect(dueState(null, now)).toBe("none");
  });
  it("Tashkent day decides «today»: 23:30 Tashkent is still today", () => {
    expect(dueState("2026-10-07T18:30:00Z", now)).toBe("today");
  });
});
describe("groupByDue", () => {
  it("orders groups and puts review first within none", () => {
    const g = groupByDue([card("a", "2026-10-30T13:00:00Z"), card("b", "2026-10-07T04:00:00Z"), card("c", "2026-10-07T13:00:00Z", "URGENT"), card("d", null)], now);
    expect(g.map((x) => x.key)).toEqual(["overdue", "today", "later", "none"]);
    expect(g[1].items[0].id).toBe("c");
  });
  it("within a group, higher priority first", () => {
    const g = groupByDue([card("a", "2026-10-07T13:00:00Z", "LOW"), card("b", "2026-10-07T14:00:00Z", "URGENT")], now);
    expect(g[0].items.map((x: any) => x.id)).toEqual(["b", "a"]);
  });
});
describe("formatDue", () => {
  it("today → «Bugun 18:00», tomorrow, weekday for this week, dd.MM otherwise", () => {
    expect(formatDue("2026-10-07T13:00:00Z", now)).toBe("Bugun 18:00");
    expect(formatDue("2026-10-08T13:00:00Z", now)).toBe("Ertaga 18:00");
    expect(formatDue("2026-10-10T13:00:00Z", now)).toBe("Sha, 10.10");
    expect(formatDue("2026-10-30T13:00:00Z", now)).toBe("30.10");
  });
});
