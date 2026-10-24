import { interpolate } from "@/i18n/translate";
import { formatKunOy, type Translate } from "../app-activity/activity-format";
import type { MusobaqaGuruh } from "./types";

const SAY_UZBEK: Translate = interpolate;

const KUN_MS = 24 * 60 * 60 * 1000;
const utcKun = (sana: string) => Date.UTC(+sana.slice(0, 4), +sana.slice(5, 7) - 1, +sana.slice(8, 10));

function kunQosh(sana: string, n: number): string {
  const d = new Date(utcKun(sana) + n * KUN_MS);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** `2026-10-19` → `19.10 – 25.10` (dushanba–yakshanba). Satrdan hisoblanadi — brauzer vaqt mintaqasi aralashmaydi. */
export function haftaYorligi(haftaBoshi: string): string {
  return `${formatKunOy(haftaBoshi)} – ${formatKunOy(kunQosh(haftaBoshi, 6))}`;
}

export function kunFarqi(sana: string, bugun: string): number {
  return Math.round((utcKun(bugun) - utcKun(sana)) / KUN_MS);
}

export function oxirgiMashqMatni(sana: string | null, bugun: string, t: Translate = SAY_UZBEK): string {
  if (sana === null) return t("hech qachon");
  const n = kunFarqi(sana, bugun);
  if (n <= 0) return t("bugun");
  if (n === 1) return t("kecha");
  return t("{n} kun oldin", { n });
}

export function kartaIzohi(g: MusobaqaGuruh, t: Translate = SAY_UZBEK): string | null {
  switch (g.holat) {
    case "KAM_AZO":
      return t("Jadvalga kirish uchun kamida {min} a'zo kerak (hozir {n})", { min: g.minAzolar, n: g.azolar });
    case "FAOL_EMAS":
      return t("Guruh faol emas — musobaqada qatnashmaydi");
    case "YOZUV_YOQ":
      return t("Bu haftada guruh jadvalda bo'lmagan");
    default:
      return null;
  }
}

export function maqsadFoizi(bugunBali: number | null, maqsadBali: number | null): number | null {
  if (bugunBali === null || maqsadBali === null || maqsadBali <= 0) return null;
  return Math.min(100, Math.round((bugunBali / maqsadBali) * 100));
}
