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

function mischen<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Chalg'ituvchilar SHU bo'limning materialidan olinadi.
 *
 * Butun lug'atdan olinsa savol bilimni emas, taxminni tekshiradi:
 * «Guten Morgen» yonida «der Kühlschrank» tursa to'g'ri javob mavzusiga
 * qarab ko'rinib qoladi.
 */
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
 *
 * Olamlar ikkala tomonda (de va uz) noyob bo'lishi shart — juftlash
 * nojam bo'lmasligi uchun. To'rt shunday so'z yo'q bo'lsa null qaytaradi.
 * Dastlabki to'rtning dublikati bo'lsa, keyingisiga o'tadi, to'rttasini
 * topguncha yoki ro'yxat tugaguncha.
 *
 * `itemId` — ma'lumot sifatida saqlanadi (tanlangan to'rtning birinchisini).
 * Javob kelganda server savolni qayta qurmaydi; u har bir juftni
 * (de=uz) alohida tekshiradi. Shuning uchun savolni qayta qurishga `itemId`
 * kerak emas.
 */
export function paar(woerter: MaterialWort[], rnd: () => number): Frage | null {
  if (woerter.length < 4) return null;

  // Aralashtirilgan ro'yxatdan to'rt so'z tanla: ikkala tomonda (de va uz)
  // noyoblik tekshiriladi. Dublikat bo'lsa, keyingiga o'tadi.
  const shuffled = mischen(woerter, rnd);
  const selected: MaterialWort[] = [];
  const usedDe = new Set<string>();
  const usedUz = new Set<string>();

  for (const word of shuffled) {
    // Ushbu so'z tubidan noyobmi?
    if (!usedDe.has(word.de) && !usedUz.has(word.uz)) {
      selected.push(word);
      usedDe.add(word.de);
      usedUz.add(word.uz);

      if (selected.length === 4) {
        break;
      }
    }
  }

  // To'rt noyob so'z topildi?
  if (selected.length < 4) {
    return null;
  }

  const links = selected.map((w) => w.de);
  const rechts = mischen(selected.map((w) => w.uz), rnd);

  return {
    format: 'PAAR',
    itemType: 'WORT',
    itemId: selected[0].id,
    prompt: 'Juftlang',
    hilfe: null,
    options: [...links, ...rechts],
    richtig: selected.map((w) => `${w.de}=${w.uz}`).join('|'),
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
