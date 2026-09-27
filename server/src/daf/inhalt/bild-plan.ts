import type { BildManifest } from '../media/bild-keys';

/**
 * `content/daf/a1/bild-plan.json` — written by a person and reviewed: what
 * to draw for a word (`szene`, English, for the image model) and whether
 * its picture names the word alone (`tippen`). The generated keys live
 * apart, in `bilder.json` (see `bild-keys.ts`), so a redraw never touches
 * the reviewed plan.
 */
export type BildPlan = Record<string, { szene: string; tippen: boolean }>;

const BILD_KEY = /^daf\/bild\/[0-9a-f]{32}\.jpg$/;

interface PlanWort {
  sourceId: string;
  artikel?: string | null;
}

/**
 * The plan and the manifest are shared by every unit, while `woerter` is
 * one unit's word file. Manifest entries of other units are skipped; plan
 * entries are expected to be filtered to the unit first (`bildPlanFuerUnit`),
 * because an unknown plan entry IS a problem — a typo in a `sourceId`.
 *
 * Returns the problems, one line each; empty means clean.
 */
export function validateBildPlan(
  plan: BildPlan,
  woerter: PlanWort[],
  manifest: BildManifest,
): string[] {
  const bySourceId = new Map(woerter.map((w) => [w.sourceId, w]));
  const problems: string[] = [];
  for (const [sourceId, eintrag] of Object.entries(plan)) {
    const wort = bySourceId.get(sourceId);
    if (!wort) {
      problems.push(
        `${sourceId}: rasm rejasida bor, lekin so'zlar faylida yo'q`,
      );
      continue;
    }
    if (!eintrag.szene.trim()) {
      problems.push(`${sourceId}: sahna (szene) bo'sh`);
    }
    if (eintrag.tippen && !wort.artikel) {
      problems.push(
        `${sourceId}: rasmga qarab yozish faqat artiklli otga (tippen: true artiklsiz so'zda)`,
      );
    }
  }
  // Two words on one picture would make the same image the right answer
  // for both — the picture options would stop telling them apart.
  const keyOwner = new Map<string, string>();
  for (const [sourceId, key] of Object.entries(manifest)) {
    if (!bySourceId.has(sourceId)) continue; // another unit's word
    if (!plan[sourceId]) {
      problems.push(
        `${sourceId}: rasm manifestda bor, lekin rasm rejasida yo'q`,
      );
    } else if (!BILD_KEY.test(key)) {
      problems.push(
        `${sourceId}: rasm kaliti tasodifiy emas (daf/bild/<hex>.jpg bo'lishi kerak)`,
      );
    } else if (keyOwner.has(key)) {
      problems.push(
        `${sourceId}: rasm kaliti boshqa so'zda ham bor (${keyOwner.get(key)}) — rasm variantlari bir xil bo'lib qoladi`,
      );
    } else {
      keyOwner.set(key, sourceId);
    }
  }
  return problems;
}

/** The plan entries of one unit (`u03` → keys starting with `u03-`). */
export function bildPlanFuerUnit(plan: BildPlan, unitCode: string): BildPlan {
  return Object.fromEntries(
    Object.entries(plan).filter(([sourceId]) =>
      sourceId.startsWith(`${unitCode}-`),
    ),
  );
}
