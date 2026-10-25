import { USERNAME_RE as USERNAME } from "./chat-username-rules";

export type ChatQuery =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "username"; username: string }
  | { kind: "name"; q: string };

export function parseChatQuery(raw: string): ChatQuery {
  const s = raw.trim();
  if (s.startsWith("@")) {
    const username = s.slice(1).toLowerCase();
    return USERNAME.test(username)
      ? { kind: "username", username }
      : { kind: "invalid" };
  }
  return s.length >= 2 ? { kind: "name", q: s } : { kind: "empty" };
}
