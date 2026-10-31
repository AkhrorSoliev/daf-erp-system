import { msg } from "@/i18n/msg";

/**
 * «To'lov yo'qligi uchun davomat olib bo'lmagan darslar» qoidasining yetti
 * mustaqil katagi (ADR-0142). Talablar serverdagi `effectiveBarredFlags`
 * bilan bir xil; bu yerda ular tugma holatini va PATCH tanasini hal qiladi.
 */
export type BarredFlagId =
  | "mark"
  | "nudge"
  | "warn"
  | "autoPause"
  | "pauseNotice"
  | "logOnly";

export type BarredFlags = Record<BarredFlagId, boolean>;

export interface BarredItem {
  id: BarredFlagId;
  /** Kirinti darajasi (0, 1, 2) — faqat ko'rinish uchun. */
  level: 0 | 1 | 2;
  requires: BarredFlagId | null;
  // Ekranda `t()` bilan chiziladi.
  title: string;
  text: string;
  /** PATCH /settings/payment maydoni. */
  field: string;
  key: string;
}

export const BARRED_ITEMS: BarredItem[] = [
  {
    id: "mark",
    level: 0,
    requires: null,
    title: msg("Profilda belgi va hisobot"),
    text: msg(
      "Darslar tabida binafsha nuqta, «Darsga qo'yilmayotganlar» tabi va eski holatlar hisoboti.",
    ),
    field: "barredMark",
    key: "absence.barred.mark",
  },
  {
    id: "nudge",
    level: 1,
    requires: "mark",
    title: msg("1-dars xabari"),
    text: msg(
      "Birinchi marta davomat olib bo'lmagan darsdan keyin yumshoq eslatma.",
    ),
    field: "barredNudge",
    key: "absence.barred.nudge",
  },
  {
    id: "warn",
    level: 1,
    requires: "mark",
    title: msg("2-dars xabari"),
    text: msg(
      "Ketma-ket ikkinchi dars: yana bir dars bo'lsa joy to'xtatilishi aytiladi.",
    ),
    field: "barredWarn",
    key: "absence.barred.warn",
  },
  {
    id: "autoPause",
    level: 1,
    requires: "mark",
    title: msg("Avto-pauza"),
    text: msg(
      "Ketma-ket darslardan keyin o'quvchi pauzaga tushadi.",
    ),
    field: "barredAutoPause",
    key: "absence.barred.autoPause",
  },
  {
    id: "pauseNotice",
    level: 2,
    requires: "autoPause",
    title: msg("3-dars xabari"),
    text: msg("Pauza haqida o'quvchiga xabar."),
    field: "barredPauseNotice",
    key: "absence.barred.pauseNotice",
  },
  {
    id: "logOnly",
    level: 0,
    requires: null,
    title: msg("Xabarlarni faqat logga yozish (sinov)"),
    text: msg(
      "Yoqilgan bo'lsa, xabar matni tayyorlanadi va logga yoziladi, o'quvchiga yuborilmaydi. Xabarlarni haqiqatan yuborish uchun o'chiring.",
    ),
    field: "barredLogOnly",
    key: "absence.barred.logOnly",
  },
];

/** `GET /settings/payment` javobidagi kalitlardan katakchalar. */
export function flagsFromSettings(
  settings: Record<string, unknown>,
): BarredFlags {
  const out = {} as BarredFlags;
  for (const item of BARRED_ITEMS) out[item.id] = settings[item.key] === true;
  return out;
}

/** Talab yoqilgan bo'lsa (yoki talab yo'q bo'lsa) katak yoqilishi mumkin. */
export function canTurnOn(flags: BarredFlags, id: BarredFlagId): boolean {
  const item = BARRED_ITEMS.find((i) => i.id === id)!;
  return item.requires === null || flags[item.requires];
}

/**
 * Katakni bosish natijasi: talabi bajarilmagan katak yoqilmaydi; ota-katak
 * o'chsa unga tayanganlar ham (har qanday chuqurlikda) o'chadi.
 */
export function toggled(flags: BarredFlags, id: BarredFlagId): BarredFlags {
  if (!flags[id]) {
    return canTurnOn(flags, id) ? { ...flags, [id]: true } : flags;
  }
  const next: BarredFlags = { ...flags, [id]: false };
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of BARRED_ITEMS) {
      if (next[item.id] && item.requires && !next[item.requires]) {
        next[item.id] = false;
        changed = true;
      }
    }
  }
  return next;
}

/** PATCH tanasi: faqat o'zgargan maydonlar. */
export function patchFor(
  before: BarredFlags,
  after: BarredFlags,
): Record<string, boolean> {
  const patch: Record<string, boolean> = {};
  for (const item of BARRED_ITEMS) {
    if (before[item.id] !== after[item.id]) patch[item.field] = after[item.id];
  }
  return patch;
}
