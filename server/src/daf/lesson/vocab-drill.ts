/**
 * Lug'at darsining mashqlari.
 *
 * Mashqlar DiB ning grammatika mashqlaridan EMAS, lug'atning o'zidan
 * tug'iladi. Sabab oddiy: bizda 1 843 ta so'z va ularning tarjimasi bor,
 * ya'ni javob allaqachon ma'lum. Grammatika mashqlari esa grammatika
 * darsiga tegishli va ular alohida joyda qoladi.
 *
 * Shu tufayli dars RO'YXAT bo'lishdan to'xtaydi: o'quvchi so'zlarni
 * ko'radi, keyin ularni tanishini tekshiradi.
 */

export type DrillKind = 'AUDIO_TO_WORD' | 'WORD_TO_UZ' | 'UZ_TO_WORD';

export interface DrillLexeme {
  id: number;
  de: string;
  uz: string | null;
  audioStartMs: number | null;
  audioEndMs: number | null;
}

export interface DrillQuestion {
  kind: DrillKind;
  lexemeId: number;
  /** Savol matni. `AUDIO_TO_WORD` da bo'sh — savol audioning o'zi. */
  prompt: string;
  options: string[];
  /** To'g'ri javob — SERVERDA qoladi, mijozga yuborilmaydi. */
  answer: string;
  /** Audio kerak bo'lsa: oraliq. */
  audio: { startMs: number; endMs: number } | null;
}

/** Bir savolda nechta variant. */
export const OPTION_COUNT = 4;

/**
 * Chalg'ituvchi variantlar shu DARSNING o'zidan olinadi.
 *
 * Butun lug'atdan olinsa, savol bilim emas — taxminni tekshirardi:
 * «Guten Morgen» ning yonida «der Kühlschrank» tursa, to'g'ri javob
 * mavzusiga qarab ko'rinib qoladi. Bir darsning so'zlari esa bir
 * mavzuda, ya'ni tanlov haqiqiy.
 */
export function pickDistractors(
  correct: string,
  pool: string[],
  count: number,
  rand: () => number,
): string[] {
  const others = pool.filter((x) => x !== correct);
  const picked: string[] = [];

  while (picked.length < count && others.length > 0) {
    const i = Math.floor(rand() * others.length);
    picked.push(others.splice(i, 1)[0]);
  }

  return picked;
}

/** Variantlarni aralashtiradi — to'g'ri javob doim bir joyda turmasin. */
export function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Dars uchun savollar to'plami.
 *
 * Uch xil savol beriladi va ularning tartibi ataylab shunday:
 *
 *   1. `AUDIO_TO_WORD` — eshitadi, so'zni tanlaydi (eng oson tanish)
 *   2. `WORD_TO_UZ`    — ko'radi, ma'nosini tanlaydi
 *   3. `UZ_TO_WORD`    — ma'nosini ko'radi, nemischasini tanlaydi (eng qiyin)
 *
 * Audiosiz so'z uchun `AUDIO_TO_WORD` berilmaydi — savol audioning o'zi,
 * va usiz savol yo'q. Tarjimasi yo'q so'z uchun tarjima savollari ham
 * berilmaydi: javobi bo'lmagan savol mashq emas.
 */
export function buildDrill(
  lexemes: DrillLexeme[],
  rand: () => number = Math.random,
): DrillQuestion[] {
  // Variant tanlash uchun kamida ikkita nomzod kerak, aks holda savol
  // o'z-o'zidan javob beradi.
  if (lexemes.length < 2) return [];

  const dePool = lexemes.map((l) => l.de);
  const uzPool = lexemes.map((l) => l.uz).filter((x): x is string => !!x);
  const out: DrillQuestion[] = [];

  const withAudio = lexemes.filter(
    (l) => l.audioStartMs !== null && l.audioEndMs !== null,
  );
  for (const l of withAudio) {
    out.push({
      kind: 'AUDIO_TO_WORD',
      lexemeId: l.id,
      prompt: '',
      options: shuffle(
        [l.de, ...pickDistractors(l.de, dePool, OPTION_COUNT - 1, rand)],
        rand,
      ),
      answer: l.de,
      audio: { startMs: l.audioStartMs!, endMs: l.audioEndMs! },
    });
  }

  const translated = lexemes.filter((l) => l.uz);
  if (uzPool.length >= 2) {
    for (const l of translated) {
      out.push({
        kind: 'WORD_TO_UZ',
        lexemeId: l.id,
        prompt: l.de,
        options: shuffle(
          [l.uz!, ...pickDistractors(l.uz!, uzPool, OPTION_COUNT - 1, rand)],
          rand,
        ),
        answer: l.uz!,
        audio: null,
      });
    }

    for (const l of translated) {
      out.push({
        kind: 'UZ_TO_WORD',
        lexemeId: l.id,
        prompt: l.uz!,
        options: shuffle(
          [l.de, ...pickDistractors(l.de, dePool, OPTION_COUNT - 1, rand)],
          rand,
        ),
        answer: l.de,
        audio: null,
      });
    }
  }

  return out;
}
