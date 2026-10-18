/**
 * «Avtomatik pauza» sahifasining sof qoidalari: qoralama, tekshiruv, o'zgarish
 * (patch) va oldindan ko'rish matni. Hech qanday React yoki so'rov yo'q —
 * `absence-pause-draft.test.ts` shu faylni sinaydi.
 *
 * Chegaralar serverdagi `UpdateAbsencePauseSettingsDto` bilan bir xil; server
 * baribir qayta tekshiradi, bu yerda esa foydalanuvchi darhol javob oladi.
 */

export interface AbsencePauseSettings {
  enabled: boolean;
  warnThreshold: number;
  pauseThreshold: number;
  dailyCap: number;
}

/** Raqamli maydonlar matn bo'lib turadi: tozalangan maydon `0` bo'lib qolmasin. */
export interface AbsencePauseDraft {
  enabled: boolean;
  warn: string;
  pause: string;
  cap: string;
}

export type NumberKey = "warn" | "pause" | "cap";

export const RANGES: Record<NumberKey, readonly [number, number]> = {
  warn: [1, 10],
  pause: [2, 20],
  cap: [1, 100],
};

export function toDraft(s: AbsencePauseSettings): AbsencePauseDraft {
  return {
    enabled: s.enabled,
    warn: String(s.warnThreshold),
    pause: String(s.pauseThreshold),
    cap: String(s.dailyCap),
  };
}

export function fieldError(key: NumberKey, text: string): string | null {
  if (text.trim() === "") return "Qiymatni kiriting";
  const n = Number(text);
  const [min, max] = RANGES[key];
  if (!Number.isInteger(n) || n < min || n > max) {
    return `${min} dan ${max} gacha bo'lishi kerak`;
  }
  return null;
}

export interface DraftErrors {
  warn: string | null;
  pause: string | null;
  cap: string | null;
  /** Ikkala chegara ham to'g'ri, lekin tartibi noto'g'ri. */
  order: string | null;
}

export function draftErrors(d: AbsencePauseDraft): DraftErrors {
  const warn = fieldError("warn", d.warn);
  const pause = fieldError("pause", d.pause);
  const cap = fieldError("cap", d.cap);
  const order =
    !warn && !pause && Number(d.warn) >= Number(d.pause)
      ? "Xabar chegarasi pauza chegarasidan kichik bo'lishi kerak"
      : null;
  return { warn, pause, cap, order };
}

export function isValid(d: AbsencePauseDraft): boolean {
  const e = draftErrors(d);
  return !e.warn && !e.pause && !e.cap && !e.order;
}

/** Faqat o'zgargan maydonlar; bo'sh obyekt = o'zgarish yo'q. */
export function buildPatch(
  saved: AbsencePauseSettings,
  d: AbsencePauseDraft,
): Partial<AbsencePauseSettings> {
  const patch: Partial<AbsencePauseSettings> = {};
  if (d.enabled !== saved.enabled) patch.enabled = d.enabled;
  if (!fieldError("warn", d.warn) && Number(d.warn) !== saved.warnThreshold) {
    patch.warnThreshold = Number(d.warn);
  }
  if (!fieldError("pause", d.pause) && Number(d.pause) !== saved.pauseThreshold) {
    patch.pauseThreshold = Number(d.pause);
  }
  if (!fieldError("cap", d.cap) && Number(d.cap) !== saved.dailyCap) {
    patch.dailyCap = Number(d.cap);
  }
  return patch;
}

/**
 * Matnini o'zgartirgan, lekin hali yaroqsiz maydon ham «o'zgarish» hisoblanadi
 * (aks holda «Saqlanmagan o'zgarish» belgisi yo'qolib, xato yashirinib qolardi).
 */
export function isDirty(
  saved: AbsencePauseSettings,
  d: AbsencePauseDraft,
): boolean {
  const base = toDraft(saved);
  return (
    d.enabled !== base.enabled ||
    d.warn !== base.warn ||
    d.pause !== base.pause ||
    d.cap !== base.cap
  );
}

/** Uch maydon nima qilishini aytadigan jonli jumla. */
export function summaryText(d: AbsencePauseDraft): string | null {
  if (fieldError("warn", d.warn) || fieldError("pause", d.pause)) return null;
  const warn = Number(d.warn);
  const pause = Number(d.pause);
  if (warn >= pause) return null;
  return `O'quvchi ketma-ket ${warn} ta dars qoldirsa xabar oladi, ${pause} ta qoldirsa pauzaga o'tadi.`;
}

/**
 * Oldindan ko'rishni so'rash kerakmi: qoida yoqiq bo'ladigan va hali
 * saqlanmagan o'zgarish bor, pauza chegarasi esa yaroqli.
 */
export function previewThreshold(
  saved: AbsencePauseSettings,
  d: AbsencePauseDraft,
): number | null {
  if (!d.enabled || !isDirty(saved, d)) return null;
  if (fieldError("pause", d.pause)) return null;
  return Number(d.pause);
}

export function candidatesText(
  candidates: number,
  pause: number,
  cap: number,
): { tone: "info" | "warning"; text: string } {
  if (candidates === 0) {
    return {
      tone: "info",
      text: `Hozir ${pause} va undan ko'p dars qoldirgan o'quvchi yo'q.`,
    };
  }
  const base = `Hozir ${candidates} nafar o'quvchi ${pause} va undan ko'p dars qoldirgan.`;
  if (candidates > cap) {
    return {
      tone: "warning",
      text: `${base} Bu kunlik chegaradan (${cap}) ko'p — hech kim pauzalanmaydi, sizga xabar keladi.`,
    };
  }
  return {
    tone: "warning",
    text: `${base} Saqlasangiz, navbatdagi 07:30 yurishda ular pauzaga o'tadi.`,
  };
}
