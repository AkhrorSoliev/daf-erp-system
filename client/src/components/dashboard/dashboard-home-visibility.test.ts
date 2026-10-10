import { describe, expect, it } from "vitest";
import { canForRoles } from "@/test-support/server-catalog";
import {
  pickNextLessons,
  resolveHomeSections,
  visibleAttentionRows,
} from "./dashboard-home-visibility";
import type {
  DashboardAttention,
  DashboardNextLesson,
} from "./dashboard-summary-types";

describe("resolveHomeSections", () => {
  it("CEO hamma blokni ko'radi", () => {
    expect(resolveHomeSections(canForRoles([1]))).toEqual({
      money: true,
      people: true,
      attention: true,
      attentionOutreachRows: true,
      nextLessons: true,
      leadFunnel: true,
      leadFunnelDetails: true,
    });
  });

  it("filial direktori ham hamma blokni ko'radi", () => {
    expect(resolveHomeSections(canForRoles([2])).money).toBe(true);
  });

  it("administrator pul bloklarini ko'rmaydi", () => {
    const s = resolveHomeSections(canForRoles([3]));
    expect(s.money).toBe(false);
    expect(s.people).toBe(true);
    expect(s.attentionOutreachRows).toBe(true);
    expect(s.leadFunnel).toBe(true);
    // Lidlar hisoboti administratorga ham ochiq — havola chiqadi.
    expect(s.leadFunnelDetails).toBe(true);
  });

  it("kassir pulni ham outreach qatorlarini ham ko'rmaydi", () => {
    const s = resolveHomeSections(canForRoles([5]));
    expect(s.money).toBe(false);
    expect(s.attentionOutreachRows).toBe(false);
    expect(s.attention).toBe(true);
    expect(s.people).toBe(true);
    expect(s.leadFunnel).toBe(false);
  });

  it("shows the dashboard to every role that has the home panel, and the schedule to a teacher", () => {
    expect(canForRoles([3])("dashboard.view")).toBe(true);
    expect(canForRoles([5])("dashboard.view")).toBe(true);
    expect(canForRoles([4])("dashboard.view")).toBe(false);
    expect(canForRoles([4, 5])("dashboard.view")).toBe(true);
  });
});

const attention: DashboardAttention = {
  todayAbsentees: 3,
  brokenPromises: 0,
  removalQueue: 2,
  topDebtors: [],
};

describe("visibleAttentionRows", () => {
  it("soni nol bo'lgan qatorni tashlab ketadi", () => {
    const rows = visibleAttentionRows(attention, { includeOutreach: true });
    expect(rows.map((r) => r.key)).toEqual(["absentees", "removalQueue"]);
  });

  it("hammasi nol bo'lsa bo'sh massiv qaytaradi", () => {
    const rows = visibleAttentionRows(
      { todayAbsentees: 0, brokenPromises: 0, removalQueue: 0, topDebtors: [] },
      { includeOutreach: true },
    );
    expect(rows).toEqual([]);
  });

  it("outreach ruxsati yo'q bo'lsa bitta ham qator chiqmaydi", () => {
    const rows = visibleAttentionRows(attention, { includeOutreach: false });
    expect(rows).toEqual([]);
  });
});

const lessons: DashboardNextLesson[] = [
  { groupId: "a", groupName: "A1-1", startTime: "09:00", endTime: "10:30", teacherName: "Aziz", roomName: "101", studentCount: 12 },
  { groupId: "b", groupName: "A2-3", startTime: "14:00", endTime: "15:30", teacherName: "Dilnoza", roomName: "102", studentCount: 9 },
  { groupId: "c", groupName: "B1-2", startTime: "16:00", endTime: "17:30", teacherName: null, roomName: null, studentCount: 7 },
];

describe("pickNextLessons", () => {
  it("tugagan darsni tashlab, qolganini vaqt bo'yicha qaytaradi", () => {
    const next = pickNextLessons(lessons, "11:00");
    expect(next.map((l) => l.groupId)).toEqual(["b", "c"]);
  });

  it("davom etayotgan darsni qoldiradi", () => {
    const next = pickNextLessons(lessons, "14:30");
    expect(next[0].groupId).toBe("b");
  });

  it("limitdan ortiqchasini kesadi", () => {
    expect(pickNextLessons(lessons, "00:00", 2)).toHaveLength(2);
  });

  it("kun tugagan bo'lsa bo'sh massiv", () => {
    expect(pickNextLessons(lessons, "23:00")).toEqual([]);
  });

  it("tartibsiz kelgan ro'yxatni ham vaqt bo'yicha saralaydi", () => {
    const shuffled = [lessons[2], lessons[0], lessons[1]];
    expect(pickNextLessons(shuffled, "00:00").map((l) => l.groupId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
