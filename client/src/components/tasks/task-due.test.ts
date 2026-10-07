import { describe, expect, it } from "vitest";
import { dueState, formatDue, groupByDue, tashkentDayAndTime } from "./task-due";
import { tashkentDateTime } from "./task-create-dialog";

const now = new Date("2026-10-07T05:00:00Z"); // 10:00 Tashkent, Wednesday
const card = (id: string, dueAt: string | null, priority = "MEDIUM") => ({ id, dueAt, priority });

describe("dueState", () => {
  it("overdue / today / tomorrow / soon (2-6 days) / later (7+) / none", () => {
    expect(dueState("2026-10-07T04:00:00Z", now)).toBe("overdue");
    expect(dueState("2026-10-07T13:00:00Z", now)).toBe("today");
    expect(dueState("2026-10-08T13:00:00Z", now)).toBe("tomorrow");
    expect(dueState("2026-10-10T13:00:00Z", now)).toBe("soon");
    expect(dueState("2026-10-30T13:00:00Z", now)).toBe("later");
    expect(dueState(null, now)).toBe("none");
  });
  it("«soon» ends at +6 days (the server's `week` filter); +7 is «later»", () => {
    expect(dueState("2026-10-09T13:00:00Z", now)).toBe("soon"); // +2
    expect(dueState("2026-10-13T13:00:00Z", now)).toBe("soon"); // +6
    expect(dueState("2026-10-14T13:00:00Z", now)).toBe("later"); // +7
  });
  it("Tashkent midnight is the day boundary: 23:59:59 is today, 00:00:00 is tomorrow", () => {
    expect(dueState("2026-10-07T18:59:59Z", now)).toBe("today");
    expect(dueState("2026-10-07T19:00:00Z", now)).toBe("tomorrow");
  });
  it("Tashkent midnight also bounds «soon» and «later»", () => {
    expect(dueState("2026-10-13T18:59:59Z", now)).toBe("soon");
    expect(dueState("2026-10-13T19:00:00Z", now)).toBe("later");
  });
});

describe("groupByDue", () => {
  it("orders the groups overdue, today, tomorrow, this week, later, none", () => {
    const g = groupByDue(
      [
        card("a", "2026-10-30T13:00:00Z"),
        card("b", "2026-10-07T04:00:00Z"),
        card("c", "2026-10-07T13:00:00Z", "URGENT"),
        card("d", null),
        card("e", "2026-10-08T13:00:00Z"),
        card("f", "2026-10-10T13:00:00Z"),
      ],
      now,
    );
    expect(g.map((x) => x.key)).toEqual(["overdue", "today", "tomorrow", "soon", "later", "none"]);
    expect(g.map((x) => x.label)).toEqual(["Muddati o'tgan", "Bugun", "Ertaga", "Shu hafta", "Keyinroq", "Muddatsiz"]);
    expect(g[1].items[0].id).toBe("c");
  });
  it("leaves out empty groups", () => {
    const g = groupByDue([card("a", "2026-10-08T13:00:00Z")], now);
    expect(g.map((x) => x.key)).toEqual(["tomorrow"]);
  });
  it("within a group, higher priority first, then the earlier due time", () => {
    const g = groupByDue(
      [
        card("a", "2026-10-07T13:00:00Z", "LOW"),
        card("b", "2026-10-07T14:00:00Z", "URGENT"),
        card("c", "2026-10-07T12:00:00Z", "LOW"),
      ],
      now,
    );
    expect(g[0].items.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  it("does not reorder or mutate the caller's array", () => {
    const input = [card("a", "2026-10-07T14:00:00Z", "LOW"), card("b", "2026-10-07T13:00:00Z", "URGENT")];
    groupByDue(input, now);
    expect(input.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("formatDue", () => {
  it("today → «Bugun 18:00», tomorrow, weekday for this week, dd.MM otherwise", () => {
    expect(formatDue("2026-10-07T13:00:00Z", now)).toBe("Bugun 18:00");
    expect(formatDue("2026-10-08T13:00:00Z", now)).toBe("Ertaga 18:00");
    expect(formatDue("2026-10-10T13:00:00Z", now)).toBe("Sha, 10.10");
    expect(formatDue("2026-10-30T13:00:00Z", now)).toBe("30.10");
  });
  it("uses the weekday up to +6 days and the date from +7, like dueState", () => {
    expect(formatDue("2026-10-13T13:00:00Z", now)).toBe("Se, 13.10");
    expect(formatDue("2026-10-14T13:00:00Z", now)).toBe("14.10");
  });
  it("Tashkent midnight decides «Bugun» / «Ertaga»", () => {
    expect(formatDue("2026-10-07T18:59:59Z", now)).toBe("Bugun 23:59");
    expect(formatDue("2026-10-07T19:00:00Z", now)).toBe("Ertaga 00:00");
  });
});

describe("tashkentDayAndTime", () => {
  it("reads the Tashkent day and time, whatever the machine's zone", () => {
    const { day, time } = tashkentDayAndTime("2026-10-07T13:00:00Z");
    expect([day.getFullYear(), day.getMonth(), day.getDate(), time]).toEqual([2026, 9, 7, "18:00"]);
  });
  it("moves to the next Tashkent day after 19:00 UTC", () => {
    const { day, time } = tashkentDayAndTime("2026-10-07T19:30:00Z");
    expect([day.getDate(), time]).toEqual([8, "00:30"]);
  });
  it("round-trips through tashkentDateTime", () => {
    const iso = "2026-10-12T04:30:00.000Z";
    const { day, time } = tashkentDayAndTime(iso);
    expect(tashkentDateTime(day, time)).toBe(iso);
  });
});
