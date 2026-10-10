import { createHash } from 'crypto';
import type { Satz } from './unit-inhalt.types';

/**
 * Gap audiosi manifesti — `content/daf/a1/satz-audio.json` (`SATZ_HOEREN`).
 *
 * `key` tasodifiy (`audio-keys.ts`: gapdan hisoblangan kalit javobni
 * manzilda oshkor qilardi). `textHash` — ovoz YASALGAN paytdagi matnning
 * izi: gap keyin tahrirlansa, eski yozuv o'quvchiga hech qachon yetmaydi
 * (`satzAudioSchluessel`), qo'riqchi esa uni ko'rsatadi (`validateSatzAudio`).
 * Yasovchi: `scripts/daf-gen-satz-audio.ts`.
 */
export type SatzAudioManifest = Record<
  string,
  { key: string; textHash: string }
>;

/**
 * Gap matnining izi: `de`ning sha256 i, birinchi 16 belgi. `tts` bor
 * bo'lsa u ham qo'shiladi — ovoz aynan `tts`ni aytadi, bo'laklar esa
 * `de`dan; qaysi biri o'zgarsa ham yozuv eskiradi. `uz` kirmaydi.
 */
export function satzTextHash(satz: Pick<Satz, 'de' | 'tts'>): string {
  const matn = satz.tts ? `${satz.de}\n${satz.tts}` : satz.de;
  return createHash('sha256').update(matn, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Gapning R2 kaliti — FAQAT yozuv hozirgi matndan yasalgan bo'lsa. Eski
 * yozuv o'quvchi bo'laklardan tuza olmaydigan gapni aytardi: unda `null`,
 * savol qurilmaydi.
 */
export function satzAudioSchluessel(
  manifest: SatzAudioManifest,
  satz: Pick<Satz, 'sourceId' | 'de' | 'tts'>,
): string | null {
  const eintrag = manifest[satz.sourceId];
  return eintrag && eintrag.textHash === satzTextHash(satz)
    ? eintrag.key
    : null;
}

export function validateSatzAudio(
  saetze: Satz[],
  manifest: SatzAudioManifest,
): string[] {
  return saetze
    .filter(
      (s) => manifest[s.sourceId] && satzAudioSchluessel(manifest, s) === null,
    )
    .map(
      (s) =>
        `${s.sourceId}: gap matni o\`zgargan, audio eski matnni aytyapti — qayta yasang (daf:gen-satz-audio) yoki manifestdan o\`chiring`,
    );
}
