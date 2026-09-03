import { readFileSync } from 'fs';
import { join } from 'path';
import { validateWortliste } from './wortliste.validate';
import type { WortlisteFile } from './wortliste.types';
import type { WoerterFile } from './unit-inhalt.types';
import type { KursFile } from '../kurs/kurs.types';
import type { GoetheFile, GoetheWort } from './goethe-parse';

const A1 = join(__dirname, '..', '..', '..', 'content', 'daf', 'a1');
const read = <T>(...p: string[]): T =>
  JSON.parse(readFileSync(join(A1, ...p), 'utf8')) as T;

/**
 * Sonlar (0-20) Goethe ro'yxatida SO'Z shaklida turibdi (`gruppen.zahlen`:
 * "null", "eins", ...), lekin bizning wortliste'da ular RAQAM ko'rinishida
 * yozilgan ("0", "1", ...) — chunki TTS raqamni inglizcha o'qiydi va
 * to'g'ri talaffuz `tts` maydonida alohida yoziladi. `gruppen.zahlen`ning
 * birinchi 21 yozuvi aynan 0 dan 20 gacha tartib bilan qo'lda kiritilgan
 * (barqaror), shuning uchun index qiymatning o'zi — shu asosda raqam
 * ko'rinishlarini ham "Goethe so'zi" sifatida qo'shamiz. Harflar bunga
 * kirmaydi: ular haqiqatan ham Goethe bosh so'zi emas.
 */
function goetheBilanRaqamlar(goethe: GoetheFile): GoetheWort[] {
  const raqamlar: GoetheWort[] = (goethe.gruppen?.zahlen ?? [])
    .slice(0, 21)
    .map((_, i) => ({ artikel: null, wort: String(i) }));
  return [...goethe.words, ...raqamlar];
}

describe('1-unitning so`zlari', () => {
  const kurs = read<KursFile>('kurs.json');
  const goethe = read<GoetheFile>('goethe-a1.json');
  const wortliste = read<WortlisteFile>('wortliste.json');
  const woerter = read<WoerterFile>('u01', 'woerter.json');

  it('taqsimot validatordan o`tadi', () => {
    expect(validateWortliste(wortliste, kurs, goetheBilanRaqamlar(goethe))).toEqual([]);
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
