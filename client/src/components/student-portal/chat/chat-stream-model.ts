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
  return { ...data, pages: [{ ...first, data: [message, ...first.data] }, ...rest] };
}

/** The list after I sent `message`: that conversation first, preview updated, unread 0. */
export function listAfterSend(
  list: ConversationView[] | undefined,
  conversationId: string,
  peer: PeerSummary | undefined,
  message: MessageView,
): ConversationView[] | undefined {
  const last = {
    preview: message.text ?? (message.kind === "IMAGE" ? "Rasm" : "Ovozli xabar"),
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
