import {
  DIALOG_AUDIO_MODELL,
  dialogTextHash,
  type DialogAudioManifest,
} from '../inhalt/dialog-audio';
import type { Dialog } from '../inhalt/unit-inhalt.types';
import { geraeuschId, hoerspielHash, type HoerspielRegie } from './hoerspiel';

/**
 * What a realistic-audio run has to do, decided before anything is paid.
 * Only the Gemini voice and new sound effects cost money; changing the mix
 * of a dialog whose raw recording is kept (`rohKey`) is free.
 */

/** ElevenLabs sound effects v2 on fal, 2026-10-10. */
export const GERAEUSCH_PREIS_SEK = 0.002;
/** One run's limit: u04 needs ≈ 150 s ($0.30); a mistake stops at $0.40. */
export const GERAEUSCH_SEK_CHEGARASI = 200;

/** `content/daf/a1/geraeusche.json`: every paid sound, made once. */
export type GeraeuschManifest = Record<
  string,
  { key: string; sfx: string; sek: number; loop: boolean }
>;

export type RegieMitHoerspiel = Record<string, { hoerspiel?: HoerspielRegie }>;

export interface GeraeuschAuftrag {
  id: string;
  sfx: string;
  sek: number;
  loop: boolean;
}

function textAktuell(d: Dialog, manifest: DialogAudioManifest): boolean {
  const e = manifest[d.id];
  return (
    e?.textHash === dialogTextHash(d.zeilen) && e.modell === DIALOG_AUDIO_MODELL
  );
}

export function entscheideDialoge(
  dialoge: Dialog[],
  regie: RegieMitHoerspiel,
  manifest: DialogAudioManifest,
): { sprechen: Dialog[]; mischen: Dialog[] } {
  const sprechen: Dialog[] = [];
  const mischen: Dialog[] = [];
  const gesehen = new Set<string>();
  for (const d of dialoge) {
    if (gesehen.has(d.id)) continue;
    gesehen.add(d.id);
    const h = regie[d.id]?.hoerspiel;
    const e = manifest[d.id];
    if (!textAktuell(d, manifest)) sprechen.push(d);
    else if (h && e?.hoerspiel !== hoerspielHash(h)) {
      (e?.rohKey ? mischen : sprechen).push(d);
    }
  }
  return { sprechen, mischen };
}

/** Every sound the given dialogs use, as cache requests. */
export function alleGeraeusche(
  dialoge: Dialog[],
  regie: RegieMitHoerspiel,
): GeraeuschAuftrag[] {
  const out = new Map<string, GeraeuschAuftrag>();
  const add = (sfx: string, sek: number, loop: boolean) => {
    const id = geraeuschId({ sfx, sek, loop });
    if (!out.has(id)) out.set(id, { id, sfx: sfx.trim(), sek, loop });
  };
  for (const d of dialoge) {
    const h = regie[d.id]?.hoerspiel;
    if (!h) continue;
    if (h.atmo) add(h.atmo.sfx, h.atmo.sek, true);
    for (const g of h.geraeusche ?? []) add(g.sfx, g.sek, false);
  }
  return [...out.values()];
}

export function benoetigteGeraeusche(
  dialoge: Dialog[],
  regie: RegieMitHoerspiel,
  manifest: GeraeuschManifest,
): GeraeuschAuftrag[] {
  return alleGeraeusche(dialoge, regie).filter((g) => !manifest[g.id]);
}
