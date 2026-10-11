import { describe, expect, it } from "vitest";
import type { TaskSource } from "@/hooks/use-tasks";
import { formatPrice } from "@/lib/format-utils";
import { makeCan } from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";
import { CALL_ACTION, LEAD_ACTION, sourceAction, sourceFacts } from "./task-source-rules";

const call = { at: "2026-10-09T06:30:00.000Z", outcome: "NO_ANSWER" as const, note: null, by: "Karimova Dilnoza" };
const student: TaskSource = {
  student: { id: 10001, name: "Rahimov Aziz", phone: "901234567", debt: 450000, lastCall: call },
  promise: { date: "2026-10-09T18:59:59.999Z", amount: 200000, comment: "Oylik kelganda" },
  callReason: "DEBT",
};
const lead: TaskSource = {
  lead: { id: "l1", name: "Karimova Dilnoza", phone: "931112233", source: "Instagram", createdAt: "2026-10-08T05:15:00.000Z" },
};
const open = { status: "NEW" as const };
const all = makeCan(new Set<PermissionKey>(["calls.log", "leads.view"]));
const none = makeCan(new Set<PermissionKey>());

describe("sourceAction — one button that does the job", () => {
  it("a student task opens the call dialog for that student, with the reason", () => {
    expect(sourceAction(open, student, all)).toEqual({
      kind: "call",
      label: CALL_ACTION,
      prefill: { studentId: 10001, studentLabel: "Rahimov Aziz", studentPhone: "901234567", reason: "DEBT" },
    });
  });
  it("a callback with no reason logs as «Boshqa»", () => {
    const s: TaskSource = { student: student.student };
    expect(sourceAction(open, s, all)).toMatchObject({ prefill: { reason: "OTHER" } });
  });
  it("a lead task opens the lead's drawer", () => {
    expect(sourceAction(open, lead, all)).toEqual({ kind: "lead", label: LEAD_ACTION, href: "/leads?lead=l1" });
  });
  it("no button without the right, on a closed task, or with no source", () => {
    expect(sourceAction(open, student, none)).toBeNull();
    expect(sourceAction(open, lead, none)).toBeNull();
    expect(sourceAction({ status: "DONE" }, student, all)).toBeNull();
    expect(sourceAction(open, null, all)).toBeNull();
  });
});

describe("sourceFacts — the card's rows on the Tashkent clock", () => {
  it("a broken promise: student, phone, debt, promise, last call", () => {
    expect(sourceFacts(student)).toEqual([
      { label: "O'quvchi", value: "Rahimov Aziz" },
      { label: "Telefon", value: "+998 90 123 45 67" },
      { label: "Qarz", value: `${formatPrice(450000)} so'm` },
      { label: "Va'da", value: `09.10 gacha · ${formatPrice(200000)} so'm` },
      { label: "Va'da izohi", value: "Oylik kelganda" },
      { label: "Oxirgi qo'ng'iroq", value: "09.10, 11:30 · Javob bermadi · Karimova Dilnoza" },
    ]);
  });
  it("a callback names the call that asked for it; no debt and no call say so", () => {
    const s: TaskSource = {
      student: { id: 1, name: "A B", phone: null, debt: 0, lastCall: null },
      previousCall: { ...call, note: "Ertaga qayta" },
    };
    expect(sourceFacts(s)).toEqual([
      { label: "O'quvchi", value: "A B" },
      { label: "Telefon", value: "—" },
      { label: "Qarz", value: "Qarz yo'q" },
      { label: "Qayta qo'ng'iroq so'ralgan", value: "09.10, 11:30 · Javob bermadi · Karimova Dilnoza — «Ertaga qayta»" },
      { label: "Oxirgi qo'ng'iroq", value: "Qo'ng'iroq qilinmagan" },
    ]);
  });
  it("a lead: name, phone, source, when it came", () => {
    expect(sourceFacts(lead)).toEqual([
      { label: "Lid", value: "Karimova Dilnoza" },
      { label: "Telefon", value: "+998 93 111 22 33" },
      { label: "Manba", value: "Instagram" },
      { label: "Kelgan", value: "08.10, 10:15" },
    ]);
  });
});
