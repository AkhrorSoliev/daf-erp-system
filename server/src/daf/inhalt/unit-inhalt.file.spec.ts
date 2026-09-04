import { readFileSync } from 'fs';
import { join } from 'path';
import { validateWortliste } from './wortliste.validate';
import type { WortlisteFile } from './wortliste.types';
import type { WoerterFile } from './unit-inhalt.types';
import type { GrammatikFile, RedemittelFile } from './unit-inhalt.types';
import type { DialogeFile } from './unit-inhalt.types';
import type { SaetzeFile } from './unit-inhalt.types';
import type { KursFile } from '../kurs/kurs.types';
import type { GoetheFile } from './goethe-parse';

const A1 = join(__dirname, '..', '..', '..', 'content', 'daf', 'a1');
const read = <T>(...p: string[]): T =>
  JSON.parse(readFileSync(join(A1, ...p), 'utf8')) as T;

/**
 * Har bo'lim uchun "shu vaqtgacha tanish" so'zlar to'plamini quradi:
 * bo'limning O'ZI va undan OLDINGI hamma bo'lim so'zlari — keyingi
 * bo'lim so'zlari EMAS. Progressiya qoidasi shuni talab qiladi: gapdagi
 * har mazmunli so'z shu bo'limda yoki oldin o'rganilgan bo'lishi kerak.
 *
 * Butun unit lug'atini bitta to'plamga yig'ib qo'yish (avvalgi holat)
 * buni tekshira olmasdi — oxirgi bo'limning so'zi birinchi bo'limda
 * ishlatilsa ham "tanish" chiqardi.
 */
function knownWordsBySection(
  sections: string[],
  woerter: WoerterFile,
): Map<string, Set<string>> {
  const orderOf = new Map(sections.map((code, i) => [code, i]));
  const result = new Map<string, Set<string>>();
  for (const code of sections) {
    const maxOrder = orderOf.get(code) as number;
    const known = new Set<string>();
    for (const w of woerter.woerter) {
      const wOrder = orderOf.get(w.section);
      if (wOrder !== undefined && wOrder <= maxOrder) {
        for (const tok of w.de.toLowerCase().split(/\s+/)) known.add(tok);
      }
    }
    result.set(code, known);
  }
  return result;
}

describe('1-unitning so`zlari', () => {
  const kurs = read<KursFile>('kurs.json');
  const goethe = read<GoetheFile>('goethe-a1.json');
  const wortliste = read<WortlisteFile>('wortliste.json');
  const woerter = read<WoerterFile>('u01', 'woerter.json');

  it('taqsimot validatordan o`tadi', () => {
    // `validateWortliste` butun GoetheFile'ni oladi — sonlarning raqam
    // ko'rinishi (`isWordInGoetheA1` orqali) va yopiq guruhlar shu yerda,
    // markazlashgan holda tekshiriladi. Chaqiruv nuqtasida hech qanday
    // qo'shimcha "boyitish" kerak emas.
    expect(validateWortliste(wortliste, kurs, goethe)).toEqual([]);
  });

  it('1-unitda 50 ta asosiy so`z bor', () => {
    expect(woerter.woerter.filter((w) => w.core)).toHaveLength(50);
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
    // "eins" kabi so'zlarni TTS o'z-o'zidan to'g'ri o'qiydi, shuning
    // uchun bu yerda ortiqcha.
    const sonlar = woerter.woerter.filter((w) => w.section === 'u01-s4');
    expect(sonlar).toHaveLength(12);
    for (const w of sonlar) {
      expect(/^\d+$/.test(w.de)).toBe(false);
      expect(w.anzeige).toBeDefined();
      expect(/^\d+$/.test(w.anzeige ?? '')).toBe(true);
      expect(w.tts).toBeUndefined();
    }
  });

  it('harflarda anzeige yo`q — yozma shakl harfning o`zi', () => {
    // Raqamdan farqli o'laroq, harfning yozma shakli harfning o'zidan
    // boshqa narsa emas ("A" so'zi "A" harfidan boshqa emas) — shuning
    // uchun ko'rgazma-raqam ajralishi harflarga tegishli emas.
    //
    // u01-s5 endi faqat harflardan iborat emas — "buchstabieren"
    // (harflab aytmoq) fe'li ham shu bo'limda, chunki bo'lim nomining
    // o'zi shu fe'l bilan atalgan. Shuning uchun bu yerda faqat yakka
    // harf yozuvlari (`de` bitta lotin harfi) ajratib olinadi.
    const harflar = woerter.woerter.filter(
      (w) => w.section === 'u01-s5' && /^[A-ZÄÖÜ]$/.test(w.de),
    );
    expect(harflar).toHaveLength(9);
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
    for (const s of kurs.units[0].sections) {
      const orders = woerter.woerter
        .filter((w) => w.section === s.code)
        .map((w) => w.order)
        .sort((a, b) => a - b);
      expect(orders).toEqual(orders.map((_, i) => i + 1));
    }
  });
});

describe('1-unitning grammatikasi va iboralari', () => {
  const kurs = read<KursFile>('kurs.json');
  const woerter = read<WoerterFile>('u01', 'woerter.json');
  const grammatik = read<GrammatikFile>('u01', 'grammatik.json');
  const redemittel = read<RedemittelFile>('u01', 'redemittel.json');

  const sections = kurs.units[0].sections.map((s) => s.code);

  it('har bo`limning qoidasi bor', () => {
    expect(grammatik.regeln.map((r) => r.section).sort()).toEqual(
      [...sections].sort(),
    );
  });

  it('har qoidada kamida 4 misol bor', () => {
    const kam = grammatik.regeln.filter((r) => r.beispiele.length < 4);
    expect(kam.map((r) => r.section)).toEqual([]);
  });

  it('qoida izohi o`zbekcha va bo`sh emas', () => {
    expect(
      grammatik.regeln.filter((r) => r.erklaerungUz.trim().length < 20),
    ).toEqual([]);
  });

  it('har bo`limda kamida 3 ta ibora bor', () => {
    for (const code of sections) {
      const n = redemittel.phrasen.filter((p) => p.section === code).length;
      expect(`${code}: ${n}`).toBe(`${code}: ${Math.max(n, 3)}`);
    }
  });

  it('ibora va misollarning har so`zi shu bo`limda yoki oldin tanish', () => {
    // Yordamchi so'zlar ro'yxati: ular hamma bo'limda ishlatiladi va
    // lug'atga kirmaydi. E'TIBOR: bu yerda unitning o'z ASOSIY
    // so'zlaridan BIRORTASI ham turmasligi kerak — aks holda o'sha so'z
    // o'z bo'limidan oldin ishlatilsa ham tekshiruv buni ko'rmaydi.
    const hilfs = new Set([
      'er',
      'es',
      'wir',
      'ihr',
      'bin',
      'bist',
      'ist',
      'sind',
      'seid',
      'und',
      'oder',
      'nicht',
      'ja',
      'nein',
      'das',
      'der',
      'die',
      'ein',
      'eine',
      'mein',
      'dein',
      'sehr',
      'auch',
      'bitte',
      'aus.',
      '?',
      '!',
      // Ismlar: namuna dialoglarda ishlatilgan atoqli otlar. Bular
      // lug'at so'zi emas — hech qanday tarjima yoki o'rgatishni talab
      // qilmaydi, faqat suhbatdosh nomi sifatida turibdi.
      'anna',
      'timur',
      'nodira',
      'karimova',
      'karimov',
      // kommen/wohnen fe'llarining ich/du shakllari — aynan shu
      // bo'limning grammatikasi (u01-s3), infinitiv allaqachon
      // lug'atda; tuslanish qoidaning o'zida (erklaerungUz) tushuntiriladi.
      'komme',
      'kommst',
      'wohne',
      'wohnst',
      // "man" — shaxssiz olmosh ("Wie schreibt man das?" iborasidagi
      // grammatik ko'makchi so'z), hech qanday bo'limga tegishli
      // lug'at emas. ("buchstabieren" endi u01-s5 lug'atining o'zida —
      // bo'lim nomining aynan shu fe'l bilan atalgani uchun haqiqiy
      // so'z sifatida qo'shildi, shuning uchun bu yerda emas.)
      'man',
    ]);
    const known = knownWordsBySection(sections, woerter);
    const unbekannt = new Set<string>();
    const check = (sectionCode: string, s: string): void => {
      const bekannt = known.get(sectionCode) ?? new Set<string>();
      for (const w of s
        .toLowerCase()
        .replace(/[.,!?]/g, '')
        .split(/\s+/)) {
        if (w === '') continue;
        if (bekannt.has(w) || hilfs.has(w)) continue;
        unbekannt.add(`${sectionCode}: ${w}`);
      }
    };
    grammatik.regeln.forEach((r) =>
      r.beispiele.forEach((b) => check(r.section, b.de)),
    );
    redemittel.phrasen.forEach((p) => check(p.section, p.de));
    expect([...unbekannt]).toEqual([]);
  });
});

describe('1-unitning dialoglari', () => {
  const kurs = read<KursFile>('kurs.json');
  const woerter = read<WoerterFile>('u01', 'woerter.json');
  const dialoge = read<DialogeFile>('u01', 'dialoge.json');

  const sectionsOrdered = kurs.units[0].sections.map((s) => s.code);
  const sections = new Set(sectionsOrdered);

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
    const notLotin = /[\u0400-\u052F\u0600-\u06FF]/;
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
    const known = knownWordsBySection(sectionsOrdered, woerter);
    const hilfs = new Set([
      'er',
      'es',
      'wir',
      'ihr',
      'bin',
      'bist',
      'ist',
      'sind',
      'seid',
      'und',
      'oder',
      'nicht',
      'ja',
      'nein',
      'das',
      'der',
      'die',
      'ein',
      'eine',
      'mein',
      'dein',
      'sehr',
      'auch',
      'bitte',
      'heisse',
      'heisst',
      'komme',
      'kommst',
      'wohne',
      'wohnst',
      'geht',
      'gut',
      'dir',
      'ihnen',
      'mir',
      'ist.',
      'hier',
      // Ismlar: dialoglarda gapiruvchilar bir-birini shu ism bilan
      // chaqiradi yoki o'zini shu ism bilan tanishtiradi (masalan,
      // "Ich bin Mia."). Bular lug'at so'zi emas — hech qanday tarjima
      // yoki o'rgatishni talab qilmaydi, faqat sobit obraz nomi sifatida
      // turibdi (xuddi grammatik/redemittel testidagi 'anna','timur' kabi).
      'mia',
      'jonas',
      'claudia',
      'markus',
      // u01-d6: Anna Weber o'z ismini aytadi va uni harflab tasdiqlaydi
      // (`Buchstabieren Sie bitte.` — nimani harflab aytish kerakligini
      // shu ism belgilaydi). `weber` familiya — lug'at so'zi emas.
      'anna',
      'weber',
    ]);
    const unbekannt = new Set<string>();
    for (const d of dialoge.dialoge) {
      const bekannt = known.get(d.section) ?? new Set<string>();
      for (const z of d.zeilen) {
        for (const w of z.de
          .toLowerCase()
          .replace(/[.,!?]/g, '')
          .split(/\s+/)) {
          if (w === '' || bekannt.has(w) || hilfs.has(w)) continue;
          unbekannt.add(`${d.id}: ${w}`);
        }
      }
      if (
        d.titelDe
          .toLowerCase()
          .replace(/[.,!?]/g, '')
          .split(/\s+/)
          .some((w) => w !== '' && !bekannt.has(w) && !hilfs.has(w))
      ) {
        unbekannt.add(`titelDe: ${d.titelDe}`);
      }
    }
    expect([...unbekannt]).toEqual([]);
  });
});

describe('1-unitning gaplari', () => {
  const kurs = read<KursFile>('kurs.json');
  const woerter = read<WoerterFile>('u01', 'woerter.json');
  const saetze = read<SaetzeFile>('u01', 'saetze.json');

  const sectionsOrdered = kurs.units[0].sections.map((s) => s.code);
  const sections = new Set(sectionsOrdered);

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
    const known = knownWordsBySection(sectionsOrdered, woerter);
    const hilfs = new Set([
      'er',
      'es',
      'wir',
      'ihr',
      'bin',
      'bist',
      'ist',
      'sind',
      'seid',
      'und',
      'oder',
      'nicht',
      'ja',
      'nein',
      'das',
      'der',
      'die',
      'ein',
      'eine',
      'mein',
      'dein',
      'sehr',
      'auch',
      'bitte',
      'heisse',
      'heisst',
      'komme',
      'kommst',
      'wohne',
      'wohnst',
      'geht',
      'gut',
      'dir',
      'ihnen',
      'mir',
      'hier',
    ]);
    const unbekannt = new Set<string>();
    for (const s of saetze.saetze) {
      const bekannt = known.get(s.section) ?? new Set<string>();
      for (const w of s.de
        .toLowerCase()
        .replace(/[.,!?]/g, '')
        .split(/\s+/)) {
        if (w === '' || bekannt.has(w) || hilfs.has(w)) continue;
        unbekannt.add(`${s.sourceId}: ${w}`);
      }
    }
    expect([...unbekannt]).toEqual([]);
  });
});
