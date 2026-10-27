import type {
  ConversationView,
  MessageView,
  MessagesPage,
  PeerSummary,
} from "./chat-types";

/** The cached shape of `useMessages` (react-query's infinite data). */
export interface MessagesCache {
  pages: MessagesPage[];
  pageParams?: unknown[];
}

/**
 * Splits an SSE buffer into the JSON bodies of its complete `data: ` lines and
 * the unfinished tail to keep for the next chunk. A body that is not JSON is dropped.
 */
export function splitSse(buffer: string): { payloads: unknown[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const payloads: unknown[] = [];
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    try {
      payloads.push(JSON.parse(line.slice(6)));
    } catch {
      // a broken line is skipped, never fatal
    }
  }
  return { payloads, rest };
}

export type ChatEvent =
  | { kind: "message"; conversationId: string; message: MessageView | null }
  | { kind: "edit"; conversationId: string; message: MessageView | null }
  | { kind: "read"; conversationId: string }
  | { kind: "access" }
  | { kind: "typing"; conversationId: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function asMessage(v: unknown): MessageView | null {
  return isObj(v) &&
    typeof v.id === "string" &&
    typeof v.senderId === "number" &&
    typeof v.createdAt === "string" &&
    typeof v.kind === "string"
    ? (v as unknown as MessageView)
    : null;
}

/** A stream payload as a chat event, or null when it is not one of ours. */
export function parseChatEvent(p: unknown): ChatEvent | null {
  if (!isObj(p) || typeof p.type !== "string") return null;
  const id = typeof p.conversationId === "string" ? p.conversationId : null;
  switch (p.type) {
    case "chat.message":
      return id ? { kind: "message", conversationId: id, message: asMessage(p.message) } : null;
    case "chat.edit":
      return id ? { kind: "edit", conversationId: id, message: asMessage(p.message) } : null;
    case "chat.read":
      return id ? { kind: "read", conversationId: id } : null;
    case "chat.typing":
      return id ? { kind: "typing", conversationId: id } : null;
    case "chat.access":
      return { kind: "access" };
    default:
      return null;
  }
}

/**
 * Puts one message at the top (newest) of the cached thread. Returns the SAME
 * object when the id is already there (stream and POST answer can both bring
 * it), and undefined when the thread was never loaded (the caller refetches).
 */
export function insertMessage(
  data: MessagesCache | undefined,
  message: MessageView,
): MessagesCache | undefined {
  if (!data || data.pages.length === 0) return undefined;
  if (data.pages.some((p) => p.data.some((m) => m.id === message.id))) {
    return data;
  }
  const [first, ...rest] = data.pages;
  // Newest first: the message goes before the first one that is not newer (ties: the new one is first).
  const at = Date.parse(message.createdAt);
  const i = first.data.findIndex((m) => Date.parse(m.createdAt) <= at);
  const merged =
    i === -1
      ? [...first.data, message]
      : [...first.data.slice(0, i), message, ...first.data.slice(i)];
  return { ...data, pages: [{ ...first, data: merged }, ...rest] };
}

/**
 * Swaps an edited message in place. Undefined when it is not in the cache
 * (the caller refetches).
 */
export function replaceMessage(
  data: MessagesCache | undefined,
  message: MessageView,
): MessagesCache | undefined {
  if (!data) return undefined;
  let found = false;
  const pages = data.pages.map((p) => {
    if (!p.data.some((m) => m.id === message.id)) return p;
    found = true;
    return { ...p, data: p.data.map((m) => (m.id === message.id ? message : m)) };
  });
  return found ? { ...data, pages } : undefined;
}

/** The list after I sent `message`: that conversation first, preview updated, unread 0. */
export function listAfterSend(
  list: ConversationView[] | undefined,
  conversationId: string,
  peer: PeerSummary | undefined,
  message: MessageView,
  /** The list row's preview text, already translated by the caller. */
  preview: string,
): ConversationView[] | undefined {
  const last = {
    preview,
    at: message.createdAt,
    mine: true,
  };
  const old = list ?? [];
  const found = old.find((c) => c.id === conversationId);
  const next = found
    ? { ...found, lastMessage: last, unread: 0 }
    : peer
      ? { id: conversationId, peer, lastMessage: last, unread: 0 }
      : null;
  if (!next) return list;
  return [next, ...old.filter((c) => c.id !== conversationId)];
}

/** True when the cached thread holds this message id. */
export function hasMessage(data: MessagesCache | undefined, id: string): boolean {
  return !!data?.pages.some((p) => p.data.some((m) => m.id === id));
}

export const PENDING_GRACE_MS = 1500;
export const PENDING_GIVE_UP_MS = 10000;

/**
 * What to do with a sent message's pending bubble. It leaves only when the
 * server's message is in the cached thread; a poll that started before the POST
 * committed can overwrite the cache, so after the grace time the thread is
 * refetched, and after the give-up time the bubble is dropped with one last refetch.
 */
export function pendingStep(
  present: boolean,
  ageMs: number,
  refetched: boolean,
): "remove" | "wait" | "refetch" | "giveUp" {
  if (present) return "remove";
  if (ageMs >= PENDING_GIVE_UP_MS) return "giveUp";
  if (ageMs >= PENDING_GRACE_MS && !refetched) return "refetch";
  return "wait";
}

export const STREAM_IDLE_LIMIT_MS = 75000;
export const STREAM_STABLE_MS = 10000;

/** Nothing (data or heartbeat) was read for too long: the connection is dead. */
export const streamIdle = (lastReadAt: number, now: number): boolean =>
  now - lastReadAt >= STREAM_IDLE_LIMIT_MS;

export const backoffDelay = (retry: number): number =>
  Math.min(1000 * 2 ** retry, 30_000);

/** The backoff restarts only after a real payload or a stream that stayed open. */
export const shouldResetBackoff = (openMs: number, gotPayload: boolean): boolean =>
  gotPayload || openMs >= STREAM_STABLE_MS;
