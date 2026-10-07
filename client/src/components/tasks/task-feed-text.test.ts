import { describe, expect, it } from "vitest";
import type { TaskEvent } from "@/hooks/use-tasks";
import { describeEvent, viaLabel } from "./task-feed-text";

const aziz = { id: 10001, firstName: "Aziz", lastName: "Karimov", photo: null };
const ev = (over: Partial<TaskEvent>): TaskEvent => ({
  id: "e1", type: "COMMENT", actorId: aziz.id, text: null, meta: null, via: "WEB", createdAt: "2026-10-07T10:00:00Z", actor: aziz, ...over,
});
const line = (over: Partial<TaskEvent>) => { const d = describeEvent(ev(over)); return `${d.actor} ${d.text}`; };

describe("describeEvent", () => {
  it("names the actor, and «Tizim» for a system row", () => {
    expect(line({ type: "CREATED" })).toBe("Aziz Karimov topshiriq berdi");
    expect(line({ type: "CREATED", actorId: null, actor: null, via: "SYSTEM" })).toBe("Tizim topshiriq berdi");
  });

  it("reads a status change from its target", () => {
    expect(line({ type: "STATUS", meta: { from: "NEW", to: "IN_PROGRESS" } })).toBe("Aziz Karimov holatni Jarayonda qildi");
    // A migrated row carries `to` alone.
    expect(line({ type: "STATUS", meta: { to: "DONE" } })).toBe("Aziz Karimov holatni Bajarildi qildi");
  });

  it("does not invent a status when the row has none or an unknown one", () => {
    expect(line({ type: "STATUS", meta: null })).toBe("Aziz Karimov holatni o'zgartirdi");
    expect(line({ type: "STATUS", meta: { to: "ARCHIVED" } })).toBe("Aziz Karimov holatni o'zgartirdi");
  });

  it("quotes the reason of a return and of a cancellation, and copes without one", () => {
    expect(line({ type: "RETURN", text: "Rasm yo'q" })).toBe("Aziz Karimov qaytardi: «Rasm yo'q»");
    expect(line({ type: "RETURN" })).toBe("Aziz Karimov qaytardi");
    expect(line({ type: "CANCELLED", text: "Kerak emas" })).toBe("Aziz Karimov bekor qildi: «Kerak emas»");
    expect(line({ type: "CANCELLED" })).toBe("Aziz Karimov bekor qildi");
  });

  it("describes each step action", () => {
    const step = (meta: Record<string, unknown>) => line({ type: "STEP", meta });
    expect(step({ action: "added", title: "Qo'ng'iroq" })).toBe("Aziz Karimov «Qo'ng'iroq» qadamini qo'shdi");
    expect(step({ action: "done", title: "Qo'ng'iroq" })).toBe("Aziz Karimov «Qo'ng'iroq» qadamini belgiladi");
    expect(step({ action: "undone", title: "Qo'ng'iroq" })).toBe("Aziz Karimov «Qo'ng'iroq» qadamidan belgini oldi");
    expect(step({ action: "deleted", title: "Qo'ng'iroq" })).toBe("Aziz Karimov «Qo'ng'iroq» qadamini o'chirdi");
    expect(step({ action: "renamed", from: "A", to: "B" })).toBe("Aziz Karimov «A» qadamini «B» deb o'zgartirdi");
    expect(step({})).toBe("Aziz Karimov qadamni o'zgartirdi");
  });

  it("says the system closed a task, whoever's answer it was", () => {
    expect(line({ type: "AUTO_CLOSED", meta: { reason: "LESSON_ANSWERED" } })).toBe("Tizim yopdi (darsga javob berildi)");
    expect(line({ type: "AUTO_CLOSED", actorId: null, actor: null, meta: { reason: "GROUP_DELETED" } })).toBe("Tizim yopdi (guruh o'chirildi)");
  });

  it("covers the remaining server types", () => {
    expect(line({ type: "ASSIGNEE", meta: { added: [1], removed: [] } })).toBe("Aziz Karimov ijrochilarni o'zgartirdi");
    expect(line({ type: "REASSIGNED", actorId: null, actor: null, meta: { from: 1, to: [2] } })).toBe("Tizim ishdan ketgani uchun topshiriq o'tkazildi");
  });

  it("falls back to the type name for one it does not know", () => {
    expect(line({ type: "SOMETHING_NEW" })).toBe("Aziz Karimov SOMETHING_NEW");
  });

  it("returns a comment's text untouched", () => {
    expect(describeEvent(ev({ text: "Tayyor" }))).toEqual({ actor: "Aziz Karimov", text: "Tayyor" });
  });
});

describe("viaLabel", () => {
  it("marks Telegram only", () => {
    expect(viaLabel(ev({ via: "TELEGRAM" }))).toBe("Telegram orqali");
    expect(viaLabel(ev({ via: "WEB" }))).toBeNull();
    expect(viaLabel(ev({ via: "SYSTEM" }))).toBeNull();
  });
});
