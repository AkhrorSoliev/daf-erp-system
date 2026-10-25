// Mirrors server/src/chat/username/chat-username.rules.ts (5–32, a-z0-9_,
// starts with a letter). The test compares the regex text with the server's.
export const USERNAME_RE = /^[a-z][a-z0-9_]{4,31}$/;
export const USERNAME_MIN = 5;
export const USERNAME_MAX = 32;

/** Same as the server: trim, drop one leading @, lowercase. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/** An Uzbek message for the first broken rule, or null when the server accepts it. */
export function validateUsername(
  raw: string,
  t: (s: string) => string = (s) => s,
): string | null {
  const u = normalizeUsername(raw);
  if (u.length < USERNAME_MIN) return t("Kamida 5 belgi bo'lsin");
  if (u.length > USERNAME_MAX) return t("Ko'pi bilan 32 belgi bo'lsin");
  if (/[^a-z0-9_]/.test(u))
    return t("Faqat lotin harf, raqam va _ bo'lsin");
  if (!/^[a-z]/.test(u)) return t("Harf bilan boshlansin");
  return null;
}
