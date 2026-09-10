import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { validateWortliste, UNIT_WORDS_MAX } from './wortliste.validate';
import {
  validateEindeutigkeit,
  validateHilfswoerter,
} from './unit-inhalt.validate';
import type { WortlisteFile } from './wortliste.types';
import type {
  WoerterFile,
  Wort,
  GrammatikFile,
  RedemittelFile,
  DialogeFile,
  SaetzeFile,
  HilfswoerterFile,
} from './unit-inhalt.types';
import {
  sectionsInCourseOrder,
  knownWordsBySection,
  hilfsSet,
  unknownWordsIn,
} from './progression';
import type { KursFile } from '../kurs/kurs.types';
import type { GoetheFile } from './goethe-parse';

const A1 = join(__dirname, '..', '..', '..', 'content', 'daf', 'a1');
const read = <T>(...p: string[]): T =>
  JSON.parse(readFileSync(join(A1, ...p), 'utf8')) as T;

const kurs = read<KursFile>('kurs.json');
const goethe = read<GoetheFile>('goethe-a1.json');
const wortliste = read<WortlisteFile>('wortliste.json');
const hilfswoerter = read<HilfswoerterFile>('hilfswoerter.json');

/**
 * Matni YOZILGAN unitlar — `woerter.json` mavjudligi bo'yicha.
 *
 * Xaritada 12 unit bor, lekin matn bosqichma-bosqich yoziladi. Hali
 * yozilmagan unitni «bo'sh» deb yiqitish butun to'plamni 12 unit
 * tugagunga qadar qizil holatda ushlab turardi. Boshlangan unit esa
 * TO'LIQ tekshiriladi — beshta faylning hammasi talab qilinadi.
 */
const UNITS = kurs.units
  .map((u) => u.code)
  .filter((code) => existsSync(join(A1, code, 'woerter.json')));

/**
 * Bo'limlarning YAGONA, unitlar bo'ylab ketma-ket tartibi.
 *
 * Progressiya qoidasi unit chegarasida to'xtamaydi: u02 ning gapida u01
 * so'zi tanish, aksi esa yo'q. Shuning uchun «shu bo'limgacha tanish»
 * to'plami butun kurs bo'yicha hisoblanadi, unit ichida emas.
 */
const ALLE_SECTIONS = sectionsInCourseOrder(kurs);

/** Yozilgan hamma unitning so'zlari — kumulyativ to'plamning manbasi. */
const ALLE_WOERTER: Wort[] = UNITS.flatMap(
  (code) => read<WoerterFile>(code, 'woerter.json').woerter,
);

const HILFS = hilfsSet(hilfswoerter);

const KNOWN = knownWordsBySection(ALLE_SECTIONS, ALLE_WOERTER);

/** Matndagi notanish so'zlar — gap yasovchi skript bilan BIR XIL qoida. */
function unbekannteWoerter(sectionCode: string, text: string): string[] {
  return unknownWordsIn(text, KNOWN.get(sectionCode) ?? new Set(), HILFS);
}

const sectionsOf = (unit: string): string[] =>
  kurs.units.find((u) => u.code === unit)?.sections.map((s) => s.code) ?? [];

describe('A1 kontentining umumiy qoidalari', () => {
  it('kamida bitta unitning matni yozilgan', () => {
    // Aks holda pastdagi `describe.each` bloklari JIMGINA nol marta
    // ishlab, butun fayl "yashil" ko'rinardi.
    expect(UNITS.length).toBeGreaterThan(0);
  });

  it('so`z taqsimoti validatordan o`tadi', () => {
    // `validateWortliste` butun GoetheFile'ni oladi — sonlarning raqam
    // ko'rinishi (`isWordInGoetheA1` orqali) va yopiq guruhlar shu yerda,
    // markazlashgan holda tekshiriladi.
    expect(validateWortliste(wortliste, kurs, goethe)).toEqual([]);
  });

  it('yordamchi so`zlar ro`yxati o`z qoidalaridan o`tadi', () => {
    // Eng muhimi: ro'yxatda birorta unitning ASOSIY so'zi turmasin —
    // aks holda u so'z o'z bo'limidan oldin ishlatilganda qo'riqchi jim
    // qoladi.
    expect(validateHilfswoerter(hilfswoerter, ALLE_WOERTER)).toEqual([]);
  });
});

describe.each(UNITS)('%s — so`zlar', (unit) => {
  const woerter = read<WoerterFile>(unit, 'woerter.json');

  it('unitning beshta matn fayli ham bor', () => {
    // Boshlangan unit to'liq bo'lishi kerak: yarim yozilgan unit
    // ekranda material yetishmagan seans bo'lib chiqadi.
    const yetishmayapti = [
      'woerter.json',
      'grammatik.json',
      'redemittel.json',
      'dialoge.json',
      'saetze.json',
    ].filter((f) => !existsSync(join(A1, unit, f)));
    expect(yetishmayapti).toEqual([]);
  });

  it(`${UNIT_WORDS_MAX} ta asosiy so\`z bor`, () => {
    expect(woerter.woerter.filter((w) => w.core)).toHaveLength(UNIT_WORDS_MAX);
  });

  it('har asosiy so`z taqsimotda ham bor', () => {
    const inListe = new Set(
      wortliste.eintraege.map((e) => e.wort.toLowerCase()),
    );
    const yetishmayapti = woerter.woerter
      .filter((w) => w.core)
      .map((w) => w.de)
      .filter((de) => !inListe.has(de.toLowerCase()));
    expect(yetishmayapti).toEqual([]);
  });

  it('har so`zning o`zbekchasi bor', () => {
    expect(woerter.woerter.filter((w) => w.uz.trim() === '')).toEqual([]);
  });

  it('raqam yoki yakka harf bo`lsa tts yozilgan', () => {
    // TTS yakka harf va raqamni inglizcha o'qiydi — o'lchangan.
    const shubhali = woerter.woerter.filter(
      (w) => /\d/.test(w.de) || /^[A-ZÄÖÜ]$/.test(w.de.trim()),
    );
    expect(shubhali.filter((w) => !w.tts || w.tts.trim() === '')).toEqual([]);
  });

  it('sonlarda de — nemischa so`z, anzeige — raqam, ortiqcha tts yo`q', () => {
    // CEO qarori: yozma mashq `de` ustiga quriladi, shuning uchun `de`
    // o'rgatiladigan narsaning O'ZI (nemischa so'z) bo'lishi kerak —
    // raqam emas. Raqam faqat ko'rgazma sifatida `anzeige`da turadi.
    // `tts` esa faqat talaffuz yozma shakldan farq qilganda kerak —
    // "eins" kabi so'zlarni TTS o'z-o'zidan to'g'ri o'qiydi.
    const sonlar = woerter.woerter.filter((w) => w.anzeige !== undefined);
    for (const w of sonlar) {
      expect(/^\d+$/.test(w.de)).toBe(false);
      expect(/^\d+$/.test(w.anzeige ?? '')).toBe(true);
      expect(w.tts).toBeUndefined();
    }
  });

  it('harflarda anzeige yo`q — yozma shakl harfning o`zi', () => {
    // Raqamdan farqli o'laroq, harfning yozma shakli harfning o'zidan
    // boshqa narsa emas ("A" so'zi "A" harfidan boshqa emas) — shuning
    // uchun ko'rgazma-raqam ajralishi harflarga tegishli emas.
    const harflar = woerter.woerter.filter((w) => /^[A-ZÄÖÜ]$/.test(w.de));
    for (const w of harflar) {
      expect(w.anzeige).toBeUndefined();
      expect(w.tts).toBeTruthy();
    }
  });

  it('so`z kaliti takrorlanmaydi', () => {
    const ids = woerter.woerter.map((w) => w.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('har bo`limda tartib 1 dan boradi', () => {
    for (const code of sectionsOf(unit)) {
      const orders = woerter.woerter
        .filter((w) => w.section === code)
        .map((w) => w.order)
        .sort((a, b) => a - b);
      expect(orders).toEqual(orders.map((_, i) => i + 1));
    }
  });

  it('unit ichida takroriy matn yo`q', () => {
    // Jonli juftlash materialni MATN bo'yicha qidiradi, shuning uchun
    // ikkinchi nusxa noto'g'ri so'zni jazolab «tuzatish bepul»
    // qoidasini buzardi (`unit-inhalt.validate.ts`dagi izoh).
    const redemittelPath = join(A1, unit, 'redemittel.json');
    expect(
      validateEindeutigkeit(
        woerter,
        existsSync(redemittelPath)
          ? read<RedemittelFile>(unit, 'redemittel.json')
          : null,
      ),
    ).toEqual([]);
  });
});

describe.each(UNITS)('%s — grammatika va iboralar', (unit) => {
  const grammatik = read<GrammatikFile>(unit, 'grammatik.json');
  const redemittel = read<RedemittelFile>(unit, 'redemittel.json');
  const sections = sectionsOf(unit);

  it('har bo`limning qoidasi bor', () => {
    const bor = new Set(grammatik.regeln.map((r) => r.section));
    expect(sections.filter((code) => !bor.has(code))).toEqual([]);
  });

  it('har qoidada kamida 4 misol bor', () => {
    const kam = grammatik.regeln.filter((r) => r.beispiele.length < 4);
    expect(kam.map((r) => r.section)).toEqual([]);
  });

  it('qoida izohi o`zbekcha va bo`sh emas', () => {
    const bosh = grammatik.regeln.filter(
      (r) => r.erklaerungUz.trim() === '' || r.titelUz.trim() === '',
    );
    expect(bosh.map((r) => r.section)).toEqual([]);
  });

  it('har bo`limda kamida 3 ta ibora bor', () => {
    for (const code of sections) {
      const n = redemittel.phrasen.filter((p) => p.section === code).length;
      expect({ code, n }).toEqual({ code, n: expect.any(Number) });
      expect(n).toBeGreaterThanOrEqual(3);
    }
  });

  it('ibora va misollarning har so`zi shu bo`limda yoki oldin tanish', () => {
    const unbekannt = new Set<string>();
    for (const r of grammatik.regeln) {
      for (const b of r.beispiele) {
        for (const w of unbekannteWoerter(r.section, b.de)) {
          unbekannt.add(`${r.section}: ${w}`);
        }
      }
    }
    for (const p of redemittel.phrasen) {
      for (const w of unbekannteWoerter(p.section, p.de)) {
        unbekannt.add(`${p.section}: ${w}`);
      }
    }
    expect([...unbekannt]).toEqual([]);
  });
});

describe.each(UNITS)('%s — dialoglar', (unit) => {
  const dialoge = read<DialogeFile>(unit, 'dialoge.json');
  const sections = new Set(sectionsOf(unit));

  it('kamida 6 ta dialog bor', () => {
    expect(dialoge.dialoge.length).toBeGreaterThanOrEqual(6);
  });

  it('har dialog mavjud bo`limga tegishli', () => {
    const notat = dialoge.dialoge.filter((d) => !sections.has(d.section));
    expect(notat.map((d) => d.id)).toEqual([]);
  });

  it('har dialogda 4 dan 8 gacha satr bor', () => {
    // To'rttadan kam bo'lsa suhbat emas, sakkiztadan ko'p bo'lsa A1
    // uchun uzun: o'quvchi boshini yo'qotadi.
    const notri = dialoge.dialoge.filter(
      (d) => d.zeilen.length < 4 || d.zeilen.length > 8,
    );
    expect(notri.map((d) => `${d.id}:${d.zeilen.length}`)).toEqual([]);
  });

  it('har dialogda kamida ikki gapiruvchi bor', () => {
    const yakka = dialoge.dialoge.filter(
      (d) => new Set(d.zeilen.map((z) => z.sprecher)).size < 2,
    );
    expect(yakka.map((d) => d.id)).toEqual([]);
  });

  it('dialog kaliti takrorlanmaydi', () => {
    const ids = dialoge.dialoge.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('har satrning o`zbekchasi bor', () => {
    const bosh = dialoge.dialoge.flatMap((d) =>
      d.zeilen.filter((z) => z.uz.trim() === '').map(() => d.id),
    );
    expect(bosh).toEqual([]);
  });

  it('raqam yoki yakka harfli satrda tts yozilgan', () => {
    // TTS raqamni va yakka harfni inglizcha o'qiydi: `0176` → «Zero…»,
    // `Z` → «zee» («Zett» emas). Aytilishi qo'lda yoziladi, aks holda
    // telefon raqami yoki harf eshitilmaydi.
    const yakkaHarfBormi = (de: string): boolean =>
      de
        .replace(/[.,!?]/g, '')
        .split(/\s+/)
        .some((t) => /^[A-ZÄÖÜ]$/i.test(t));
    const shubhali = dialoge.dialoge.flatMap((d) =>
      d.zeilen
        .filter(
          (z) =>
            (/\d/.test(z.de) || yakkaHarfBormi(z.de)) &&
            (z.tts ?? '').trim() === '',
        )
        .map((z) => `${d.id}: ${z.de}`),
    );
    expect(shubhali).toEqual([]);
  });

  it('sarlavha va o`zbekcha matnda kirill yoki arab harfi yo`q', () => {
    // Loyiha qoidasi: o'zbekcha faqat lotin alifbosida yoziladi.
    // U+0400–U+052F — kirill (+ qo'shimchasi), U+0600–U+06FF — arab.
    const notLotin = /[Ѐ-ԯ؀-ۿ]/;
    const shubhali = dialoge.dialoge.flatMap((d) => {
      const topilgan: string[] = [];
      if (notLotin.test(d.titelUz)) topilgan.push(`${d.id}: titelUz`);
      for (const z of d.zeilen) {
        if (notLotin.test(z.uz)) topilgan.push(`${d.id}: ${z.uz}`);
      }
      return topilgan;
    });
    expect(shubhali).toEqual([]);
  });

  it('dialoglarda shu bo`lim yoki oldingisidan tashqari notanish so`z yo`q', () => {
    const unbekannt = new Set<string>();
    for (const d of dialoge.dialoge) {
      for (const z of d.zeilen) {
        for (const w of unbekannteWoerter(d.section, z.de)) {
          unbekannt.add(`${d.id}: ${w}`);
        }
      }
      if (unbekannteWoerter(d.section, d.titelDe).length > 0) {
        unbekannt.add(`titelDe: ${d.titelDe}`);
      }
    }
    expect([...unbekannt]).toEqual([]);
  });
});

describe.each(UNITS)('%s — gaplar', (unit) => {
  const saetze = read<SaetzeFile>(unit, 'saetze.json');
  const sections = sectionsOf(unit);

  it('har bo`limda kamida 6 gap bor', () => {
    for (const code of sections) {
      const n = saetze.saetze.filter((s) => s.section === code).length;
      expect(n).toBeGreaterThanOrEqual(6);
    }
  });

  it('gaplar uch-yetti so`z oralig`ida', () => {
    const notri = saetze.saetze.filter(
      (s) => s.wordCount < 3 || s.wordCount > 7,
    );
    expect(notri.map((s) => s.de)).toEqual([]);
  });

  it('wordCount haqiqiy so`z soniga teng', () => {
    const notri = saetze.saetze.filter(
      (s) =>
        s.wordCount !==
        s.de
          .replace(/[.,!?]/g, '')
          .trim()
          .split(/\s+/).length,
    );
    expect(notri.map((s) => s.de)).toEqual([]);
  });

  it('gap takrorlanmaydi', () => {
    const keys = saetze.saetze.map((s) =>
      s.de
        .toLowerCase()
        .replace(/[.,!?]/g, '')
        .trim(),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('har gapning o`zbekchasi bor', () => {
    expect(saetze.saetze.filter((s) => s.uz.trim() === '')).toEqual([]);
  });

  it('gap kaliti takrorlanmaydi', () => {
    const ids = saetze.saetze.map((s) => s.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gaplarda shu bo`lim yoki oldingisidan tashqari notanish so`z yo`q', () => {
    const unbekannt = new Set<string>();
    for (const s of saetze.saetze) {
      for (const w of unbekannteWoerter(s.section, s.de)) {
        unbekannt.add(`${s.sourceId}: ${w}`);
      }
    }
    expect([...unbekannt]).toEqual([]);
  });
});

/**
 * 1-unitning o'ziga xos, umumlashtirib bo'lmaydigan faktlari.
 *
 * Yuqoridagi umumiy qoidalar «sonlar shunday yoziladi» deydi; bu yerda
 * esa u01 da sonlar va harflar NECHTA ekani qotirilgan. Ular kontent
 * fakti, qoida emas — shuning uchun `describe.each` ichida emas.
 */
describe('u01 — o`ziga xos faktlar', () => {
  const woerter = read<WoerterFile>('u01', 'woerter.json');

  it('sonlar bo`limida 12 ta son bor', () => {
    expect(woerter.woerter.filter((w) => w.section === 'u01-s4')).toHaveLength(
      12,
    );
  });

  it('alifbo bo`limida 9 ta yakka harf bor', () => {
    const harflar = woerter.woerter.filter(
      (w) => w.section === 'u01-s5' && /^[A-ZÄÖÜ]$/.test(w.de),
    );
    expect(harflar).toHaveLength(9);
  });
});
