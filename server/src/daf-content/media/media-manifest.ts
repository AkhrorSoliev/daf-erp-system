import type { AssetRef, DafDataset } from '../dataset.types';

/**
 * Dataset ichidagi barcha media havolalarini bitta ro'yxatga yig'adi.
 *
 * Kalit bo'yicha yagonalashtiradi: bir mp3 bir necha bo'limda uchrashi mumkin,
 * lekin R2'ga bir marta chiqadi.
 */
export function collectAssets(d: DafDataset): AssetRef[] {
  const byKey = new Map<string, AssetRef>();

  for (const s of d.sections) {
    if (s.audio) byKey.set(s.audio.key, s.audio);
  }
  for (const t of d.transcripts) {
    if (t.video) byKey.set(t.video.key, t.video);
  }
  // `d.videos` manbadagi HAR BIR videoni o'z ichiga oladi, transkriptli
  // videolar bilan birga — kalit bo'yicha yagonalashtirilgani uchun ustma-ust
  // tushgan yozuv ikki marta sanalmaydi.
  for (const v of d.videos) {
    byKey.set(v.key, v);
  }

  return [...byKey.values()];
}
