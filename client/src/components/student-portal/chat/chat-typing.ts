import api from "@/lib/api";

export const TYPING_PING_GAP_MS = 3000;

/** True when a new typing ping may go out: never sent, or the gap has passed. */
export function shouldPing(
  last: number | undefined,
  now: number,
  gap = TYPING_PING_GAP_MS,
): boolean {
  return last === undefined || now - last >= gap;
}

/** Fire and forget: a failed ping is never shown. */
export function sendTyping(conversationId: string): void {
  api.post(`/chat/conversations/${conversationId}/typing`).catch(() => {});
}
