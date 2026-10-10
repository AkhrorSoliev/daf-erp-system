/**
 * Dialog voicing for `daf-gen-dialog-audio.ts`: one dialog at a time,
 * written to the manifest before the next one is paid for.
 */
import type { R2Uploader } from '../../src/daf-content/media/r2-uploader';
import {
  FalAblehnungError,
  type FalClient,
  type GeminiDialog,
} from '../../src/daf/media/fal-client';
import { neuerAudioSchluessel } from '../../src/daf/media/audio-keys';
import { POLSTER_KENNUNG } from '../../src/daf/media/audio-polster';
import {
  DIALOG_AUDIO_MODELL,
  dialogTextHash,
  type DialogAudioManifest,
} from '../../src/daf/inhalt/dialog-audio';
import type { Dialog } from '../../src/daf/inhalt/unit-inhalt.types';

/**
 * A content-checker refusal costs nothing and passes when the same request
 * is sent again (2026-09-25), so it is retried; no other error is.
 */
export const ABLEHNUNG_VERSUCHE = 3;

export interface DialogErgebnis {
  key: string;
  polster?: string;
  rohKey?: string;
  hoerspiel?: string;
}

export type DialogGenerierFn = (
  dialog: Dialog,
  anfrage: GeminiDialog,
) => Promise<DialogErgebnis>;

/**
 * Dialoglarni BIRIN-KETIN ishlaydi (2026-09-12 ko'rik, F2): har biri
 * `generiere` bilan yasaladi/yuklanadi, DARHOL manifestga (modeli bilan)
 * yoziladi va `speichereManifest` bilan diskka saqlanadi — keyingisiga
 * o'tishdan OLDIN. N-dialog yiqilsa xato tashqariga uloqtiriladi va sikl
 * TO'XTAYDI, lekin 1..N-1 allaqachon manifestda VA diskda saqlangan —
 * pul yo'qolmaydi, qayta yuritish faqat to'xtagan joydan davom etadi.
 *
 * `manifest` argument sifatida MUTATSIYA qilinadi (nusxa emas) — xato
 * tashlangandan keyin ham chaqiruvchi yozilgan yozuvlarni ko'ra oladi.
 */
export async function generiereDialogeNacheinander(
  dialoge: Dialog[],
  anfrageById: Map<string, GeminiDialog>,
  manifest: DialogAudioManifest,
  generiere: DialogGenerierFn,
  speichereManifest: (manifest: DialogAudioManifest) => void,
): Promise<void> {
  for (const d of dialoge) {
    let result: DialogErgebnis;
    try {
      result = await generiere(d, anfrageById.get(d.id)!);
    } catch (err) {
      throw new Error(
        `"${d.titelDe}" (${d.id}) yasalmadi/yuklanmadi: ${(err as Error).message}`,
      );
    }
    manifest[d.id] = {
      key: result.key,
      textHash: dialogTextHash(d.zeilen),
      ...(result.polster ? { polster: result.polster } : {}),
      modell: DIALOG_AUDIO_MODELL,
      ...(result.rohKey ? { rohKey: result.rohKey } : {}),
      ...(result.hoerspiel ? { hoerspiel: result.hoerspiel } : {}),
    };
    speichereManifest(manifest);
    console.log(
      `  ${d.id}: ${d.titelDe} → yasaldi, yuklandi, manifestga yozildi`,
    );
  }
}

/**
 * Bitta dialog uchun to'liq quvur: fal.ai orqali yasaydi (rad etilsa
 * shu so'rovni yana yuboradi), baytlarni yuklab oladi, JIMLIK QO'SHADI
 * (`polster`), YANGI tasodifiy kalit bilan R2'ga yuklaydi.
 *
 * Bog'liqliklar (fal, uploader, fetchFn, polster) INJEKTSIYA QILINADI —
 * testlar soxta (network'siz) nusxalar bilan ishlaydi. Kalit har doim
 * YANGI va tasodifiy (`neuerAudioSchluessel()`), demak R2'da hech qachon
 * oldindan mavjud bo'lmaydi.
 */
export function erstelleGeneriere(
  fal: Pick<FalClient, 'dialogGemini'>,
  uploader: Pick<R2Uploader, 'uploadBytes'>,
  fetchFn: typeof fetch,
  polster: (bytes: Buffer) => Promise<Buffer>,
  // A dialog with `hoerspiel` directions is mixed instead of padded (the
  // mix pads it the same way); null for every other dialog.
  mische?: (d: Dialog, roh: Buffer) => Promise<DialogErgebnis | null>,
  // Gemini voices two speakers per request; a dialog with more is made in
  // pieces and rebuilt (`mehrstimmig.ts`).
  mehrstimmig?: (d: Dialog, anfrage: GeminiDialog) => Promise<Buffer>,
): DialogGenerierFn {
  return async (d, anfrage) => {
    if (anfrage.speakers.length > 2) {
      if (!mehrstimmig) {
        throw new Error(
          `${d.id}: ${anfrage.speakers.length} ta gapiruvchi — Gemini bitta so'rovda faqat 2 tasini oladi`,
        );
      }
      const roh = await mehrstimmig(d, anfrage);
      const gemischt = mische ? await mische(d, roh) : null;
      if (gemischt) return gemischt;
      const key = neuerAudioSchluessel();
      await uploader.uploadBytes(key, await polster(roh));
      return { key, polster: POLSTER_KENNUNG };
    }
    let sourceUrl: string | undefined;
    for (let versuch = 1; sourceUrl === undefined; versuch++) {
      try {
        sourceUrl = await fal.dialogGemini(anfrage);
      } catch (err) {
        if (
          !(err instanceof FalAblehnungError) ||
          versuch >= ABLEHNUNG_VERSUCHE
        ) {
          throw err;
        }
        console.log(
          `    ${d.id}: fal.ai rad etdi (${versuch}-marta), yana so'rayapman`,
        );
      }
    }
    // Pul xavfsizligi: bu yerdan keyin HALI uchta bosqich bor (yuklab
    // olish, jimlik, R2'ga yuklash) — birortasi yiqilsa, ENDIGINA PULLIK
    // yasalgan audio hech qayerga yozilmagan bo'lardi. `sourceUrl`
    // fal.ai'ning VAQTINCHALIK ommaviy manzili (sir emas) — konsolga
    // chiqarilishi qo'lda tiklab olish imkonini beradi.
    console.log(`    ${d.id}: fal.ai natijasi — ${sourceUrl}`);
    const res = await fetchFn(sourceUrl);
    if (!res.ok) {
      throw new Error(`fal.ai audiosi yuklab olinmadi — HTTP ${res.status}`);
    }
    const roh = Buffer.from(await res.arrayBuffer());
    const gemischt = mische ? await mische(d, roh) : null;
    if (gemischt) return gemischt;
    const gepolstert = await polster(roh);
    const key = neuerAudioSchluessel();
    await uploader.uploadBytes(key, gepolstert);
    return { key, polster: POLSTER_KENNUNG };
  };
}
