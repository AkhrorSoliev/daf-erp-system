import type { SearchablePage } from "@/data/searchable-pages";
import type { Can } from "./permission-check";
import { getVisibleSettingsSections, type SettingsNavSection } from "./settings-nav";

/**
 * Umumiy qidiruv (sarlavhadagi «Qidirish…») uchun: foydalanuvchi ochishi
 * mumkin bo'lgan sozlama sahifalari. Ro'yxat `settings-nav.ts` ning o'zidan
 * olinadi, shuning uchun yangi sahifa qo'shilsa qidiruvga o'zi tushadi.
 */
export function settingsSearchPages(can: Can, isCeo: boolean): SearchablePage[] {
  return getVisibleSettingsSections(can, isCeo)
    .flatMap((section) => section.items)
    .map((item) => ({
      label: item.title,
      url: item.url,
      keywords: (item.keywords ?? []).map((k) => k.toLowerCase()),
    }));
}

/**
 * /settings qidiruvi: toza funksiyalar, brauzersiz sinaladi.
 * Apostrof turlari (' ʻ ʼ ’ `) bir xil sanaladi: foydalanuvchi «o'quv»
 * yozsa ham, «oʻquv» yozsa ham topiladi.
 */

const APOSTROPHES = /['ʻʼ’‘`]/g;
const APOSTROPHE = /['ʻʼ’‘`]/;

export function normalizeQuery(text: string): string {
  return text.toLowerCase().replace(APOSTROPHES, "").replace(/\s+/g, " ").trim();
}

/**
 * Bo'limlardan so'rovga mos punktlarni qoldiradi (nom, izoh yoki kalit so'z
 * bo'yicha). Bo'lim nomi qidirilmaydi: «telegram» deganga «Arxiv» ham chiqib
 * qolmasin. Bo'sh so'rov hammasini o'zgartirmay qaytaradi.
 * Name and description are matched as the page shows them (`t`) AND in the
 * Uzbek-Latin source, and the keywords stay Uzbek, so a user typing Latin Uzbek
 * finds a page in every language (uz-Cyrl, ru, de, en).
 */
export function filterSettingsSections(
  sections: SettingsNavSection[],
  query: string,
  t: (source: string) => string = (source) => source,
): SettingsNavSection[] {
  const q = normalizeQuery(query);
  if (!q) return sections;

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        [t(item.title), t(item.description), item.title, item.description, ...(item.keywords ?? [])].some((text) =>
          normalizeQuery(text).includes(q),
        ),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Matnni so'rov mos kelgan va kelmagan bo'laklarga bo'ladi (nomni ajratib
 * ko'rsatish uchun). Apostrofli matnda belgilar siljimasligi uchun har belgi
 * alohida normallanadi.
 */
export function splitByQuery(text: string, query: string): TextPart[] {
  const q = normalizeQuery(query);
  if (!q) return [{ text, match: false }];

  // normallangan harflar -> asl matndagi indekslar
  let plain = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (APOSTROPHE.test(ch)) continue;
    plain += ch.toLowerCase();
    origin.push(i);
  }

  const at = plain.indexOf(q);
  if (at < 0) return [{ text, match: false }];

  const start = origin[at];
  const end = origin[at + q.length - 1] + 1;
  return [
    { text: text.slice(0, start), match: false },
    { text: text.slice(start, end), match: true },
    { text: text.slice(end), match: false },
  ].filter((part) => part.text.length > 0);
}
