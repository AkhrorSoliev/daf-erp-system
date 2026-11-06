import { satzTextHash } from './satz-audio';
import type { Phrase } from './unit-inhalt.types';

/**
 * Ibora audiosi manifesti — `content/daf/a1/phrase-audio.json`.
 *
 * Kalit — ibora kodi (`u06-s1-nach Hobbys fragen-1`), qiymat — gap audiosi
 * bilan bir xil: tasodifiy R2 kaliti va ovoz YASALGAN paytdagi matn izi.
 * Matn keyin tahrirlansa, eski yozuv o'quvchiga yetmaydi
 * (`phraseAudioSchluessel`), qo'riqchi esa uni ko'rsatadi
 * (`validatePhraseAudio`). Yasovchi: `scripts/daf-gen-phrase-audio.ts`.
 */
export type PhraseAudioManifest = Record<
  string,
  { key: string; textHash: string }
>;

/**
 * Har iboraning barqaror kodi. Bo'lim+funksiya ichida hisoblanadi (butun
 * massiv indeksi EMAS): funksiyaga ibora qo'shilsa-o'chirilsa keyingi
 * funksiyalarning kodi siljimaydi. Seed (`DafPhrase.code`) va audio yasovchi
 * BIR XIL kodni ishlatishi shart, shuning uchun hisob shu yerda.
 */
export function phraseCodesOf(
  phrasen: Pick<Phrase, 'section' | 'funktion'>[],
): string[] {
  const seq = new Map<string, number>();
  return phrasen.map((p) => {
    const key = `${p.section}::${p.funktion}`;
    const n = (seq.get(key) ?? 0) + 1;
    seq.set(key, n);
    return `${p.section}-${p.funktion}-${n}`;
  });
}

/** Matn izi gap bilan bir xil qoida: `de` va (bo'lsa) `tts`. */
export function phraseTextHash(phrase: Pick<Phrase, 'de' | 'tts'>): string {
  return satzTextHash(phrase);
}

/** Iboraning R2 kaliti — FAQAT yozuv hozirgi matndan yasalgan bo'lsa. */
export function phraseAudioSchluessel(
  manifest: PhraseAudioManifest,
  code: string,
  phrase: Pick<Phrase, 'de' | 'tts'>,
): string | null {
  const eintrag = manifest[code];
  return eintrag && eintrag.textHash === phraseTextHash(phrase)
    ? eintrag.key
    : null;
}

export function validatePhraseAudio(
  phrasen: Phrase[],
  manifest: PhraseAudioManifest,
): string[] {
  const codes = phraseCodesOf(phrasen);
  const problems: string[] = [];
  phrasen.forEach((p, i) => {
    const code = codes[i];
    if (manifest[code] && phraseAudioSchluessel(manifest, code, p) === null) {
      problems.push(
        `${code}: ibora matni o\`zgargan, audio eski matnni aytyapti — qayta yasang (daf:gen-phrase-audio) yoki manifestdan o\`chiring`,
      );
    }
  });
  return problems;
}
