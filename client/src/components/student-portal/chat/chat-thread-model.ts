import type { MessageView, MessagesPage } from "./chat-types";

/** A message the server has not answered yet, or answered with an error. */
export interface PendingMessage {
  key: string;
  text: string;
  createdAt: string;
  status: "sending" | "failed";
  /** Set once the server answered: the bubble hides as soon as that message is in the thread. */
  serverId?: string;
}

/** What the thread draws: a server message, or a pending one of mine. */
export type ThreadItem = MessageView & { pending?: PendingMessage["status"] };

/** Pages arrive newest first; the screen reads oldest first. */
export function threadMessages(
  pages: MessagesPage[] | undefined,
): MessageView[] {
  const seen = new Set<string>();
  const out: MessageView[] = [];
  for (const page of pages ?? []) {
    for (const m of page.data) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out.reverse();
}

/** True when the viewport bottom is within `threshold` px of the page end. */
export function isNearBottom(
  scrollY: number,
  innerHeight: number,
  docHeight: number,
  threshold = 120,
): boolean {
  return docHeight - (scrollY + innerHeight) <= threshold;
}

/** Id of the newest message the peer wrote, for the «read» call. */
export function lastPeerMessageId(messages: MessageView[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!messages[i].mine) return messages[i].id;
  }
  return null;
}

export function addPending(
  list: PendingMessage[],
  key: string,
  text: string,
  now: Date,
): PendingMessage[] {
  return [
    ...list,
    { key, text, createdAt: now.toISOString(), status: "sending" },
  ];
}

export function setPendingStatus(
  list: PendingMessage[],
  key: string,
  status: PendingMessage["status"],
): PendingMessage[] {
  return list.map((p) => (p.key === key ? { ...p, status } : p));
}

export function confirmPending(
  list: PendingMessage[],
  key: string,
  serverId: string,
): PendingMessage[] {
  return list.map((p) => (p.key === key ? { ...p, serverId } : p));
}

export function removePending(
  list: PendingMessage[],
  key: string,
): PendingMessage[] {
  return list.filter((p) => p.key !== key);
}

export function mergePending(
  messages: MessageView[],
  pending: PendingMessage[],
): ThreadItem[] {
  const have = new Set(messages.map((m) => m.id));
  return [
    ...messages,
    ...pending
      .filter((p) => !(p.serverId && have.has(p.serverId)))
      .map<ThreadItem>((p) => ({
      id: `pending:${p.key}`,
      senderId: 0,
      mine: true,
      kind: "TEXT",
      text: p.text,
      file: null,
      createdAt: p.createdAt,
      pending: p.status,
    })),
  ];
}
