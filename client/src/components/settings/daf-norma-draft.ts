/**
 * «DaF normasi» blokining sof qoidalari: qoralama (matn), tekshiruv, o'zgarish
 * va norma izohi. Chegaralar serverdagi `UpdateCompanyDto` bilan bir xil;
 * server baribir qayta tekshiradi.
 */

export interface DafNorma {
  kunlikDaqiqa: number;
  kunlikSavol: number;
  haftalikKun: number;
  sariqKun: number;
}

export type DafKey = keyof DafNorma;

export type DafDraft = Record<DafKey, string>;

export const DAF_KEYS: readonly DafKey[] = ["kunlikDaqiqa", "kunlikSavol", "haftalikKun", "sariqKun"];

export const CHEGARA: Record<DafKey, { min: number; max: number }> = {
  kunlikDaqiqa: { min: 1, max: 1440 },
  kunlikSavol: { min: 1, max: 500 },
  haftalikKun: { min: 1, max: 7 },
  sariqKun: { min: 1, max: 7 },
};

export function toDraft(n: DafNorma): DafDraft {
  return {
    kunlikDaqiqa: String(n.kunlikDaqiqa),
    kunlikSavol: String(n.kunlikSavol),
    haftalikKun: String(n.haftalikKun),
    sariqKun: String(n.sariqKun),
  };
}

export function fieldError(key: DafKey, text: string): string | null {
  if (text.trim() === "") return "Qiymatni kiriting";
  const n = Number(text);
  const { min, max } = CHEGARA[key];
  if (!Number.isInteger(n) || n < min || n > max) return `${min} dan ${max} gacha bo'lishi kerak`;
  return null;
}

export type DafErrors = Record<DafKey, string | null> & { order: string | null };

export function draftErrors(d: DafDraft): DafErrors {
  const e = {
    kunlikDaqiqa: fieldError("kunlikDaqiqa", d.kunlikDaqiqa),
    kunlikSavol: fieldError("kunlikSavol", d.kunlikSavol),
    haftalikKun: fieldError("haftalikKun", d.haftalikKun),
    sariqKun: fieldError("sariqKun", d.sariqKun),
  };
  // Teng bo'lsa sariq oraliq yo'qoladi. Server ham tekshiradi.
  const order =
    !e.haftalikKun && !e.sariqKun && Number(d.sariqKun) >= Number(d.haftalikKun)
      ? "Sariq chegarasi yashil chegaradan kichik bo'lishi kerak"
      : null;
  return { ...e, order };
}

export function isValid(d: DafDraft): boolean {
  const e = draftErrors(d);
  return DAF_KEYS.every((k) => !e[k]) && !e.order;
}

export function isDirty(saved: DafNorma, d: DafDraft): boolean {
  const base = toDraft(saved);
  return DAF_KEYS.some((k) => d[k] !== base[k]);
}

/** Yaroqli qoralamadan serverga ketadigan to'liq qiymatlar. */
export function toNorma(d: DafDraft): DafNorma {
  return {
    kunlikDaqiqa: Number(d.kunlikDaqiqa),
    kunlikSavol: Number(d.kunlikSavol),
    haftalikKun: Number(d.haftalikKun),
    sariqKun: Number(d.sariqKun),
  };
}

/** Normaning izohi; qiymatlar yaroqsiz bo'lsa — yo'naltiruvchi qator. */
export function normText(d: DafDraft): string {
  if (!isValid(d)) return "Qiymatlar to'g'rilangach, normaning izohi shu yerda ko'rinadi.";
  const n = toNorma(d);
  const sariq = n.sariqKun === n.haftalikKun - 1 ? `${n.sariqKun} kun` : `${n.sariqKun}–${n.haftalikKun - 1} kun`;
  return (
    `Norma: o'quvchi kuniga kamida ${n.kunlikDaqiqa} daqiqa o'quv bo'limida ishlashi yoki ` +
    `${n.kunlikSavol} ta savolga javob berishi kerak. Haftada shunday ${n.haftalikKun} kun bo'lsa — yashil, ` +
    `${sariq} bo'lsa — sariq, kamroq bo'lsa — qizil. Norma o'zgartirilsa o'tmish ham yangi norma bilan hisoblanadi.`
  );
}
