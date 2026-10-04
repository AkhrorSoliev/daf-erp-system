import type { KursFile } from '../kurs/kurs.types';
import { UNIT_WORDS_MAX, WORDS_MAX, WORDS_MIN } from '../kurs/kurs.validate';
import type { GoetheFile } from './goethe-parse';
import { isWordInGoetheA1, passtZumStamm } from './goethe-parse';
import type { HilfswoerterFile } from './unit-inhalt.types';
import type { WortlisteFile } from './wortliste.types';

export { UNIT_WORDS_MAX, WORDS_MAX, WORDS_MIN };

/**
 * So'z taqsimotini tekshiradi.
 *
 * Hajm qoidasi yozuvi bor bo'limga qo'llanadi: reja butun A1 ni tutadi
 * (ADR-0071), `nachtrag` so'zlari ham hisobda.
 *
 * The third argument is the whole `GoetheFile`: whether a word is on the
 * Goethe list is decided by `isWordInGoetheA1` alone (spelling variants,
 * homographs, stems like `dies-`, the word groups), not by each caller.
 * With `hilfs` it also refuses a word that is both drilled and a helper word.
 */
export function validateWortliste(
  file: WortlisteFile,
  kurs: KursFile,
  goethe: GoetheFile,
  hilfs?: HilfswoerterFile,
): string[] {
  const problems: string[] = [];

  const unitOfSection = new Map<string, string>();
  for (const u of kurs.units) {
    for (const s of u.sections) unitOfSection.set(s.code, u.code);
  }

  const bySection = new Map<string, number>();
  const byUnit = new Map<string, number>();
  const seen = new Map<string, string>();

  for (const e of file.eintraege) {
    const isKnownSection = unitOfSection.has(e.section);

    if (!isKnownSection) {
      problems.push(`${e.wort}: xaritada yo\`q bo\`lim — ${e.section}`);
    }

    const prev = seen.get(e.wort.toLowerCase());
    if (prev !== undefined) {
      problems.push(`${e.wort}: ikki joyda — ${prev} va ${e.section}`);
    } else {
      seen.set(e.wort.toLowerCase(), e.section);
    }

    if (!isWordInGoetheA1(e.wort, goethe) && (e.grund ?? '').trim() === '') {
      problems.push(`${e.wort}: Goethe ro\`yxatida yo\`q va sababi yozilmagan`);
    }

    if (e.ausserhalbBudget && (e.grund ?? '').trim() === '') {
      problems.push(
        `${e.wort}: hajmdan tashqari (ausserhalbBudget), lekin sababi yozilmagan`,
      );
    }

    // Only count words in known sections; a word built from taught words
    // (dreizehn, einundzwanzig) is outside the budget.
    if (isKnownSection && !e.ausserhalbBudget) {
      bySection.set(e.section, (bySection.get(e.section) ?? 0) + 1);
      const unit = unitOfSection.get(e.section);
      if (unit !== undefined) byUnit.set(unit, (byUnit.get(unit) ?? 0) + 1);
    }
  }

  for (const a of file.ausgenommen ?? []) {
    if (a.grund.trim() === '') {
      problems.push(`${a.wort}: o\`rgatilmaydi, lekin sababi yozilmagan`);
    }
    if (seen.has(a.wort.toLowerCase())) {
      problems.push(`${a.wort}: ham rejada, ham o\`rgatilmaydiganlar ichida`);
    }
  }

  for (const h of hilfs?.eintraege ?? []) {
    const section = seen.get(h.wort.toLowerCase());
    if (section !== undefined) {
      problems.push(`${h.wort}: ham ${section} so\`zi, ham yordamchi so\`z`);
    }
  }

  for (const [code, n] of bySection) {
    if (n < WORDS_MIN || n > WORDS_MAX) {
      problems.push(
        `${code}: ${n} so\`z — ${WORDS_MIN}–${WORDS_MAX} bo\`lishi kerak`,
      );
    }
  }

  for (const [code, n] of byUnit) {
    if (n > UNIT_WORDS_MAX) {
      problems.push(
        `${code}: jami ${n} so\`z — ${UNIT_WORDS_MAX} so\`zdan ko\`p`,
      );
    }
  }

  return problems;
}

/**
 * Goethe A1 words the plan leaves out (ADR-0071: by the end of A1 every one
 * is taught). A word is planned when it, a spelling variant or a homograph
 * is a plan entry, a phrase entry's `deckt`, a helper word or a decided
 * exception (`ausgenommen`); a stem entry when a planned word is built on it.
 */
export function goetheOhnePlan(
  goethe: GoetheFile,
  file: WortlisteFile,
  hilfs: HilfswoerterFile,
): string[] {
  const geplant = [
    ...file.eintraege.flatMap((e) => [e.wort, ...(e.deckt ?? [])]),
    ...hilfs.eintraege.map((h) => h.wort),
    ...(file.ausgenommen ?? []).map((a) => a.wort),
  ];
  const klein = new Set(geplant.map((w) => w.toLowerCase()));
  return goethe.woerter
    .filter((g) =>
      [g.wort, ...(g.varianten ?? []), ...(g.auch ?? [])].every((form) =>
        form.endsWith('-')
          ? !geplant.some((w) => passtZumStamm(form, w))
          : !klein.has(form.toLowerCase()),
      ),
    )
    .map((g) => g.wort);
}

/**
 * A written unit's core words against its plan: `fehlt` — planned for one of
 * `sections` but not a core word there (`nachtrag` words are not due yet);
 * `ueberzaehlig` — a core word the plan does not put in that section.
 * Entries read `section|word`, lowercase.
 */
export function vergleicheMitPlan(
  woerter: Array<{ de: string; section: string; core: boolean }>,
  file: WortlisteFile,
  sections: string[],
): { fehlt: string[]; ueberzaehlig: string[] } {
  const imUnit = new Set(sections);
  const plan = new Set(
    file.eintraege
      .filter((e) => imUnit.has(e.section) && !e.nachtrag)
      .map((e) => `${e.section}|${e.wort.toLowerCase()}`),
  );
  const alle = new Set(
    file.eintraege.map((e) => `${e.section}|${e.wort.toLowerCase()}`),
  );
  const kern = new Set(
    woerter
      .filter((w) => w.core)
      .map((w) => `${w.section}|${w.de.toLowerCase()}`),
  );
  return {
    fehlt: [...plan].filter((k) => !kern.has(k)),
    ueberzaehlig: [...kern].filter((k) => !alle.has(k)),
  };
}
