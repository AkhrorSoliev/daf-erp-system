import { describe, expect, it } from "vitest";
import { canApprove, decidedLine, initialGroupId, joinRequestNotes, type JoinRequestView } from "./join-request-rules";

const VIEW: JoinRequestView = {
  id: "r1", status: "PENDING", createdAt: "2026-10-10T09:02:00.000Z", decidedAt: null, rejectReason: null,
  firstName: "Dilnoza", lastName: "Aliyeva", phone: "901234567", photo: null, telegramUsername: "dilnoza_a",
  requestedGroup: { id: "g1", name: "A1-07" }, approvedGroup: null, studentId: null, decidedBy: null,
  groups: [{ id: "g1", name: "A1-07", teacherName: "Madina Karimova" }, { id: "g2", name: "A1-09", teacherName: null }],
  sameNameGroupIds: [], lead: null, archivedStudentId: null,
};

describe("join request rules", () => {
  it("starts on the requested group while it takes students", () => {
    expect(initialGroupId(VIEW)).toBe("g1");
    expect(initialGroupId({ ...VIEW, groups: [VIEW.groups[1]] })).toBeNull();
  });

  it("approves only a pending request into a listed group", () => {
    expect(canApprove(VIEW, "g2")).toBe(true);
    expect(canApprove(VIEW, null)).toBe(false);
    expect(canApprove(VIEW, "g9")).toBe(false);
    expect(canApprove({ ...VIEW, status: "REJECTED" }, "g1")).toBe(false);
  });

  it("has no notes for a clean request", () => {
    expect(joinRequestNotes(VIEW, "g1", null)).toEqual([]);
  });

  it("names the lead, the archived card and the same name in the chosen group", () => {
    const v: JoinRequestView = {
      ...VIEW,
      lead: { createdAt: "2026-10-03T07:00:00.000Z", status: "CONTACTED", archived: false, sourceName: "Instagram forma" },
      archivedStudentId: 10942,
      sameNameGroupIds: ["g2"],
    };
    expect(joinRequestNotes(v, "g1", "Aloqaga chiqilgan")).toEqual([
      { tone: "info", text: "Lid: 03.10.2026 · Instagram forma · Aloqaga chiqilgan" },
      { tone: "warning", text: "Bu raqam arxivdagi #10942 o'quvchiniki — uni tiklash to'g'riroq bo'lishi mumkin" },
    ]);
    expect(joinRequestNotes(v, "g2", "Aloqaga chiqilgan")).toContainEqual({ tone: "warning", text: "Guruhda shu ismli o'quvchi bor" });
  });

  it("marks an archived lead and a lead with no source", () => {
    const v: JoinRequestView = { ...VIEW, lead: { createdAt: "2026-10-03T07:00:00.000Z", status: "LOST", archived: true, sourceName: null } };
    expect(joinRequestNotes(v, "g1", "Yo'qotilgan")[0].text).toBe("Lid: 03.10.2026 · manbasiz · Yo'qotilgan (arxivda)");
  });

  it("says when the requested group no longer takes students", () => {
    const v = { ...VIEW, groups: [VIEW.groups[1]] };
    expect(joinRequestNotes(v, null, null)).toEqual([
      { tone: "error", text: "«A1-07» guruhiga yozilib bo'lmaydi — boshqa guruhni tanlang" },
    ]);
  });

  it("reads a decided request as one line", () => {
    expect(decidedLine(VIEW)).toBeNull();
    expect(decidedLine({
      ...VIEW, status: "APPROVED", studentId: 11345, decidedAt: "2026-10-10T09:05:00.000Z",
      decidedBy: { id: 10002, firstName: "Bobur", lastName: "Aliyev" },
    })).toBe("Tasdiqlandi — #11345 (Bobur A., 10.10.2026)");
    expect(decidedLine({ ...VIEW, status: "REJECTED", rejectReason: "begona odam" })).toBe("Rad etildi: begona odam");
    expect(decidedLine({ ...VIEW, status: "EXPIRED" })).toBe("Muddati o'tdi — 7 kun ichida javob berilmadi");
    expect(decidedLine({ ...VIEW, status: "REPLACED" })).toBe("Yangi so'rov bilan almashtirildi");
  });
});
