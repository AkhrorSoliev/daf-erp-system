import { createHash } from 'crypto';
import type { Dialog, DialogZeile } from './unit-inhalt.types';

/**
 * Dialog audiosi manifesti — `content/daf/a1/dialog-audio.json`.
 *
 * `key` tasodifiy (so'z audiosidagi qoida, `audio-keys.ts`). `textHash`
 * — ovoz YASALGAN paytdagi matnning izi: matn keyin tahrirlansa
 * qo'riqchi yiqiladi, aks holda o'quvchi bir narsani eshitib, javobdan
 * keyin boshqa narsani o'qirdi.
 *
 * `polster` (Task 11e) — boshi/oxiriga jimlik qo'shilganini bildiradi:
 * qiymati `audio-polster.ts`dagi `POLSTER_KENNUNG` ("700/1000", ms).
 * Yo'q — hali ishlanmagan (eski yozuv yoki hali generatsiya qilinmagan);
 * `daf-polster-dialog-audio.ts` shu maydon orqali qayta ishlashdan
 * o'zini himoya qiladi.
 */
export type DialogAudioManifest = Record<
  string,
  { key: string; textHash: string; polster?: string }
>;

/**
 * Ovoz AYNAN nimani aytadi — shuning xeshi: gapiruvchi (obraz → ovoz)
 * va `tts ?? de` (aytiladigan matn). `uz` kirmaydi — u aytilmaydi.
 */
export function dialogTextHash(
  zeilen: Array<Pick<DialogZeile, 'sprecher' | 'de' | 'tts'>>,
): string {
  const matn = zeilen.map((z) => `${z.sprecher} ${z.tts ?? z.de}`).join('\n');
  return createHash('sha256').update(matn, 'utf8').digest('hex').slice(0, 16);
}

export function validateDialogAudio(
  dialoge: Dialog[],
  manifest: DialogAudioManifest,
): string[] {
  const problems: string[] = [];
  for (const d of dialoge) {
    const eintrag = manifest[d.id];
    if (!eintrag) continue;
    if (eintrag.textHash !== dialogTextHash(d.zeilen)) {
      problems.push(
        `${d.id}: dialog matni o\`zgargan, audio eski matnni aytyapti — qayta yasang yoki manifestdan o\`chiring`,
      );
    }
  }
  return problems;
}
