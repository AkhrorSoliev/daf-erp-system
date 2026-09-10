import type { Wort, HilfswoerterFile } from './unit-inhalt.types';
import type { KursFile } from '../kurs/kurs.types';

/**
 * Progressiya qoidasi: matndagi har so'z shu bo'limda yoki undan OLDIN
 * o'rgatilgan bo'lishi kerak.
 *
 * NEGA BITTA FAYL. Bu qoida ikki joyda kerak — gap yasovchi skript
 * nomzodlarni shu bilan filtrlaydi, `unit-inhalt.file.spec.ts` esa
 * faylga yozilganini shu bilan tekshiradi. Ilgari ikkisi ikki nusxa
 * ro'yxat saqlardi va nusxa "ataylab" deb izohlangan edi, lekin ular
 * allaqachon farq qilardi (skriptda `sprechen` yo'q, testda `man` yo'q).
 * Endi skript qabul qilgan gap testdan albatta o'tadi, chunki ikkalasi
 * BIR XIL funksiyani chaqiradi.
 *
 * CHEGARA UNIT EMAS, KURS. u02 ning gapida u01 so'zi tanish; aksi
 * emas. Shuning uchun bo'limlar `kurs.json` tartibida yagona
 * ketma-ketlikka yig'iladi.
 */
export function sectionsInCourseOrder(kurs: KursFile): string[] {
  return kurs.units.flatMap((u) => u.sections.map((s) => s.code));
}

/**
 * Har bo'lim uchun "shu vaqtgacha tanish" so'zlar to'plami.
 *
 * Butun unit lug'atini bitta to'plamga yig'ib qo'yish buni tekshira
 * olmasdi — oxirgi bo'limning so'zi birinchi bo'limda ishlatilsa ham
 * "tanish" chiqardi.
 */
export function knownWordsBySection(
  sectionsOrdered: string[],
  woerter: Wort[],
): Map<string, Set<string>> {
  const orderOf = new Map(sectionsOrdered.map((code, i) => [code, i]));
  const result = new Map<string, Set<string>>();

  for (const code of sectionsOrdered) {
    const maxOrder = orderOf.get(code) as number;
    const known = new Set<string>();
    for (const w of woerter) {
      const wOrder = orderOf.get(w.section);
      if (wOrder !== undefined && wOrder <= maxOrder) {
        for (const tok of w.de.toLowerCase().split(/\s+/)) known.add(tok);
      }
    }
    result.set(code, known);
  }

  return result;
}

/** Yordamchi so'zlar to'plami — progressiyadan ozod so'zlar. */
export function hilfsSet(file: HilfswoerterFile): Set<string> {
  return new Set(file.eintraege.map((e) => e.wort.toLowerCase()));
}

/** Matnni so'zlarga ajratadi — tinish belgilarisiz, kichik harfda. */
export function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .split(/\s+/)
    .filter((t) => t !== '');
}

/** Matndagi hali o'rgatilmagan so'zlar. Bo'sh massiv — matn toza. */
export function unknownWordsIn(
  text: string,
  known: Set<string>,
  hilfs: Set<string>,
): string[] {
  return tokensOf(text).filter((t) => !known.has(t) && !hilfs.has(t));
}
