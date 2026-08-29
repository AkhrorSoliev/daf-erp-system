/**
 * Rad etilgan rasmlar jurnali.
 *
 * Rasm sifatini ODAM baholaydi (`daf-gen-images.ts` boshidagi izohga
 * qarang). Odam bir rasmni rad etsa, uni qayta chizish kerak — ammo
 * urug' `sourceId`dan barqaror hisoblanadi, shuning uchun oddiy qayta
 * yugurtirish AYNAN o'sha rad etilgan rasmni qaytaradi.
 *
 * Shu sababli rad etish `content/daf/image-redraw.json` faylida
 * SAQLANADI: `{ "<sourceId>": { attempt, de, reason } }`. Fayl git'da
 * yotadi, ya'ni skript kim tomonidan va qachon yugurtirilishidan qat'i
 * nazar bir xil natija beradi — "qaysi rasm qabul qilingan" degan bilim
 * kimningdir xotirasida emas, kodda turadi.
 *
 * Har yozuvda SABAB ham bor. Bu bezak emas: sababsiz jurnal olti oydan
 * keyin "nega bu so'z boshqacha chizilgan?" degan javobsiz savolga
 * aylanadi, va kimdir uni "keraksiz" deb o'chirib rad etilgan rasmni
 * qaytarib qo'yadi.
 *
 * Nega bazada emas: bu KONTENT qarori (qaysi rasm yaxshi), ish vaqti
 * holati emas. Bazaga qo'yilsa dev va prod bazalarida boshqa-boshqa
 * rasm chiqib ketardi.
 */
import { readFileSync } from 'fs';

/** Bitta rad etish yozuvi. */
export interface RedrawEntry {
  /** Nechanchi urinish bilan qayta chizilsin (1 dan boshlanadi). */
  attempt: number;
  /** So'zning o'zi — jurnalni odam o'qishi uchun. */
  de: string;
  /** Nega rad etilgani — odam o'qishi uchun. */
  reason: string;
}

/** `sourceId` → rad etish yozuvi. */
export type RedrawMap = Record<string, RedrawEntry>;

/**
 * JSON mazmunini tekshirib `RedrawMap`ga aylantiradi.
 *
 * Tekshiruv qat'iy va XATO ULOQTIRADI, jimgina o'tkazib yubormaydi:
 * `0` yoki `"2"` kabi noto'g'ri qiymat jimgina qabul qilinsa, rasm
 * qayta chizilmay o'sha rad etilgani qolib ketardi va buni hech kim
 * sezmasdi — natija "tuzatdim" deb hisoblangan, aslida tuzatilmagan
 * rasm bo'lardi.
 */
export function parseRedrawMap(raw: unknown): RedrawMap {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('image-redraw.json: obyekt kutilgan');
  }

  const map: RedrawMap = {};
  for (const [sourceId, value] of Object.entries(raw as object)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(
        `image-redraw.json: "${sourceId}" uchun obyekt kutilgan, berildi ` +
          `${JSON.stringify(value)}`,
      );
    }
    const { attempt, de, reason } = value as Partial<RedrawEntry>;
    if (!Number.isInteger(attempt) || (attempt as number) < 1) {
      throw new Error(
        `image-redraw.json: "${sourceId}" uchun attempt 1 dan katta butun ` +
          `son bo'lishi kerak, berildi ${JSON.stringify(attempt)}`,
      );
    }
    // Sabab bo'sh bo'lsa jurnal o'z vazifasini bajarmaydi — shuning
    // uchun u ham majburiy, izoh emas.
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error(
        `image-redraw.json: "${sourceId}" uchun reason yozilmagan — har ` +
          `rad etishning sababi ko'rsatilishi shart`,
      );
    }
    if (typeof de !== 'string' || de.trim() === '') {
      throw new Error(`image-redraw.json: "${sourceId}" uchun de yozilmagan`);
    }
    map[sourceId] = { attempt: attempt as number, de, reason };
  }
  return map;
}

export function loadRedrawMap(file: string): RedrawMap {
  return parseRedrawMap(JSON.parse(readFileSync(file, 'utf8')));
}

/** Rad etilmagan so'z uchun `0` — ya'ni birinchi, asl urug'. */
export function attemptFor(map: RedrawMap, sourceId: string): number {
  return map[sourceId]?.attempt ?? 0;
}
