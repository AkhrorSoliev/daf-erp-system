import { msg } from "@/i18n/msg";
import { interpolate, type Params } from "@/i18n/translate";
import type { DafSkill, DarajaHolati, OquvchiFaolligi, Platforma } from "./types";

/**
 * The helpers that build a text take the page's translator as an optional last
 * argument; the default says the Uzbek text, so the group and center pages that
 * do not pass one are unchanged.
 */
export type Translate = (source: string, params?: Params) => string;

const SAY_UZBEK: Translate = interpolate;

// Draw with `t(…)`.
export const PLATFORMA_NOMLARI: Record<Platforma, string> = {
  WEB: msg("Veb"),
  ANDROID: msg("Android"),
  IOS: msg("iOS"),
};

// `uz` is drawn with `t(…)`; `de` is the course's German skill name and stays as it is.
export const KONIKMA_NOMLARI: Record<DafSkill, { uz: string; de: string }> = {
  WORTSCHATZ: { uz: msg("Lug'at"), de: "Wortschatz" },
  GRAMMATIK: { uz: msg("Grammatika"), de: "Grammatik" },
  LESEN: { uz: msg("O'qish"), de: "Lesen" },
  HOEREN: { uz: msg("Tinglash"), de: "Hören" },
  SCHREIBEN: { uz: msg("Yozish"), de: "Schreiben" },
  SPRECHEN: { uz: msg("Gapirish"), de: "Sprechen" },
};

// Draw with `t(…)`.
export const DARAJA_HOLATI_NOMLARI: Record<DarajaHolati, string> = {
  DAVOM: msg("Davom etmoqda"),
  TUGATILGAN: msg("Tugatilgan"),
  BOSHLANMAGAN: msg("Hali boshlanmagan"),
  KURS_YOQ: msg("Kurs hali yo'q"),
};

export function formatDavomiylik(soniya: number, t: Translate = SAY_UZBEK): string {
  if (soniya <= 0) return t("0 daq");
  if (soniya < 60) return t("<1 daq");
  const daqiqa = Math.floor(soniya / 60);
  const soat = Math.floor(daqiqa / 60);
  const qoldiq = daqiqa % 60;
  if (soat === 0) return t("{n} daq", { n: qoldiq });
  return qoldiq === 0 ? t("{n} soat", { n: soat }) : t("{h} soat {m} daq", { h: soat, m: qoldiq });
}

/** `YYYY-MM-DD` → `DD.MM`. Satrdan o'qiladi — brauzer vaqt mintaqasi aralashmaydi. */
export function formatKunOy(sana: string): string {
  return `${sana.slice(8, 10)}.${sana.slice(5, 7)}`;
}

type FaollikXulosasi = Pick<OquvchiFaolligi, "oxirgiFaollik" | "fortschritt" | "darajalar" | "mashq">;

/**
 * O'quvchi ROSTDAN ham ilovaga hech qachon kirmaganmi (topilma 2) — panel
 * "hali kirmagan" holatini faqat shu HAQIQIY bo'sh holatda ko'rsatsin: ilova
 * seansi, ball, tugatilgan dars va mashq javobi — hech biri yo'q. Faqat
 * `oxirgiFaollik === null` (mashq qilingan, lekin ilova seansi qayd
 * etilmagan) yolg'on "hali kirmagan" xabarini chiqarmasligi kerak.
 */
export function hechQachonKirmaganmi(data: FaollikXulosasi): boolean {
  return (
    !data.oxirgiFaollik &&
    data.fortschritt.gesamt === 0 &&
    data.darajalar.every((d) => d.tugatilgan === 0) &&
    data.mashq.savollar === 0
  );
}

const HAFTA = [msg("Yak"), msg("Du"), msg("Se"), msg("Chor"), msg("Pay"), msg("Ju"), msg("Sha")];

export function haftaKuni(sana: string, t: Translate = SAY_UZBEK): string {
  const nom = HAFTA[new Date(`${sana}T00:00:00Z`).getUTCDay()];
  return t(nom);
}

export function formatKunYorligi(sana: string, t: Translate = SAY_UZBEK): string {
  return `${formatKunOy(sana)} (${haftaKuni(sana, t)})`;
}

const TOSHKENT_MS = 5 * 60 * 60 * 1000;
const toshkent = (d: Date) => new Date(d.getTime() + TOSHKENT_MS);
const kunKaliti = (d: Date) => toshkent(d).toISOString().slice(0, 10);
const soatDaqiqa = (d: Date) => toshkent(d).toISOString().slice(11, 16);

export function formatOxirgiFaollik(iso: string | null, now: Date, t: Translate = SAY_UZBEK): string {
  if (!iso) return t("Ilovaga hali kirmagan");
  const vaqt = new Date(iso);
  if (now.getTime() - vaqt.getTime() < 5 * 60 * 1000) return t("Hozirgina");
  const farq = Math.round(
    (new Date(`${kunKaliti(now)}T00:00:00Z`).getTime() -
      new Date(`${kunKaliti(vaqt)}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (farq <= 0) return t("Bugun, {time}", { time: soatDaqiqa(vaqt) });
  if (farq === 1) return t("Kecha, {time}", { time: soatDaqiqa(vaqt) });
  return t("{n} kun oldin", { n: farq });
}

export function formatSanaVaqt(iso: string): string {
  const d = new Date(iso);
  return `${formatKunOy(kunKaliti(d))} · ${soatDaqiqa(d)}`;
}

/**
 * UTC ISO vaqtni Toshkent KUNIGA (`DD.MM`) o'giradi — `d.slice(0, 10)` kabi
 * to'g'ridan-to'g'ri ISO'dan kesish emas. 00:00–04:59 Toshkentda hali UTC
 * bo'yicha KECHAGI kun bo'ladi (topilma 4): masalan `...T20:30:00Z` Toshkentda
 * ertasi kun 01:30 — `d.slice(0,10)` bir kun oldingi sanani ko'rsatardi.
 */
export function formatSanaToshkent(iso: string): string {
  return formatKunOy(kunKaliti(new Date(iso)));
}

/** Foiz rangi: 80 dan boshlab yashil, 60 dan boshlab sariq, undan pastda qizil. */
export function foizRangi(foiz: number | null): string {
  if (foiz === null) return "text-muted-foreground";
  if (foiz >= 80) return "text-green-600 dark:text-green-400";
  if (foiz >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function foizUstunRangi(foiz: number): string {
  if (foiz >= 80) return "bg-green-500";
  if (foiz >= 60) return "bg-yellow-400";
  return "bg-red-500";
}
