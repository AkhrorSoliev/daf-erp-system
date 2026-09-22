/**
 * `GET /daf/media/coverage` javobi — bevosita `Daf*` kontent jadvallaridan
 * hisoblangan unit → bo'lim media qamrovi. `MediaOverview` (media-types.ts)
 * dan farqi: u qo'lda yozilgan eski manifestni o'qiydi, bu esa bazani —
 * shuning uchun yangi audio/rasm yozilganda bu ko'rinish o'zi yangilanadi.
 */

/** So'z: audio VA rasm ikkalasi ham bo'lishi mumkin. */
export interface WordMediaCounts {
  total: number;
  withAudio: number;
  /** Rasm chizib bo'ladigan so'zlar soni — rasm nisbati SHUNGA nisbatan. */
  pictureEligible: number;
  withImage: number;
}

/** Gap, ibora, dialog qatori — faqat audio tashiydi. */
export interface AudioOnlyMediaCounts {
  total: number;
  withAudio: number;
}

export interface MediaSectionCoverage {
  sectionId: number;
  code: string;
  order: number;
  titleUz: string;
  words: WordMediaCounts;
  sentences: AudioOnlyMediaCounts;
  phrases: AudioOnlyMediaCounts;
  dialogLines: AudioOnlyMediaCounts;
}

export interface MediaUnitCoverage {
  unitId: number;
  code: string | null;
  order: number;
  titleUz: string;
  sections: MediaSectionCoverage[];
}

export interface MediaLevelCoverage {
  level: string;
  units: MediaUnitCoverage[];
}

export interface MediaCoverageOverview {
  levels: MediaLevelCoverage[];
}
