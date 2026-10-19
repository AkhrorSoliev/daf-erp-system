import { describe, expect, it } from "vitest";
import { interpolate, type Params } from "@/i18n/translate";
import type { TaskRecurrenceView } from "@/hooks/use-tasks";
import { EMPTY_RECURRENCE, changes, dayMonth, formFromRule, recurrenceBadge, recurrenceFormReady, recurrenceLine, recurrencePayload } from "./task-recurrence-rules";

describe("recurrenceBadge", () => {
  it("reads like the mock-up", () => {
    expect(recurrenceBadge({ freq: "DAILY", weekdays: [], dayOfMonth: null })).toBe("Har kuni");
    expect(recurrenceBadge({ freq: "WEEKLY", weekdays: [1], dayOfMonth: null })).toBe("Har dushanba");
    expect(recurrenceBadge({ freq: "WEEKLY", weekdays: [4, 1], dayOfMonth: null })).toBe("Har dushanba va payshanba");
    expect(recurrenceBadge({ freq: "WEEKLY", weekdays: [1, 3, 5], dayOfMonth: null })).toBe("Har hafta: Du, Cho, Ju");
    expect(recurrenceBadge({ freq: "MONTHLY", weekdays: [], dayOfMonth: 5 })).toBe("Har oyning 5-sanasi");
  });
  it("the sheet line adds the time", () => {
    expect(recurrenceLine({ freq: "WEEKLY", weekdays: [1], dayOfMonth: null, dueTime: "10:00" })).toBe("Har dushanba, 10:00");
  });
  it("draws every word through the page's t", () => {
    const t = (s: string, p?: Params) => `<${interpolate(s, p)}>`;
    expect(recurrenceBadge({ freq: "WEEKLY", weekdays: [4, 1], dayOfMonth: null }, t)).toBe("<Har <dushanba> va <payshanba>>");
    expect(recurrenceLine({ freq: "MONTHLY", weekdays: [], dayOfMonth: 5, dueTime: "09:00" }, t)).toBe("<Har oyning 5-sanasi>, 09:00");
  });
});

describe("recurrencePayload", () => {
  it("none → no recurrence (a one-off task)", () => {
    expect(recurrencePayload(EMPTY_RECURRENCE)).toBeUndefined();
  });
  it("sends only what the frequency uses, days in order", () => {
    expect(recurrencePayload({ freq: "DAILY", weekdays: [2], dayOfMonth: 9, time: "09:30" })).toEqual({ freq: "DAILY", dueTime: "09:30" });
    expect(recurrencePayload({ freq: "WEEKLY", weekdays: [5, 1], dayOfMonth: 1, time: "10:00" })).toEqual({ freq: "WEEKLY", weekdays: [1, 5], dueTime: "10:00" });
    expect(recurrencePayload({ freq: "MONTHLY", weekdays: [1], dayOfMonth: 28, time: "" })).toEqual({ freq: "MONTHLY", dayOfMonth: 28, dueTime: "18:00" });
  });
  it("a weekly rule needs at least one day", () => {
    expect(recurrenceFormReady({ ...EMPTY_RECURRENCE, freq: "WEEKLY", weekdays: [] })).toBe(false);
    expect(recurrenceFormReady({ ...EMPTY_RECURRENCE, freq: "WEEKLY", weekdays: [2] })).toBe(true);
    expect(recurrenceFormReady(EMPTY_RECURRENCE)).toBe(true);
  });
});

describe("formFromRule / dayMonth", () => {
  it("fills the editor from a stored rule", () => {
    expect(formFromRule({ freq: "MONTHLY", weekdays: [], dayOfMonth: 5, dueTime: "09:00" })).toEqual({ freq: "MONTHLY", weekdays: [1], dayOfMonth: 5, time: "09:00" });
  });
  it("shows a stored day as dd.mm", () => {
    expect(dayMonth("2026-10-19")).toBe("19.10");
  });
});

describe("changes", () => {
  const person = (id: number) => ({ id, name: `U${id}` });
  const rule = {
    id: "r1", freq: "WEEKLY", weekdays: [1, 3], dayOfMonth: null, dueTime: "10:00", title: "T", active: true,
    separateCopies: false, nextRunDate: "2026-10-12", author: person(1), assignees: [person(20), person(21)], canManage: true,
  } as unknown as TaskRecurrenceView;
  const same = formFromRule(rule);

  it("nothing changed sends nothing", () => {
    expect(changes(rule, same, [21, 20])).toEqual({});
  });
  it("a schedule change sends only the schedule", () => {
    expect(changes(rule, { ...same, time: "11:00" }, [20, 21])).toEqual({ schedule: { freq: "WEEKLY", weekdays: [1, 3], dueTime: "11:00" } });
  });
  it("an assignee change sends only the assignees", () => {
    expect(changes(rule, same, [20])).toEqual({ assigneeIds: [20] });
  });
});
