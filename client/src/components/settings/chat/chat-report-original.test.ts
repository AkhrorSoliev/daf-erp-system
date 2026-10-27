import { describe, expect, it } from "vitest";
import { snapshotLines } from "./chat-report-rules";
import type { ChatReportDetail } from "./chat-admin-types";

const person = (id: number) => ({ id, name: `P${id}`, username: null, chatBannedAt: null });
const report = (snapshot: ChatReportDetail["snapshot"]) =>
  ({ reporter: person(1), reported: person(2), snapshot }) as unknown as ChatReportDetail;
const base = {
  id: "m",
  senderId: 2,
  kind: "TEXT" as const,
  hasFile: false,
  deleted: false,
  createdAt: "2026-10-27T10:00:00.000Z",
};

describe("snapshotLines: the first text of an edited message", () => {
  it("carries originalText so the CEO sees what was written first", () => {
    const [line] = snapshotLines(report([{ ...base, text: "kechirasiz", originalText: "haqorat" }]));
    expect(line.text).toBe("kechirasiz");
    expect(line.originalText).toBe("haqorat");
  });
  it("is null for a message that was never edited", () => {
    const [line] = snapshotLines(report([{ ...base, text: "salom" }]));
    expect(line.originalText).toBeNull();
  });
  it("is null for a file, which cannot be edited", () => {
    const [line] = snapshotLines(report([{ ...base, kind: "IMAGE", text: null, hasFile: true }]));
    expect(line.originalText).toBeNull();
  });
});
