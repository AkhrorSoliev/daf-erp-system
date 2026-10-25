// Mirrors server/src/chat/username/chat-username.rules.ts (5–32, a-z0-9_).
const USERNAME = /^[a-z][a-z0-9_]{4,31}$/;

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
