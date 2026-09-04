import type { Frage, MaterialWort } from './frage.types';

/**
 * So'zdan quriladigan savollar.
 *
 * Har quruvchi material yetmasa `null` qaytaradi — istisno tashlamaydi.
 * Sabab: yetmaslik XATO emas, u bo'limning tabiiy holati (sonlar
 * bo'limida artiklli ot yo'q). Seans quruvchisi `null` ni ko'rib
 * keyingi formatga o'tadi.
 */

/** Ot artikli bilan ko'rsatiladi: o'quvchi jinsni so'z bilan birga o'rganadi. */
function anzeigen(w: MaterialWort): string {
  return w.artikel ? `${w.artikel} ${w.de}` : w.de;
}

/**
 * Chalg'ituvchilar SHU bo'limning materialidan olinadi.
 *
 * Butun lug'atdan olinsa savol bilimni emas, taxminni tekshiradi:
 * «Guten Morgen» yonida «der Kühlschrank» tursa to'g'ri javob mavzusiga
 * qarab ko'rinib qoladi.
 */
function mischen<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function ablenker(
  ziel: MaterialWort,
  andere: MaterialWort[],
  feld: (w: MaterialWort) => string,
  rnd: () => number,
): string[] | null {
  const richtig = feld(ziel);
  const kandidaten = andere
    .filter((w) => w.id !== ziel.id && feld(w) !== richtig)
    .map(feld);
  const einmalig = [...new Set(kandidaten)];
  if (einmalig.length < 3) return null;
  return mischen(einmalig, rnd).slice(0, 3);
}

export function wortUz(
  ziel: MaterialWort,
  andere: MaterialWort[],
  rnd: () => number,
): Frage | null {
  const falsch = ablenker(ziel, andere, (w) => w.uz, rnd);
  if (!falsch) return null;
  return {
    format: 'WORT_UZ',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: anzeigen(ziel),
    hilfe: ziel.anzeige,
    options: mischen([ziel.uz, ...falsch], rnd),
    richtig: ziel.uz,
    akzeptiert: [],
  };
}

export function uzWort(
  ziel: MaterialWort,
  andere: MaterialWort[],
  rnd: () => number,
): Frage | null {
  const falsch = ablenker(ziel, andere, (w) => anzeigen(w), rnd);
  if (!falsch) return null;
  return {
    format: 'UZ_WORT',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: ziel.uz,
    hilfe: null,
    options: mischen([anzeigen(ziel), ...falsch], rnd),
    richtig: anzeigen(ziel),
    akzeptiert: [ziel.de],
  };
}

/**
 * To'rt juftni juftlash.
 *
 * To'g'ri javob bitta satr sifatida saqlanadi (`de=uz|de=uz|…`), chunki
 * javob solishtirish butun tuzilma bo'yicha emas, matn bo'yicha ishlaydi
 * va mijoz ham shu shaklda qaytaradi.
 */
export function paar(woerter: MaterialWort[], rnd: () => number): Frage | null {
  if (woerter.length < 4) return null;
  const vier = mischen(woerter, rnd).slice(0, 4);
  const links = vier.map((w) => w.de);
  const rechts = mischen(vier.map((w) => w.uz), rnd);
  return {
    format: 'PAAR',
    itemType: 'WORT',
    itemId: vier[0].id,
    prompt: 'Juftlang',
    hilfe: null,
    options: [...links, ...rechts],
    richtig: vier.map((w) => `${w.de}=${w.uz}`).join('|'),
    akzeptiert: [],
  };
}

export function artikel(ziel: MaterialWort): Frage | null {
  if (!ziel.artikel) return null;
  return {
    format: 'ARTIKEL',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: `___ ${ziel.de}`,
    hilfe: ziel.uz,
    options: ['der', 'die', 'das'],
    richtig: ziel.artikel,
    akzeptiert: [],
  };
}
