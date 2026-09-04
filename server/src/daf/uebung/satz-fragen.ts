import type {
  Frage,
  MaterialPhrase,
  MaterialSatz,
  MaterialWort,
} from './frage.types';

function mischen<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Tinish belgisisiz so'zlar — gapni bo'laklashda ishlatiladi. */
function woerterVon(de: string): string[] {
  return de.replace(/[.,!?]/g, '').trim().split(/\s+/);
}

/**
 * Gapdan bo'limning bitta so'zini olib tashlaydi.
 *
 * Variant BERILMAYDI — javob yoziladi. Sabab: to'rt variantdan tanlash
 * grammatik shaklni emas, ko'rish xotirasini tekshiradi; `bin` va `bist`
 * orasidagi farqni bilish uchun uni YOZISH kerak.
 */
export function luecke(
  satz: MaterialSatz,
  kernwoerter: MaterialWort[],
  rnd: () => number,
): Frage | null {
  const woerter = woerterVon(satz.de);
  const treffer = kernwoerter.filter((k) =>
    woerter.some((w) => w.toLowerCase() === k.de.toLowerCase()),
  );
  if (treffer.length === 0) return null;

  const ziel = mischen(treffer, rnd)[0];
  const prompt = satz.de.replace(
    new RegExp(`\\b${ziel.de}\\b`, 'i'),
    '___',
  );
  if (prompt === satz.de) return null;

  return {
    format: 'LUECKE',
    itemType: 'SATZ',
    itemId: satz.id,
    prompt,
    hilfe: satz.uz,
    options: [],
    richtig: ziel.de,
    akzeptiert: [],
  };
}

/** Uch so'zdan kam gapda tartib tanlovi yo'q — savol ma'nosiz. */
export function satzBauen(satz: MaterialSatz, rnd: () => number): Frage | null {
  const woerter = woerterVon(satz.de);
  if (woerter.length < 3) return null;
  return {
    format: 'SATZ_BAUEN',
    itemType: 'SATZ',
    itemId: satz.id,
    prompt: satz.uz,
    hilfe: null,
    options: mischen(woerter, rnd),
    richtig: satz.de,
    akzeptiert: [],
  };
}

export function satzUebersetzen(
  ziel: MaterialSatz,
  andere: MaterialSatz[],
  rnd: () => number,
): Frage | null {
  const falsch = [
    ...new Set(
      andere.filter((s) => s.id !== ziel.id && s.uz !== ziel.uz).map((s) => s.uz),
    ),
  ];
  if (falsch.length < 3) return null;
  return {
    format: 'SATZ_UEBERSETZEN',
    itemType: 'SATZ',
    itemId: ziel.id,
    prompt: ziel.de,
    hilfe: null,
    options: mischen([ziel.uz, ...mischen(falsch, rnd).slice(0, 3)], rnd),
    richtig: ziel.uz,
    akzeptiert: [],
  };
}

/**
 * Vaziyat → mos ibora.
 *
 * Bir xil VAZIFADAGI ibora chalg'ituvchi bo'la olmaydi: ikki
 * salomlashish iborasining ikkalasi ham to'g'ri, ya'ni savolning bitta
 * javobi qolmaydi.
 */
export function reaktion(
  ziel: MaterialPhrase,
  andere: MaterialPhrase[],
  rnd: () => number,
): Frage | null {
  const falsch = [
    ...new Set(
      andere
        .filter((p) => p.id !== ziel.id && p.funktionUz !== ziel.funktionUz)
        .map((p) => p.de),
    ),
  ];
  if (falsch.length < 3) return null;
  return {
    format: 'REAKTION',
    itemType: 'PHRASE',
    itemId: ziel.id,
    prompt: ziel.funktionUz,
    hilfe: null,
    options: mischen([ziel.de, ...mischen(falsch, rnd).slice(0, 3)], rnd),
    richtig: ziel.de,
    akzeptiert: [],
  };
}
