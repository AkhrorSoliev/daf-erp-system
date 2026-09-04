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
  return de
    .replace(/[.,!?]/g, '')
    .trim()
    .split(/\s+/);
}

/**
 * Gapdan bo'limning bitta so'zini olib tashlaydi.
 *
 * Nishonlash REGEX EMAS — TOKEN TENGLIGI orqali qilinadi. Sabab: `\b`
 * faqat ASCII harflarini "so'z belgisi" deb biladi. `über` yoki `groß`
 * kabi umlautli/ß so'zlarda chegaraning ikkala tomoni ham "so'z emas"
 * bo'lib chiqadi, ya'ni `\b` hech qachon topilmaydi va material bekorga
 * `null`ga chiqadi. Aksincha, `geht's` kabi apostrofli qisqartmada `\b`
 * "t" bilan apostrof orasida haqiqiy chegara ko'radi va `geht` so'zini
 * ICHKARIDAN topib, «___'s» kabi chala gap qoldiradi. Bundan tashqari,
 * so'zning o'zi regex maxsus belgisi bo'lsa, `RegExp` konstruktori
 * yiqilishi mumkin edi — bu faylning shartnomasi esa hech qachon
 * yiqilmaslik, faqat `null` qaytarish.
 *
 * Variant BERILMAYDI — javob yoziladi. Sabab: to'rt variantdan tanlash
 * grammatik shaklni emas, ko'rish xotirasini tekshiradi; `bin` va `bist`
 * orasidagi farqni bilish uchun uni YOZISH kerak.
 *
 * SAVOL O'ZLIGI SO'ZNIKI, GAPNIKI EMAS: bo'shatilgan token bitta LEKSEMA
 * bo'lgani uchun `itemType`/`itemId` o'sha SO'ZGA ishora qiladi (`SATZ`
 * emas). Shu tufayli javob har qanday boshqa so'z savoli kabi qayta
 * hisoblanadi (`richtig` — so'zning `de`si) va JAVOB TO'G'RI/XATO bo'lsa
 * ham o'sha so'zning Leitner holati yangilanadi — o'quvchi bo'sh joyni
 * to'ldirganda aslida so'zni bilish-bilmasligini ko'rsatgan bo'ladi.
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
  const zielIndex = woerter.findIndex(
    (w) => w.toLowerCase() === ziel.de.toLowerCase(),
  );
  if (zielIndex === -1) return null;

  // Asl (tinish belgili) so'zlarni olamiz: faqat NISHON o'rindagi tokenni
  // ___ ga almashtiramiz, qolgan so'zlarning nuqta/vergul kabi tinish
  // belgisi o'zgarishsiz qoladi.
  const roh = satz.de.trim().split(/\s+/);
  const zielRoh = roh[zielIndex];
  const kernStart = zielRoh.toLowerCase().indexOf(ziel.de.toLowerCase());
  if (kernStart === -1) return null;
  roh[zielIndex] =
    zielRoh.slice(0, kernStart) +
    '___' +
    zielRoh.slice(kernStart + ziel.de.length);

  return {
    format: 'LUECKE',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: roh.join(' '),
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
      andere
        .filter((s) => s.id !== ziel.id && s.uz !== ziel.uz)
        .map((s) => s.uz),
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
 *
 * Bir xil NEMISCHA matnli ibora ham chalg'ituvchi bo'la olmaydi — vazifasi
 * boshqa bo'lsa ham. Aks holda to'g'ri javob `options` ichida ikki marta
 * chiqadi. `satzUebersetzen` va Vazifa 2ning `ablenker`i xuddi shu
 * tekshiruvni matn maydoni bo'yicha qiladi.
 */
export function reaktion(
  ziel: MaterialPhrase,
  andere: MaterialPhrase[],
  rnd: () => number,
): Frage | null {
  const falsch = [
    ...new Set(
      andere
        .filter(
          (p) =>
            p.id !== ziel.id &&
            p.funktionUz !== ziel.funktionUz &&
            p.de !== ziel.de,
        )
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
