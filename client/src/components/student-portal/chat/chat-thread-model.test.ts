import { describe, expect, it } from "vitest";
import {
  addPending,
  lastPeerMessageId,
  mergePending,
  removePending,
  setPendingStatus,
  threadMessages,
} from "./chat-thread-model";
import type { MessageView, MessagesPage } from "./chat-types";

const msg = (id: string, mine: boolean, at: string): MessageView => ({
  id,
  senderId: mine ? 1 : 2,
  mine,
  kind: "TEXT",
  text: id,
  file: null,
  createdAt: at,
});

describe("threadMessages", () => {
  it("turns newest-first pages into one oldest-first list", () => {
    const pages: MessagesPage[] = [
      { data: [msg("m4", true, "d"), msg("m3", false, "c")], nextCursor: "m3" },
      { data: [msg("m2", true, "b"), msg("m1", false, "a")], nextCursor: null },
    ];
    expect(threadMessages(pages).map((m) => m.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
  });

  it("drops a message that two pages both returned", () => {
    const pages: MessagesPage[] = [
      { data: [msg("m2", true, "b")], nextCursor: "m2" },
      { data: [msg("m2", true, "b"), msg("m1", false, "a")], nextCursor: null },
    ];
    expect(threadMessages(pages).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("is empty for no pages", () => {
    expect(threadMessages(undefined)).toEqual([]);
  });
});

describe("lastPeerMessageId", () => {
  it("is the newest message that is not mine", () => {
    const list = [msg("m1", false, "a"), msg("m2", true, "b")];
    expect(lastPeerMessageId(list)).toBe("m1");
  });
  it("is null when the peer has said nothing", () => {
    expect(lastPeerMessageId([msg("m1", true, "a")])).toBeNull();
  });
});

describe("pending messages", () => {
  const now = new Date("2026-10-25T10:00:00Z");

  it("appends pending after the server list, marked", () => {
    const pending = addPending([], "k1", "Salom", now);
    const merged = mergePending(
      [msg("m1", false, "2026-10-25T09:00:00Z")],
      pending,
    );
    expect(merged.map((m) => m.id)).toEqual(["m1", "pending:k1"]);
    expect(merged[1]).toMatchObject({
      mine: true,
      text: "Salom",
      pending: "sending",
    });
  });

  it("marks a failed one and keeps its text", () => {
    let pending = addPending([], "k1", "Salom", now);
    pending = setPendingStatus(pending, "k1", "failed");
    expect(mergePending([], pending)[0]).toMatchObject({
      pending: "failed",
      text: "Salom",
    });
  });

  it("removes only the answered one", () => {
    let pending = addPending([], "k1", "a", now);
    pending = addPending(pending, "k2", "b", now);
    expect(removePending(pending, "k1").map((p) => p.key)).toEqual(["k2"]);
  });
});
