import { msg } from "@/i18n/msg";

const RECENT_KEY = "daf.chat.emoji.recent";

/** Emojibase group names (English, any case) → our texts. */
const CATEGORY_TEXT: Record<string, string> = {
  "smileys & emotion": msg("Kulgichlar va his-tuyg'ular"),
  "people & body": msg("Odamlar"),
  "animals & nature": msg("Hayvonlar va tabiat"),
  "food & drink": msg("Ovqat va ichimliklar"),
  "travel & places": msg("Sayohat va joylar"),
  activities: msg("Faoliyat"),
  objects: msg("Narsalar"),
  symbols: msg("Belgi va ramzlar"),
  flags: msg("Bayroqlar"),
};

/** The Uzbek source text for a category, or null for one we do not know. */
export function categoryText(label: string): string | null {
  return CATEGORY_TEXT[label.toLowerCase()] ?? null;
}
export const RECENT_MAX = 16;

/** Puts `emoji` over the selection [start, end); null when the result would pass `max`. */
export function insertAtCaret(
  text: string,
  start: number,
  end: number,
  emoji: string,
  max: number,
): { text: string; caret: number } | null {
  const next = text.slice(0, start) + emoji + text.slice(end);
  if (next.length > max) return null;
  return { text: next, caret: start + emoji.length };
}

/** Newest first, no repeats, at most RECENT_MAX. */
export function pushRecent(list: string[], emoji: string): string[] {
  return [emoji, ...list.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
}

export function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((e): e is string => typeof e === "string").slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function saveRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // storage blocked: recents are a convenience only
  }
}
