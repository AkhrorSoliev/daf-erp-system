import { describe, expect, it } from "vitest";
import {
  backoffDelay,
  hasMessage,
  insertMessage,
  pendingStep,
  shouldResetBackoff,
  streamIdle,
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
    const out = listAfterSend([row("x"), row("y")], "y", undefined, msg("n", true), "n")!;
    expect(out.map((c) => c.id)).toEqual(["y", "x"]);
    expect(out[0]).toMatchObject({ unread: 0, lastMessage: { preview: "n", mine: true } });
  });
  it("adds a brand-new conversation when the peer is known", () => {
    expect(listAfterSend([], "n", peer, msg("m", true), "m")![0].id).toBe("n");
  });
  it("leaves the list alone when the conversation and the peer are unknown", () => {
    expect(listAfterSend([row("x")], "n", undefined, msg("m", true), "m")!.map((c) => c.id)).toEqual(["x"]);
  });
});

describe("shouldPing", () => {
  it("allows the first ping and then one per 3 s", () => {
    expect(shouldPing(undefined, 1000)).toBe(true);
    expect(shouldPing(1000, 3999)).toBe(false);
    expect(shouldPing(1000, 4000)).toBe(true);
  });
});

describe("insertMessage ordering", () => {
  const at = (id: string, iso: string): MessageView => ({ ...msg(id), createdAt: iso });
  it("keeps newest-first by createdAt, not blindly first", () => {
    const c: MessagesCache = {
      pages: [{ data: [at("c", "2026-10-27T10:03:00Z"), at("a", "2026-10-27T10:01:00Z")], nextCursor: null }],
    };
    const out = insertMessage(c, at("b", "2026-10-27T10:02:00Z"))!;
    expect(out.pages[0].data.map((m) => m.id)).toEqual(["c", "b", "a"]);
    const newest = insertMessage(c, at("d", "2026-10-27T10:09:00Z"))!;
    expect(newest.pages[0].data[0].id).toBe("d");
    const oldest = insertMessage(c, at("z", "2026-10-27T09:00:00Z"))!;
    expect(oldest.pages[0].data.at(-1)!.id).toBe("z");
  });
});

describe("stale poll after insert", () => {
  it("the bubble is kept while the id is absent and leaves only when present", () => {
    const sent = msg("n", true);
    const afterInsert = insertMessage(cache("a"), sent)!;
    expect(hasMessage(afterInsert, "n")).toBe(true);
    // a poll that began before the POST committed overwrites the cache
    const stale = cache("a");
    expect(hasMessage(stale, "n")).toBe(false);
    const p = confirmPending(addPending([], "k", "salom", new Date()), "k", "n");
    expect(mergePending([msg("a")], p).map((m) => m.id)).toContain("pending:k");
    expect(pendingStep(false, 500, false)).toBe("wait");
    expect(pendingStep(false, 1600, false)).toBe("refetch");
    // the refetch shows the id: the bubble goes
    expect(pendingStep(hasMessage(insertMessage(stale, sent), "n"), 1700, true)).toBe("remove");
  });
  it("removes only when present, waits after the refetch, gives up at 10 s", () => {
    expect(pendingStep(true, 0, false)).toBe("remove");
    expect(pendingStep(false, 5000, true)).toBe("wait");
    expect(pendingStep(false, 10000, true)).toBe("giveUp");
  });
});

describe("stream timing helpers", () => {
  it("watchdog fires after 75 s of silence", () => {
    expect(streamIdle(0, 74999)).toBe(false);
    expect(streamIdle(0, 75000)).toBe(true);
  });
  it("backoff doubles up to 30 s", () => {
    expect([0, 1, 2, 5, 9].map(backoffDelay)).toEqual([1000, 2000, 4000, 30000, 30000]);
  });
  it("resets only after a payload or a stable stream", () => {
    expect(shouldResetBackoff(200, false)).toBe(false);
    expect(shouldResetBackoff(200, true)).toBe(true);
    expect(shouldResetBackoff(10000, false)).toBe(true);
  });
});
