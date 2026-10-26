import { describe, expect, it } from "vitest";
import type { ChatReportDetail, ChatReportRow } from "./chat-admin-types";
import { canResolve, formatReportDate, resolveBody, snapshotLines, statusFilterToParam, statusLabel } from "./chat-report-rules";

const t = (s: string) => `T:${s}`;
const person = (id: number) => ({ id, name: `P${id}`, username: null, chatBannedAt: null });
const report = (snapshot: ChatReportDetail["snapshot"]): ChatReportDetail => ({
  id: "r1", status: "OPEN", reason: "x", createdAt: "2026-10-26T10:00:00.000Z", conversationId: "c",
  reporter: person(1), reported: person(2), resolvedAt: null, resolutionNote: null, snapshot,
});
const msgOf = (over: Partial<ChatReportDetail["snapshot"][number]>) => ({
  id: "m", senderId: 1, kind: "TEXT" as const, text: "hi", hasFile: false, deleted: false, createdAt: "2026-10-26T10:00:00.000Z", ...over,
});

describe("statusLabel", () => {
  it("names every status through t", () => {
    expect(statusLabel("OPEN", t)).toBe("T:Ochiq");
    expect(statusLabel("RESOLVED", t)).toBe("T:Hal qilindi");
    expect(statusLabel("DISMISSED", t)).toBe("T:Rad etildi");
  });
});

describe("snapshotLines", () => {
  it("sets the side by sender and keeps the order", () => {
    const lines = snapshotLines(report([msgOf({ id: "a", senderId: 2 }), msgOf({ id: "b", senderId: 1 }), msgOf({ id: "c", senderId: 99 })]));
    expect(lines.map((l) => [l.id, l.side])).toEqual([["a", "reported"], ["b", "reporter"], ["c", "other"]]);
  });
  it("keeps TEXT unchanged (no html handling)", () => {
    expect(snapshotLines(report([msgOf({ text: "<b>x</b>" })]))[0].text).toBe("<b>x</b>");
  });
  it("gives IMAGE and VOICE no text but keeps the kind and hasFile", () => {
    const [img, voice] = snapshotLines(report([msgOf({ kind: "IMAGE", text: "ignored", hasFile: true }), msgOf({ kind: "VOICE", text: null })]));
    expect(img).toMatchObject({ kind: "IMAGE", text: null, hasFile: true });
    expect(voice).toMatchObject({ kind: "VOICE", text: null });
  });
  it("carries deleted and createdAt", () => {
    expect(snapshotLines(report([msgOf({ deleted: true })]))[0]).toMatchObject({ deleted: true, createdAt: "2026-10-26T10:00:00.000Z" });
  });
  it("a TEXT message without text becomes empty text", () => {
    expect(snapshotLines(report([msgOf({ text: null })]))[0].text).toBe("");
  });
});

describe("canResolve", () => {
  it.each([["OPEN", true], ["RESOLVED", false], ["DISMISSED", false]] as const)("%s -> %s", (status, ok) => {
    expect(canResolve({ status } as ChatReportRow)).toBe(ok);
  });
});

describe("resolveBody", () => {
  it("trims the note and omits an empty one", () => {
    expect(resolveBody("DISMISSED", "  ok  ", false)).toEqual({ outcome: "DISMISSED", note: "ok" });
    expect(resolveBody("DISMISSED", "   ", false)).toEqual({ outcome: "DISMISSED" });
  });
  it("bans only when asked and RESOLVED", () => {
    expect(resolveBody("RESOLVED", "", true)).toEqual({ outcome: "RESOLVED", banReported: true });
    expect(resolveBody("RESOLVED", "", false)).toEqual({ outcome: "RESOLVED" });
    expect(resolveBody("DISMISSED", "", true)).toEqual({ outcome: "DISMISSED" });
  });
});

describe("statusFilterToParam", () => {
  it.each([
    [undefined, "OPEN"], ["", "OPEN"], ["ochiq", "OPEN"], ["hal-qilingan", "RESOLVED"],
    ["rad-etilgan", "DISMISSED"], ["hammasi", undefined], ["zzz", "OPEN"],
  ] as const)("%s -> %s", (holat, param) => {
    expect(statusFilterToParam(holat)).toBe(param);
  });
});

describe("formatReportDate", () => {
  it("uses the Tashkent clock", () => {
    expect(formatReportDate("2026-10-26T20:30:00.000Z")).toBe("27.10.2026, 01:30");
  });
});
