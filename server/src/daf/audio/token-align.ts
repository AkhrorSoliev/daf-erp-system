import {
  normalize,
  similarity,
  MIN_SIMILARITY,
  type AlignedWord,
} from './align';

/**
 * So'zlarni TOKEN OQIMIDA qidirish.
 *
 * Birinchi versiya Whisper'ning bo'laklariga suyangan edi va bu xato
 * bo'lib chiqdi. Salomlashish faylida pauzalar uzun — Whisper har iborani
 * alohida bo'lak qilgan, va moslashtirish ishlagan. Ot-so'zlar faylida esa
 * bitta bo'lakka to'qqizta so'z tushgan:
 *
 *   0.00 → 27.90  «das Mittagessen, die Beilage, die Beilagen, der Döner…»
 *
 * Bunday bo'lakni bitta so'z bilan solishtirish har doim past baho beradi,
 * va 40 fayldan 17 tasida HECH NARSA topilmagan. Uch fayllik sinov buni
 * ko'rsatmagan — u faqat salomlashish tipidagi fayllarni qamragan.
 *
 * Shuning uchun bo'lak emas, TOKEN ishlatiladi: Whisper har token uchun
 * vaqt beradi, tokenlardan so'z oqimi quriladi, va lug'at yozuvi shu oqim
 * ichidan qidiriladi. Bo'lakning qanday kesilgani endi ahamiyatsiz.
 */

export interface Token {
  text: string;
  startMs: number;
  endMs: number;
}

export interface StreamWord {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Whisper qo'shadigan xizmat tokenlari — matnga kirmaydi.
 *
 * Ular ikki xil: `[_BEG_]` va VAQT tokenlari `[_TT_169]`. Ikkinchisi
 * raqam bilan keladi, va faqat harfli qolipni ushlagan birinchi versiya
 * ularni oddiy so'z deb qabul qilgan: normalizatsiyadan keyin `tt 169`
 * bo'lib oqimga kirib, har bir moslikni buzgan.
 */
const SPECIAL = /^\[_.+\]$/;

/**
 * Tokenlarni so'zlarga birlashtiradi.
 *
 * Whisper so'zni bo'g'inlarga bo'ladi (`Mitt` + `ag` + `essen`), va yangi
 * so'z BOSHIDAGI PROBEL bilan bildiriladi. Tinish belgisi so'z ochmaydi —
 * u oldingi so'zga qo'shiladi va normalizatsiyada yo'qoladi.
 */
export function tokensToWords(tokens: Token[]): StreamWord[] {
  const words: StreamWord[] = [];

  for (const t of tokens) {
    if (SPECIAL.test(t.text.trim())) continue;

    const startsWord = t.text.startsWith(' ');
    const text = normalize(t.text);
    if (!text) continue;

    if (startsWord || words.length === 0) {
      words.push({ text, startMs: t.startMs, endMs: t.endMs });
    } else {
      const last = words[words.length - 1];
      last.text += text;
      last.endMs = t.endMs;
    }
  }

  return words;
}

/**
 * Lug'at yozuvini oqimdan qidiradi.
 *
 * Yozuv bir necha so'zdan iborat bo'lishi mumkin («das Mittagessen»),
 * shuning uchun oyna kengligi yozuvning so'z soniga qarab tanlanadi va
 * atrofida bir so'z kengaytiriladi — Whisper artiklni tushirib qoldirishi
 * yoki qo'shib yuborishi mumkin.
 *
 * Qidiruv `fromIndex` dan boshlanadi va oldinga qarab ketadi: audio
 * ro'yxatni tartib bilan o'qiydi, va takroriy so'zlarni («die Beilage» va
 * «die Beilagen») orqaga qarab qidirish chalkashtirardi.
 */
export function findInStream(
  entry: string,
  stream: StreamWord[],
  fromIndex: number,
): { startMs: number; endMs: number; nextIndex: number } | null {
  const target = normalize(entry);
  if (!target) return null;

  const size = target.split(' ').length;
  let best: { score: number; i: number; len: number } | null = null;

  for (let i = fromIndex; i < stream.length; i++) {
    for (let len = Math.max(1, size - 1); len <= size + 1; len++) {
      if (i + len > stream.length) break;
      const window = stream
        .slice(i, i + len)
        .map((w) => w.text)
        .join(' ');
      const score = similarity(target, window);
      if (score >= MIN_SIMILARITY && (!best || score > best.score)) {
        best = { score, i, len };
      }
    }
  }

  if (!best) return null;
  return {
    startMs: stream[best.i].startMs,
    endMs: stream[best.i + best.len - 1].endMs,
    nextIndex: best.i + best.len,
  };
}

/**
 * Yozuvning asosiy qismi — qavsgacha.
 *
 * Lug'atda qavs ichida ko'plik shakli («die Dönerbude (Dönerbuden)») yoki
 * TAHRIRIY IZOH («das Gemüse (no plural)», «die Nudeln (plural only ?)»)
 * turadi. Ularni matnning bir qismi deb qidirish uch fayldagi eng qiyin
 * yozuvlarni topilmas qilgan edi: audio «die Dönerbude» deb o'qiydi,
 * qidiruv esa «die dönerbude dönerbuden» ni izlaydi.
 */
export function headOf(entry: string): string {
  return entry.replace(/\([^)]*\)/g, ' ').trim();
}

/**
 * Qavs ichidagi ko'plik shakli, agar u haqiqatan so'z bo'lsa.
 *
 * «(no plural)» va «(plural only ?)» — izoh, so'z emas. Ularni qidirish
 * oqimdan tasodifiy joyni topib, oraliqni buzardi.
 */
export function pluralOf(entry: string): string | null {
  const m = /\(([^)]*)\)/.exec(entry);
  if (!m) return null;
  const inner = m[1].trim();
  if (!inner || /plural|singular|\?/i.test(inner)) return null;
  return inner;
}

/**
 * Yozuvlarni token oqimiga moslashtiradi.
 *
 * `/` bilan ajratilgan yozuv («Bis dann! / Bis später!») ikkita ibora:
 * ikkalasi ham qidiriladi va natija ikkalasini qamrab oladi. Bittasi ham
 * topilmasa yozuv AUDIOSIZ qoladi — taxminiy oraliq boshqa so'zni
 * o'ynatardi.
 */
export function alignToStream(
  entries: string[],
  stream: StreamWord[],
): AlignedWord[] {
  const out: AlignedWord[] = [];
  let cursor = 0;

  for (const de of entries) {
    const variants = headOf(de)
      .split('/')
      .map((v) => v.trim())
      .filter(Boolean);
    let startMs: number | null = null;
    let endMs: number | null = null;
    let next = cursor;

    for (const variant of variants) {
      const hit = findInStream(variant, stream, next);
      if (!hit) continue;
      startMs ??= hit.startMs;
      endMs = hit.endMs;
      next = hit.nextIndex;
    }

    // Ko'plik shakli audioda ALOHIDA o'qiladi va u ham shu yozuvniki.
    // Darhol keyin kelsa, oraliq unga cho'ziladi.
    const plural = pluralOf(de);
    if (startMs !== null && plural) {
      const hit = findInStream(plural, stream, next);
      if (hit && hit.nextIndex - next <= 2) {
        endMs = hit.endMs;
        next = hit.nextIndex;
      }
    }

    out.push({ de, startMs, endMs });
    // Kursor faqat topilganda suriladi: topilmagan yozuv audioda umuman
    // bo'lmasligi mumkin, va keyingi yozuvlar hali oldinda turadi.
    if (startMs !== null) cursor = next;
  }

  return out;
}
