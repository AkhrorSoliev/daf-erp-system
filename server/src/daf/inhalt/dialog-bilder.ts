import type { BildManifest } from '../media/bild-keys';
import { BILD_KEY } from './bild-plan';

/**
 * `content/daf/a1/dialog-bilder.json` — dialog id → the R2 key of the one
 * picture that shows the whole story (CEO, 2026-10-10). Random keys, like
 * word pictures: a key naming the dialog would leak nothing today, but the
 * same rule everywhere is the one nobody gets wrong.
 *
 * `dialogIds` are the dialogs of every written unit: the manifest is shared
 * by all units, so a key of another unit is not a typo.
 */
export function validateDialogBilder(
  manifest: BildManifest,
  dialogIds: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  for (const [id, key] of Object.entries(manifest)) {
    if (!dialogIds.has(id)) {
      problems.push(`${id}: dialog rasmi bor, lekin bunday dialog yo'q`);
    } else if (!BILD_KEY.test(key)) {
      problems.push(`${id}: dialog rasmi kaliti daf/bild/<hex>.jpg emas`);
    }
  }
  return problems;
}
