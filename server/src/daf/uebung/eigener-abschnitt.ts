import {
  materialSchluessel,
  type MaterialDialog,
  type MaterialPhrase,
  type MaterialSatz,
  type MaterialWort,
} from './frage.types';

/**
 * The material keys (`materialSchluessel`) of one section: its words,
 * sentences, phrases, and its dialogs' lines and listening questions. A
 * section lesson asks these first (`baueSeans` → `vorrang`); the pool is
 * cumulative, so without it an «Alifbo» lesson could ask no letter at all.
 * No section (the unit test) → an empty set.
 */
export function eigeneSchluessel(
  sectionCode: string | undefined,
  material: {
    coreWords: MaterialWort[];
    sentences: MaterialSatz[];
    phrases: MaterialPhrase[];
    dialoge: MaterialDialog[];
  },
): Set<string> {
  const out = new Set<string>();
  if (!sectionCode) return out;
  const eigen = (m: { sectionCode: string }) => m.sectionCode === sectionCode;
  for (const w of material.coreWords.filter(eigen)) {
    out.add(materialSchluessel('WORT', w.id));
  }
  for (const s of material.sentences.filter(eigen)) {
    out.add(materialSchluessel('SATZ', s.id));
  }
  for (const p of material.phrases.filter(eigen)) {
    out.add(materialSchluessel('PHRASE', p.id));
  }
  for (const d of material.dialoge.filter(eigen)) {
    for (const z of d.zeilen) out.add(materialSchluessel('DIALOGZEILE', z.id));
    for (const f of d.fragen) out.add(materialSchluessel('HOERFRAGE', f.id));
  }
  return out;
}
