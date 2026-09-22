import type {
  AudioOnlyMediaCounts,
  MediaSectionCoverage,
  MediaUnitCoverage,
  WordMediaCounts,
} from "./media-coverage-types";

/**
 * `complete`/`partial`/`none` colour a badge; `na` means the denominator
 * itself is zero — no material exists yet, or (for rasm) no word in this
 * bo'lim is picturable. `na` must never render as "0/0 — yetishmayapti":
 * a word that isn't picturable and has no image is COMPLETE, not missing
 * (see the CLAUDE.md note on `picturable`).
 */
export type CoverageStatus = "complete" | "partial" | "none" | "na";

export function coverageStatus(have: number, total: number): CoverageStatus {
  if (total <= 0) return "na";
  if (have <= 0) return "none";
  if (have >= total) return "complete";
  return "partial";
}

/** `"12/53"` yoki, material yo'q bo'lsa, `"—"`. */
export function coverageLabel(have: number, total: number): string {
  if (total <= 0) return "—";
  return `${have}/${total}`;
}

const zeroWords = (): WordMediaCounts => ({
  total: 0,
  withAudio: 0,
  pictureEligible: 0,
  withImage: 0,
});
const zeroAudioOnly = (): AudioOnlyMediaCounts => ({ total: 0, withAudio: 0 });

export function sumWords(rows: WordMediaCounts[]): WordMediaCounts {
  return rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      withAudio: acc.withAudio + r.withAudio,
      pictureEligible: acc.pictureEligible + r.pictureEligible,
      withImage: acc.withImage + r.withImage,
    }),
    zeroWords(),
  );
}

export function sumAudioOnly(
  rows: AudioOnlyMediaCounts[],
): AudioOnlyMediaCounts {
  return rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      withAudio: acc.withAudio + r.withAudio,
    }),
    zeroAudioOnly(),
  );
}

/** Bo'limning barcha seksiyalari bo'yicha jamlangan qatorlar — unit sarlavhasidagi qisqa xulosa uchun. */
export interface UnitTotals {
  words: WordMediaCounts;
  sentences: AudioOnlyMediaCounts;
  phrases: AudioOnlyMediaCounts;
  dialogLines: AudioOnlyMediaCounts;
}

export function unitTotals(unit: MediaUnitCoverage): UnitTotals {
  return {
    words: sumWords(unit.sections.map((s) => s.words)),
    sentences: sumAudioOnly(unit.sections.map((s) => s.sentences)),
    phrases: sumAudioOnly(unit.sections.map((s) => s.phrases)),
    dialogLines: sumAudioOnly(unit.sections.map((s) => s.dialogLines)),
  };
}

/**
 * Bo'limda hali hech qanday material yo'qmi — bo'sh holatni ("hali
 * to'ldirilmagan") boshqacha ko'rsatish uchun, oddiy nol qamrovdan farqli.
 */
export function unitHasNoMaterial(unit: MediaUnitCoverage): boolean {
  if (unit.sections.length === 0) return true;
  const t = unitTotals(unit);
  return (
    t.words.total === 0 &&
    t.sentences.total === 0 &&
    t.phrases.total === 0 &&
    t.dialogLines.total === 0
  );
}

/**
 * Seksiyalar ichida ENG YOMON holatni topadi — unit sarlavhasidagi bitta
 * rangli belgi shu bo'yicha tanlanadi ("bu unitda diqqat talab qiladigan
 * narsa bormi?"). `na` eng past ustuvorlik — u kamchilik emas.
 */
const SEVERITY: Record<CoverageStatus, number> = {
  none: 3,
  partial: 2,
  complete: 1,
  na: 0,
};

export function worstStatus(statuses: CoverageStatus[]): CoverageStatus {
  let worst: CoverageStatus = "na";
  for (const s of statuses) {
    if (SEVERITY[s] > SEVERITY[worst]) worst = s;
  }
  return worst;
}

/**
 * Bitta bo'lim qatoridagi to'rtta ustunning holatini bir chaqiruvda beradi —
 * sahifa har birini alohida qayta hisoblamasin, va unit sarlavhasi bilan
 * bo'lim qatori bir xil mantiqni ishlatsin.
 */
export function sectionStatuses(section: MediaSectionCoverage): {
  wordsAudio: CoverageStatus;
  wordsImage: CoverageStatus;
  sentences: CoverageStatus;
  phrases: CoverageStatus;
  dialogLines: CoverageStatus;
} {
  return {
    wordsAudio: coverageStatus(section.words.withAudio, section.words.total),
    wordsImage: coverageStatus(
      section.words.withImage,
      section.words.pictureEligible,
    ),
    sentences: coverageStatus(section.sentences.withAudio, section.sentences.total),
    phrases: coverageStatus(section.phrases.withAudio, section.phrases.total),
    dialogLines: coverageStatus(
      section.dialogLines.withAudio,
      section.dialogLines.total,
    ),
  };
}
