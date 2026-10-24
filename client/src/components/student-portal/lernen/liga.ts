import { msg } from "@/i18n/msg";
import { interpolate, type Params } from "@/i18n/translate";
import type { Liga, LigaDarajasi } from "./types";

/** The page's `t`; without it the helpers read the Uzbek source. */
export type Translate = (source: string, params?: Params) => string;

/**
 * Liga nomlari va chegaralari — serverdagi `daf/liga/liga-qoidalari.ts` bilan
 * bir xil (`liga.test.ts` ularni o'sha fayldan o'qib solishtiradi).
 */
export const LIGA_NOMLARI = [
  msg("Bronza"),
  msg("Kumush"),
  msg("Oltin"),
  msg("Yoqut"),
  msg("Olmos"),
] as const;
export const KOTARILISH_MIN_BALL = 50;
export const KOTARILISH_MIN_AZO = 15;
export const GOLIB_MIN_BALL = 50;
export const GOLIB_MIN_AZO = 5;

/**
 * A league name the server sent, in the page language. The server sends the
 * Uzbek name from the same list; a name this client does not know prints as sent.
 */
export function ligaNomi(nomi: string, t: Translate = interpolate): string {
  const nom = LIGA_NOMLARI.find((n) => n === nomi);
  return nom ? t(nom) : nomi;
}

/** «Bronza ligasi» — the league's title. */
export function ligaSarlavhasi(nomi: string, t: Translate = interpolate): string {
  return t("{name} ligasi", { name: ligaNomi(nomi, t) });
}

const kunRaqami = (s: string) =>
  Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86_400_000;

/** «Hafta tugashiga N kun · M kishi»; `bugun` — Toshkent sanasi (`tashkentNow().dateStr`). */
export function haftaMatni(
  haftaOxiri: string,
  bugun: string,
  hajmi: number | null,
  t: Translate = interpolate,
): string {
  const kun = kunRaqami(haftaOxiri) - kunRaqami(bugun) + 1;
  const hafta = kun <= 1 ? t("Hafta bugun tugaydi") : t("Hafta tugashiga {n} kun", { n: kun });
  return hajmi == null ? hafta : `${hafta} · ${t("{n} kishi", { n: hajmi })}`;
}

/** Xona jadvali ustidagi izoh: zona faol / xona kichik / eng yuqori liga. */
export function kotarilishMatni(
  z: { soni: number; faol: boolean },
  t: Translate = interpolate,
): string {
  if (z.soni === 0) return t("Eng yuqori liga — bu yerdan ko'tarilish yo'q");
  return z.faol
    ? t("Birinchi {n} tasi, kamida {min} ball topgan bo'lsa, ko'tariladi", {
        n: z.soni,
        min: KOTARILISH_MIN_BALL,
      })
    : t("Xona hali kichik — ko'tarilish kamida {n} kishi bo'lganda", { n: KOTARILISH_MIN_AZO });
}

/**
 * «O'tgan hafta» qatori. Daraja faqat o'sadi va ko'tarilish bir pog'ona, shuning
 * uchun ko'tarilgan o'quvchining hozirgi darajasi — yetgan ligasi.
 */
export function otganHaftaMatni(
  o: NonNullable<Liga["otganHafta"]>,
  joriy: LigaDarajasi,
  t: Translate = interpolate,
): string {
  return o.kotarildi
    ? t("Siz {place}-o'rin · {name} ligasiga ko'tarildingiz", {
        place: o.orin,
        name: ligaNomi(joriy.nomi, t),
      })
    : t("Siz {place}-o'rin · {n} kishi", { place: o.orin, n: o.hajmi });
}

/** Qator ko'tarilish zonasidami (yashil): zona faol va birinchi `soni` ta ichida. */
export function zonadami(platz: number, z: { soni: number; faol: boolean }): boolean {
  return z.faol && platz <= z.soni;
}

/** Guruh bahosi: o'nlik vergul bilan, «12,5 ball». */
export function bahoMatni(baho: number, t: Translate = interpolate): string {
  return t("{n} ball", { n: String(baho).replace(".", ",") });
}
