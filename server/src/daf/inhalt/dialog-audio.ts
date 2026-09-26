import { createHash } from 'crypto';
import { TTS_GEMINI_MODEL } from '../media/fal-client';
import type { Dialog, DialogZeile } from './unit-inhalt.types';

/**
 * The one model every course dialog is voiced with (CEO, 2026-09-25: no
 * mixed models; 2026-09-26: Gemini's dialogue mode for dialogs). Each
 * manifest entry records the model that made it, so a dialog left on an
 * older model shows up in the content check instead of quietly sounding
 * different from its neighbours.
 */
export const DIALOG_AUDIO_MODELL = TTS_GEMINI_MODEL;

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
 *
 * `modell` is the fal endpoint that voiced the dialog. Entries from before
 * 2026-09-26 have none: they were made with ElevenLabs.
 */
export type DialogAudioManifest = Record<
  string,
  { key: string; textHash: string; polster?: string; modell?: string }
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
    if (eintrag.modell !== DIALOG_AUDIO_MODELL) {
      problems.push(
        `${d.id}: audio boshqa modelda yasalgan (${eintrag.modell ?? 'eski model'}) — kurs dialoglari faqat ${DIALOG_AUDIO_MODELL} da, qayta yasang`,
      );
    }
  }
  return problems;
}
