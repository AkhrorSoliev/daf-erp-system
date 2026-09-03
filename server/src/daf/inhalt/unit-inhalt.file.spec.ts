import { readFileSync } from 'fs';
import { join } from 'path';
import { validateWortliste } from './wortliste.validate';
import type { WortlisteFile } from './wortliste.types';
import type { WoerterFile } from './unit-inhalt.types';
import type { GrammatikFile, RedemittelFile } from './unit-inhalt.types';
import type { KursFile } from '../kurs/kurs.types';
import type { GoetheFile } from './goethe-parse';

const A1 = join(__dirname, '..', '..', '..', 'content', 'daf', 'a1');
const read = <T>(...p: string[]): T =>
  JSON.parse(readFileSync(join(A1, ...p), 'utf8')) as T;

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
    const harflar = woerter.woerter.filter((w) => w.section === 'u01-s5');
    expect(harflar).toHaveLength(10);
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
  const bekannt = new Set(
    woerter.woerter.flatMap((w) => w.de.toLowerCase().split(/\s+/)),
  );

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

  it('ibora va misollarning har so`zi tanish', () => {
    // Yordamchi so'zlar ro'yxati: ular hamma bo'limda ishlatiladi va
    // lug'atga kirmaydi.
    const hilfs = new Set([
      'ich','du','sie','er','es','wir','ihr','bin','bist','ist','sind','seid',
      'und','oder','nicht','ja','nein','wie','wo','was','wer','woher','das',
      'der','die','ein','eine','mein','dein','sehr','auch','bitte','danke',
      'in','aus','aus.','?','!',
      // Ismlar: namuna dialoglarda ishlatilgan atoqli otlar. Bular
      // lug'at so'zi emas — hech qanday tarjima yoki o'rgatishni talab
      // qilmaydi, faqat suhbatdosh nomi sifatida turibdi.
      'anna','timur','nodira','karimova','karimov',
      // kommen/wohnen fe'llarining ich/du shakllari — aynan shu
      // bo'limning grammatikasi (u01-s3), infinitiv allaqachon
      // lug'atda; tuslanish qoidaning o'zida (erklaerungUz) tushuntiriladi.
      'komme','kommst','wohne','wohnst',
      // u01-s5 grammatikasining nomi kurs.json'da aynan shu so'zlar
      // bilan berilgan: "buchstabieren, Wie schreibt man das?".
      'buchstabieren','schreibt','man',
    ]);
    const unbekannt = new Set<string>();
    const check = (s: string): void => {
      for (const w of s.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/)) {
        if (w === '') continue;
        if (bekannt.has(w) || hilfs.has(w)) continue;
        unbekannt.add(w);
      }
    };
    grammatik.regeln.forEach((r) => r.beispiele.forEach((b) => check(b.de)));
    redemittel.phrasen.forEach((p) => check(p.de));
    expect([...unbekannt]).toEqual([]);
  });
});
