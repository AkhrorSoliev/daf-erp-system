const USERNAME = /^[a-z][a-z0-9_]{4,31}$/;

export const USERNAME_MESSAGE =
  "Username 5–32 belgi bo'lsin: lotin harf, raqam va _, harf bilan boshlansin";

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function usernameProblem(normalized: string): string | null {
  return USERNAME.test(normalized) ? null : USERNAME_MESSAGE;
}
