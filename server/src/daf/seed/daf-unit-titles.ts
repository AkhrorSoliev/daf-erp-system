import type { CefrLevel } from '../../daf-content/dataset.types';

/**
 * Bo'lim nomlari.
 *
 * Manbada bob nomi YO'Q — DiB sahifasining sarlavhasi «Kapitel Eins», ya'ni
 * faqat raqam. Shuning uchun nom bizniki: har bo'lim o'z mavzusi bilan
 * ataladi, «1-bob» bilan emas. Bu ADR-0011 ning amaliy natijasi — bo'lim
 * bizning o'quv yo'limizning bosqichi, manbaning bo'limi emas; manba bobi
 * unga faqat biriktiriladi.
 *
 * Nomlar o'sha bobning lug'at bo'limlaridan olingan (masalan 1-bob:
 * Begrüßungen · Persönliche Informationen · Jemanden kennenlernen →
 * «Tanishuv va salomlashish»). Nemischa nom Goethe mavzular inventaridagi
 * atamaga yaqin qilib tanlangan, o'zbekchasi esa o'quvchi ko'radigan nom.
 *
 * Ikkinchi manba qo'shilganda uning boblari SHU bo'limlarga taqsimlanadi —
 * yangi bo'lim tug'ilmaydi.
 */
export interface DafUnitTitle {
  chapter: number;
  titleDe: string;
  titleUz: string;
}

export const DAF_UNIT_TITLES: DafUnitTitle[] = [
  { chapter: 1, titleDe: 'Kennenlernen', titleUz: 'Tanishuv va salomlashish' },
  { chapter: 2, titleDe: 'Studium und Wohnen', titleUz: "O'qish va turar joy" },
  {
    chapter: 3,
    titleDe: 'Tagesablauf und Einkaufen',
    titleUz: 'Kun tartibi va xarid',
  },
  { chapter: 4, titleDe: 'Freizeit', titleUz: "Bo'sh vaqt" },
  { chapter: 5, titleDe: 'Familie und Feste', titleUz: 'Oila va bayramlar' },
  { chapter: 6, titleDe: 'Reisen', titleUz: 'Sayohat' },
  { chapter: 7, titleDe: 'Gesundheit und Körper', titleUz: "Sog'liq va tana" },
  { chapter: 8, titleDe: 'Menschen und Berufe', titleUz: 'Odamlar va kasblar' },
  {
    chapter: 9,
    titleDe: 'Gesellschaft und Umwelt',
    titleUz: 'Jamiyat va atrof-muhit',
  },
  {
    chapter: 10,
    titleDe: 'Geschichte und Orientierung',
    titleUz: "Tarix va yo'l topish",
  },
];

/** Bo'limning tartibi daraja ICHIDA — yo'l shu tartibda yuriladi. */
export function orderWithinLevel(
  chapter: number,
  level: CefrLevel,
  all: { chapter: number; level?: CefrLevel }[],
): number {
  const sameLevel = all
    .filter((c) => c.level === level)
    .map((c) => c.chapter)
    .sort((a, b) => a - b);
  return sameLevel.indexOf(chapter) + 1;
}
