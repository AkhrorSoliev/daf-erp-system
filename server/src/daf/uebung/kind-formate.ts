import type { FrageFormat } from './frage.types';

/**
 * The session kind's "flavour" — a PREFERENCE, not a strict split.
 *
 * Preferred formats are moved to the front of the pool and the rest fill
 * in when they run out (`seans.ts` keeps its own variety rules: cap per
 * format, no two in a row, at least `MIN_FORMATE` formats). When this was
 * written only 10 formats existed and a strict split would have left a
 * session with three, contradicting `MIN_FORMATE`. With the picture formats
 * the engine has 16 (not quite the course design's list: `WAHL` and
 * `HOEREN_TABELLE` are still missing) and SECTION_A / SECTION_B prefer six
 * each, so with enough material the ordering already behaves like a split —
 * and it still falls back when material is missing (a unit whose pictures
 * are not made yet simply asks other formats).
 *
 * `BRIDGE` has no preference on purpose: the bridge test must be mixed
 * (course design, section 3).
 */
const XARITA: Record<string, FrageFormat[]> = {
  SECTION_A: [
    'WORT_UZ',
    'PAAR',
    'ZUORDNEN',
    'AUDIO_WORT',
    'BILD_WORT',
    'AUDIO_BILD',
  ],
  SECTION_B: [
    'UZ_WORT',
    'ARTIKEL',
    'LUECKE',
    'SATZ_BAUEN',
    'WORT_TIPPEN',
    'BILD_TIPPEN',
  ],
  BRIDGE: [],
  // Yakuniy sinov (2026-09-14 dan dvigatelda): vaziyatga suyangan formatlar
  // oldinga suriladi — kurs dizaynidagi «Kurz und klar». Material unitning
  // hamma bo'limidan, seans 15 savol (`yakuniy-sinov.ts`).
  UNIT_TEST: [
    'REAKTION',
    'ZUORDNEN',
    'DIALOG_LUECKE',
    'SATZ_UEBERSETZEN',
    'HOEREN_WAHL',
  ],
};

export function bevorzugteFormate(kind: string | null): FrageFormat[] {
  if (!kind) return [];
  return XARITA[kind] ?? [];
}
