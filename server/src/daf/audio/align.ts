/**
 * Audio bo'laklarini bazadagi so'zlarga moslashtirish.
 *
 * Manbada audio BO'LIM darajasida: bitta mp3 o'ntacha so'zni ketma-ket
 * o'qiydi. So'z tugmasi ishlashi uchun har so'zning fayl ichidagi oralig'i
 * kerak.
 *
 * Bo'laklarni SANAB moslashtirib bo'lmaydi, va bu o'lchangan: birinchi
 * faylda 13 ta so'zga 15 ta bo'lak to'g'ri keldi. Sababi ikkita —
 * fayl bo'lim sarlavhasini o'qish bilan boshlanadi, va bitta yozuvda
 * ikkita ibora bo'lishi mumkin («Bis dann! / Bis später!»), audio esa
 * ularni alohida o'qiydi.
 *
 * Shuning uchun moslashtirish MATN bo'yicha ketadi. Topilmagan so'z
 * audiosiz qoladi — taxminiy oraliq «audio bor» deb ko'rsatib, boshqa
 * so'zni o'ynatardi, va bu xato jimgina bo'lardi.
 */

export interface AudioSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface AlignedWord {
  /** Bazadagi so'z (`DafLexeme.de`). */
  de: string;
  startMs: number | null;
  endMs: number | null;
}

/**
 * Solishtirish uchun matnni soddalashtiradi.
 *
 * Nemischa yozuvning uch xilligi bir xilga keltiriladi: `ß`/`ss`,
 * umlautlar (`ü`/`ue`), tinish belgilari va katta-kichik harf. Whisper
 * ularni bir xil yozmaydi — masalan «Tschüss» va «Tschuess» bir so'z.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bitta yozuvdagi bir necha ibora.
 *
 * «Bis dann! / Bis später!» — bitta lug'at yozuvi, lekin audioda ikkita
 * alohida ibora. Har birini alohida qidiramiz, keyin topilganlarini
 * birlashtiramiz.
 */
export function variantsOf(de: string): string[] {
  const parts = de
    .split('/')
    .map((v) => normalize(v))
    .filter(Boolean);
  return parts.length > 1 ? parts : parts.slice(0, 1);
}

/**
 * Yozuvni butunligicha, `/` siz.
 *
 * Audio ba'zan ikkala iborani BITTA bo'lakda o'qiydi («Wie heißt du? Wie
 * ist dein Name?»). Unda alohida variantning har biri to'liq matnga
 * yarmigacha o'xshaydi — ostonadan past, va yozuv audiosiz qolardi.
 * Shuning uchun butun matn ham nomzod sifatida sinaladi.
 */
export function wholeOf(de: string): string {
  return normalize(de.replace(/\//g, ' '));
}

/** Ikki satrning o'xshashligi, 0 dan 1 gacha (Levenshtein asosida). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }

  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** Shundan pastda moslik ishonchsiz — so'z audiosiz qoladi. */
export const MIN_SIMILARITY = 0.72;

/**
 * So'zlarni bo'laklarga moslashtiradi.
 *
 * Tartib SAQLANADI: audio ro'yxatni yuqoridan pastga o'qiydi, shuning
 * uchun qidiruv oldingi topilgan bo'lakdan KEYIN davom etadi. Butun
 * ro'yxat bo'ylab eng o'xshashini qidirish takroriy iboralarda («Guten
 * Morgen» va «Guten Tag») noto'g'ri bo'lakni tanlardi.
 */
export function alignWords(
  words: string[],
  segments: AudioSegment[],
): AlignedWord[] {
  const norm = segments.map((s) => ({ ...s, n: normalize(s.text) }));
  const out: AlignedWord[] = [];
  let from = 0;

  for (const de of words) {
    const variants = variantsOf(de);
    let first: AudioSegment | null = null;
    let last: AudioSegment | null = null;
    let cursor = from;

    // Avval butun matn: audio ikkala iborani bitta bo'lakda o'qigan
    // bo'lishi mumkin, va unda alohida variantlar ostonadan past qoladi.
    const whole = wholeOf(de);
    if (variants.length > 1) {
      let bestIdx = -1;
      let bestScore = MIN_SIMILARITY;
      for (let i = cursor; i < norm.length; i++) {
        const score = similarity(whole, norm[i].n);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) {
        out.push({
          de,
          startMs: norm[bestIdx].startMs,
          endMs: norm[bestIdx].endMs,
        });
        from = bestIdx + 1;
        continue;
      }
    }

    for (const variant of variants) {
      let bestIdx = -1;
      let bestScore = MIN_SIMILARITY;

      for (let i = cursor; i < norm.length; i++) {
        const score = similarity(variant, norm[i].n);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) continue;
      first ??= norm[bestIdx];
      last = norm[bestIdx];
      cursor = bestIdx + 1;
    }

    if (first && last) {
      out.push({ de, startMs: first.startMs, endMs: last.endMs });
      from = cursor;
    } else {
      // Topilmadi — audiosiz qoladi va kursor SURILMAYDI, chunki bu so'z
      // audioda umuman yo'q bo'lishi mumkin va keyingi so'zlar hali
      // oldinda turadi.
      out.push({ de, startMs: null, endMs: null });
    }
  }

  return out;
}
