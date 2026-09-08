import { normalisieren } from './antwort';
import {
  materialSchluessel,
  type Frage,
  type MaterialWort,
} from './frage.types';

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
  // `normalisieren` bilan solishtiriladi (nemischa maydonlar uchun ham
  // ishlaydi — imlo/tinish farqiga sezgir emas), chunki grading
  // (`istRichtig`) xuddi shu funksiya bilan solishtiradi. Xom teng emas
  // solishtirilsa, richtigdan faqat tinish belgisi bilan farq qiladigan
  // chalg'ituvchi ham panelga kirib, aslida TO'G'RI javob sifatida
  // baholanib qolardi.
  const kandidaten = andere
    .filter(
      (w) =>
        w.id !== ziel.id && normalisieren(feld(w)) !== normalisieren(richtig),
    )
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
    // `hilfe` ATAYLAB berilmaydi: `anzeige` raqam so'zlarida aynan
    // javobning o'zi (masalan `acht` uchun `8`). Uni ko'rsatish savolni
    // nemis tilini bilishdan mustaqil qilib qo'yardi — o'quvchi raqamni
    // o'qiy olsagina to'g'ri variantni topadi, nemischa so'zni bilmasa
    // ham. `anzeige` materialning bir qismi, savolning emas.
    hilfe: null,
    options: mischen([ziel.uz, ...falsch], rnd),
    richtig: ziel.uz,
    akzeptiert: [],
    belegteItems: [materialSchluessel('WORT', ziel.id)],
    audioUrl: null,
  };
}

export function uzWort(
  ziel: MaterialWort,
  andere: MaterialWort[],
  rnd: () => number,
): Frage | null {
  // Variantlar QUR'IY holda (`de`, artiklsiz) ko'rsatiladi. Artikl bilan
  // ko'rsatilsa, faqat ot bo'lgan so'z ikki so'zli («der Land» kabi)
  // chiqadi va boshqa uchtasi bitta so'zli qoladi — javob mazmunidan
  // emas, SHAKLIDAN aniqlanib qoladi. Jins `ARTIKEL` formati orqali
  // o'rgatiladi, bu yerda emas; shuning uchun artikl shakli yo'qolmaydi,
  // faqat `akzeptiert`ga tushadi — artikl bilan yozgan o'quvchi ham
  // to'g'ri hisoblanadi.
  const falsch = ablenker(ziel, andere, (w) => w.de, rnd);
  if (!falsch) return null;
  return {
    format: 'UZ_WORT',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: ziel.uz,
    hilfe: null,
    options: mischen([ziel.de, ...falsch], rnd),
    richtig: ziel.de,
    akzeptiert: ziel.artikel ? [anzeigen(ziel)] : [],
    belegteItems: [materialSchluessel('WORT', ziel.id)],
    audioUrl: null,
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
  const rechts = mischen(
    selected.map((w) => w.uz),
    rnd,
  );

  return {
    format: 'PAAR',
    itemType: 'WORT',
    itemId: selected[0].id,
    prompt: 'Juftlang',
    hilfe: null,
    options: [...links, ...rechts],
    richtig: selected.map((w) => `${w.de}=${w.uz}`).join('|'),
    akzeptiert: [],
    // To'rttasi ham "band": bu savol to'rtta so'zning tarjimasini
    // birdaniga ko'rsatadi, shuning uchun boshqa uchtasi ham xuddi
    // `itemId`dagi birinchi so'z kabi shu seansda ikkinchi marta
    // (masalan alohida `WORT_UZ`/`UZ_WORT` savoli sifatida) so'ralmasligi
    // kerak — ular allaqachon shu yerda javobi bilan ko'rsatilgan.
    belegteItems: selected.map((w) => materialSchluessel('WORT', w.id)),
    audioUrl: null,
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
    belegteItems: [materialSchluessel('WORT', ziel.id)],
    audioUrl: null,
  };
}

/**
 * R2 kalitini mijoz o'qiy oladigan to'liq manzilga aylantiradi.
 *
 * `audioWort`/`wortTippen` o'zi Config'ga bog'lanmaydi — bu funksiyalar
 * pure va DI'siz sinaladi (`wort-fragen.spec.ts`). Shuning uchun manzil
 * qurish qoidasi chaqiruvchidan (`UebungService`) parametr sifatida
 * KIRITILADI, xuddi `daf-portal-read.service.ts`/`daf-drill.service.ts`
 * dagi `mediaUrl` bilan bir xil qoida (`R2_PUBLIC_URL + '/' + kalit`) —
 * faqat shu yerda uchinchi nusxa yozilmasin deb, funksiya sifatida.
 */
export type MediaUrlResolver = (key: string) => string | null;

export function audioWort(
  ziel: MaterialWort,
  andere: MaterialWort[],
  rnd: () => number,
  mediaUrl: MediaUrlResolver,
): Frage | null {
  // Audiosi yo'q so'zga bu savol qurilmaydi. Shu qorovul tufayli
  // formatni «yoqish» bayrog'i kerak emas: audio yasalmagan bo'lsa
  // format o'z-o'zidan ishlamaydi.
  if (!ziel.audioKey) return null;
  // `R2_PUBLIC_URL` sozlanmagan bo'lsa `mediaUrl` `null` qaytaradi — bu
  // holat ATAYLAB xuddi audiosi yo'q so'z bilan bir xil munosabatda:
  // savol UMUMAN QURILMAYDI. Muqobili — bo'sh manzilni `<audio src>`ga
  // yubormoq — aynan shu tuzatilayotgan nosozlik (doimiy "Ovoz
  // yuklanmadi" xatosi), shuning uchun jimgina buzuq manzil chiqarish
  // o'rniga format shunchaki tanlanmaydi.
  const audioUrl = mediaUrl(ziel.audioKey);
  if (!audioUrl) return null;
  const falsch = ablenker(ziel, andere, (w) => w.de, rnd);
  if (!falsch) return null;
  return {
    format: 'AUDIO_WORT',
    itemType: 'WORT',
    itemId: ziel.id,
    // BO'SH: so'z javobning o'zi, uni ko'rsatish savolni yo'q qilardi.
    prompt: '',
    hilfe: null,
    options: mischen([ziel.de, ...falsch], rnd),
    richtig: ziel.de,
    akzeptiert: [],
    audioUrl,
    belegteItems: [materialSchluessel('WORT', ziel.id)],
  };
}

export function wortTippen(
  ziel: MaterialWort,
  _rnd: () => number,
  mediaUrl: MediaUrlResolver,
): Frage | null {
  if (!ziel.audioKey) return null;
  // Qarang `audioWort`dagi izoh — sozlanmagan `R2_PUBLIC_URL` audioKey
  // yo'qligi bilan BIR XIL yo'l bilan ko'riladi: savol qurilmaydi.
  const audioUrl = mediaUrl(ziel.audioKey);
  if (!audioUrl) return null;
  return {
    format: 'WORT_TIPPEN',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: '',
    hilfe: null,
    // Variant YO'Q: o'quvchi eshitib yozadi. Javobni `istRichtig`
    // tekshiradi va u umlautsiz yozuvni ham qabul qiladi.
    options: [],
    richtig: ziel.de,
    akzeptiert: [],
    audioUrl,
    belegteItems: [materialSchluessel('WORT', ziel.id)],
  };
}
