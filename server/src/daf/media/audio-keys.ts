import { randomBytes } from 'crypto';

/**
 * Audio fayl kaliti — R2 dagi manzilning bir qismi.
 *
 * WHY RANDOM. In `AUDIO_WORT` and `WORT_TIPPEN` the word IS the answer, so
 * a key derived from the `sourceId` would print the answer in the URL.
 * Picture keys are random for the same reason (`bild-keys.ts`). This comment
 * used to call word-derived picture keys safe; they are not — in `BILD_WORT`
 * the options are pictures, so a word in each URL names the right option.
 *
 * Xesh ham yordam bermaydi: `AUDIO_WORT` da 4 ta variant ekranda
 * ko'rinib turadi, ya'ni har birini xeshlab manzil bilan solishtirish
 * yetarli. Shuning uchun kalit so'z bilan hech qanday hisoblanadigan
 * bog'liqlikka ega emas — u sof tasodif.
 *
 * Kalit MANIFESTDA saqlanadi (`content/daf/a1/audio.json`), chunki
 * hisoblab topib bo'lmaydi. Saqlanmasa, skriptni qayta yuritish har
 * safar yangi fayl yasab, eskisini R2 da yetim qoldirardi.
 */
export function neuerAudioSchluessel(): string {
  return `daf/audio/${randomBytes(16).toString('hex')}.mp3`;
}

/** `sourceId` → R2 kaliti. Kontentda saqlanadi, git'ga chiqadi. */
export type AudioManifest = Record<string, string>;

/**
 * Manifestdan bitta so'zning kalitini oladi.
 *
 * `null` — audio hali yasalmagan. Bu XATO EMAS: audio bosqichma-bosqich
 * yasaladi (avval 1-unit, keyin qolgani), va audiosi yo'q so'zga audio
 * savol qurilmaydi.
 */
export function audioSchluesselFuer(
  manifest: AudioManifest,
  sourceId: string,
): string | null {
  return manifest[sourceId] ?? null;
}
