import { describe, expect, it } from "vitest";
import {
  insertMessage,
  listAfterSend,
  parseChatEvent,
  splitSse,
  type MessagesCache,
} from "./chat-stream-model";
import { addPending, confirmPending, mergePending } from "./chat-thread-model";
import { shouldPing } from "./chat-typing";
import type { ConversationView, MessageView, PeerSummary } from "./chat-types";

const msg = (id: string, mine = false): MessageView => ({
  id,
  senderId: mine ? 1 : 2,
  mine,
  kind: "TEXT",
  text: id,
  file: null,
  createdAt: "2026-10-27T10:00:00.000Z",
});
const cache = (...ids: string[]): MessagesCache => ({
  pages: [{ data: ids.map((i) => msg(i)), nextCursor: null }],
  pageParams: [undefined],
});
const peer: PeerSummary = { id: 2, firstName: "Ali", lastName: "V", username: null, photo: null };

describe("splitSse", () => {
  it("returns complete data lines and keeps the unfinished tail", () => {
    const out = splitSse('data: {"a":1}\n: ping\ndata: {"b":2}\ndata: {"c"');
    expect(out.payloads).toEqual([{ a: 1 }, { b: 2 }]);
    expect(out.rest).toBe('data: {"c"');
  });
  it("skips a broken JSON line", () => {
    expect(splitSse("data: {oops\ndata: 1\n").payloads).toEqual([1]);
  });
});

describe("parseChatEvent", () => {
  it("reads the four chat events and ignores others", () => {
    expect(parseChatEvent({ type: "chat.typing", conversationId: "c" })).toEqual({ kind: "typing", conversationId: "c" });
    expect(parseChatEvent({ type: "chat.read", conversationId: "c" })).toEqual({ kind: "read", conversationId: "c" });
    expect(parseChatEvent({ type: "chat.access" })).toEqual({ kind: "access" });
    expect(parseChatEvent({ type: "notification" })).toBeNull();
    expect(parseChatEvent({ type: "chat.typing" })).toBeNull();
  });
  it("carries the message when it is complete, null when not", () => {
    const ok = parseChatEvent({ type: "chat.message", conversationId: "c", message: msg("m") });
    expect(ok).toMatchObject({ kind: "message", message: { id: "m" } });
    const bad = parseChatEvent({ type: "chat.message", conversationId: "c", message: { id: 1 } });
    expect(bad).toMatchObject({ kind: "message", message: null });
  });
});

describe("insertMessage", () => {
  it("puts a new message first (newest)", () => {
    expect(insertMessage(cache("a"), msg("b"))!.pages[0].data.map((m) => m.id)).toEqual(["b", "a"]);
  });
  it("dedupes by id and returns the same object", () => {
    const c = cache("a", "b");
    expect(insertMessage(c, msg("a"))).toBe(c);
  });
  it("is undefined for a thread that was never loaded", () => {
    expect(insertMessage(undefined, msg("a"))).toBeUndefined();
  });
  it("stream first, then the POST answer: one copy", () => {
    const once = insertMessage(cache("a"), msg("n", true))!;
    expect(insertMessage(once, msg("n", true))!.pages[0].data.filter((m) => m.id === "n")).toHaveLength(1);
  });
});

describe("pending swap", () => {
  it("hides the confirmed bubble only once the server message is in the thread", () => {
    const p = confirmPending(addPending([], "k", "salom", new Date()), "k", "n");
    expect(mergePending([msg("a")], p).map((m) => m.id)).toEqual(["a", "pending:k"]);
    expect(mergePending([msg("n", true), msg("a")], p).map((m) => m.id)).toEqual(["n", "a"]);
  });
});

describe("listAfterSend", () => {
  const row = (id: string): ConversationView => ({ id, peer, lastMessage: null, unread: 3 });
  it("moves the conversation first, updates preview, clears unread", () => {
    const out = listAfterSend([row("x"), row("y")], "y", undefined, msg("n", true))!;
    expect(out.map((c) => c.id)).toEqual(["y", "x"]);
    expect(out[0]).toMatchObject({ unread: 0, lastMessage: { preview: "n", mine: true } });
  });
  it("adds a brand-new conversation when the peer is known", () => {
    expect(listAfterSend([], "n", peer, msg("m", true))![0].id).toBe("n");
  });
  it("leaves the list alone when the conversation and the peer are unknown", () => {
    expect(listAfterSend([row("x")], "n", undefined, msg("m", true))!.map((c) => c.id)).toEqual(["x"]);
  });
});

describe("shouldPing", () => {
  it("allows the first ping and then one per 3 s", () => {
    expect(shouldPing(undefined, 1000)).toBe(true);
    expect(shouldPing(1000, 3999)).toBe(false);
    expect(shouldPing(1000, 4000)).toBe(true);
  });
});
