import { randomBytes } from 'crypto';

/**
 * Audio fayl kaliti — R2 dagi manzilning bir qismi.
 *
 * NEGA TASODIFIY, `media-keys.ts` dagi rasm kaliti kabi `sourceId` dan
 * EMAS. Rasm kaliti `u01-s1-hallo` → `daf/img/u01-s1-hallo.jpg` bo'lib
 * yasaladi va bu XAVFSIZ, chunki `BILD_WORT` da so'z SAVOL, rasm esa
 * javob — manzilda so'z turishi hech narsani ochmaydi.
 *
 * Audio buning TESKARISI: `AUDIO_WORT` va `WORT_TIPPEN` da so'z
 * javobning O'ZI. O'sha sxema to'g'ri javobni manzilda yozib berardi.
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
