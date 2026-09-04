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
 *
 * `itemId` — shu o'n so'zning bittasi. Bitta sovolning javob kilib bo'lganda
 * server uni qayta qurmaydi (D7): u shunchaki materialni bazadan o'qib va
 * javobni doimiylik asosida tekshiradi. Juftlash solishtirish chuponadi —
 * har bir juftning sahodasi alohida tekshiriladi, va `itemId` shu uchun kerak
 * emas — faqat ma'luma xususiy.
 */
export function paar(woerter: MaterialWort[], rnd: () => number): Frage | null {
  if (woerter.length < 4) return null;

  // Har bir noja'ri so'zlar to'plamini sinab ko'rish (shuffle bilan).
  // Agar birinchi jisim mos kelmasa, keyingi to'rtni sinab ko'ring.
  const shuffled = mischen(woerter, rnd);
  for (let start = 0; start <= shuffled.length - 4; start++) {
    const vier = shuffled.slice(start, start + 4);
    const des = vier.map((w) => w.de);
    const uzs = vier.map((w) => w.uz);

    // Ikkala tomonda noyob bo'lish kerak.
    const uniqueDes = new Set(des);
    const uniqueUzs = new Set(uzs);
    if (uniqueDes.size === 4 && uniqueUzs.size === 4) {
      const links = des;
      const rechts = mischen(uzs, rnd);
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
  }

  // No distinct four found.
  return null;
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
