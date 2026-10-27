import { describe, expect, it } from "vitest";
import {
  EDIT_WINDOW_MS,
  addPending,
  canEdit,
  mergePending,
} from "./chat-thread-model";
import {
  parseChatEvent,
  replaceMessage,
  type MessagesCache,
} from "./chat-stream-model";
import type { MessageView, ReplyView } from "./chat-types";

const msg = (id: string, text: string, over: Partial<MessageView> = {}): MessageView => ({
  id,
  senderId: 1,
  mine: true,
  kind: "TEXT",
  text,
  file: null,
  createdAt: "2026-10-27T07:00:00.000Z",
  editedAt: null,
  replyTo: null,
  ...over,
});

describe("canEdit", () => {
  const sentAt = "2026-10-27T07:00:00.000Z";
  const at = Date.parse(sentAt);
  const base = { mine: true, kind: "TEXT" as const, createdAt: sentAt };

  it("is true for my own text inside 3 hours and false at the limit", () => {
    expect(canEdit(base, at + EDIT_WINDOW_MS - 1)).toBe(true);
    expect(canEdit(base, at + EDIT_WINDOW_MS)).toBe(false);
  });
  it("is false for the peer's message, a file and a message still sending", () => {
    expect(canEdit({ ...base, mine: false }, at)).toBe(false);
    expect(canEdit({ ...base, kind: "IMAGE" }, at)).toBe(false);
    expect(canEdit({ ...base, pending: "sending" }, at)).toBe(false);
  });
});

describe("replaceMessage", () => {
  const cache: MessagesCache = {
    pages: [
      { data: [msg("b", "ikki"), msg("a", "bir")], nextCursor: null },
    ],
  };

  it("swaps the edited message in place and keeps the rest", () => {
    const next = replaceMessage(cache, msg("a", "bir (yangi)", { editedAt: "2026-10-27T07:05:00.000Z" }));
    expect(next?.pages[0].data.map((m) => m.text)).toEqual(["ikki", "bir (yangi)"]);
    expect(next?.pages[0].data[1].editedAt).toBe("2026-10-27T07:05:00.000Z");
  });
  it("answers undefined when the message is not loaded, so the caller refetches", () => {
    expect(replaceMessage(cache, msg("zzz", "x"))).toBeUndefined();
    expect(replaceMessage(undefined, msg("a", "x"))).toBeUndefined();
  });
});

describe("chat.edit event", () => {
  it("parses the edited message", () => {
    const ev = parseChatEvent({
      type: "chat.edit",
      conversationId: "c1",
      message: msg("a", "yangi"),
    });
    expect(ev).toMatchObject({ kind: "edit", conversationId: "c1" });
    expect(ev && ev.kind === "edit" ? ev.message?.text : null).toBe("yangi");
  });
  it("ignores an edit with no conversation", () => {
    expect(parseChatEvent({ type: "chat.edit", message: msg("a", "x") })).toBeNull();
  });
});

describe("a pending reply", () => {
  const reply: ReplyView = {
    id: "p1",
    mine: false,
    kind: "TEXT",
    preview: "savol",
    deleted: false,
  };

  it("shows the answered message on the pending bubble", () => {
    const pending = addPending([], "k1", "javob", new Date("2026-10-27T07:10:00Z"), reply);
    const [item] = mergePending([], pending);
    expect(item.replyTo).toEqual(reply);
    expect(item.editedAt).toBeNull();
  });
  it("has no reply when none was chosen", () => {
    const [item] = mergePending([], addPending([], "k2", "x", new Date()));
    expect(item.replyTo).toBeNull();
  });
});
