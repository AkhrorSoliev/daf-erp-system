/**
 * Yasalgan gapni o'quvchining so'z boyligiga solishtiradi.
 *
 * Bu qoida bo'lmasa gap mashq emas, to'siq bo'ladi: manbadagi A1
 * gaplarining atigi 27 % i o'quvchi bilgan so'zlardan tuzilgan edi.
 * Faza 1b dagi javob kaliti qo'riqchisi bilan bir ruhda — tekshirilmagan
 * kontent jimgina buzadi.
 */

const WORD = /[a-zA-ZäöüÄÖÜß]+/g;

/** Lug'at yozuvidagi barcha so'z shakllari, kichik harfda. */
export function wordFormsOf(de: string): string[] {
  return (de.match(WORD) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1);
}

/**
 * Artikl, olmosh, bog'lovchi, ko'makchi fe'l.
 *
 * Bular har bo'limda uchraydi va lug'at yozuvi sifatida alohida
 * o'rgatilmaydi, shuning uchun ularni notanish deb hisoblash validatorni
 * ishlatib bo'lmas holga keltirardi.
 */
export const FUNCTION_WORDS = new Set([
  'ich',
  'du',
  'er',
  'sie',
  'es',
  'wir',
  'ihr',
  'man',
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'einen',
  'einem',
  'einer',
  'mein',
  'dein',
  'sein',
  'ihre',
  'unser',
  'euer',
  'bin',
  'bist',
  'ist',
  'sind',
  'seid',
  'war',
  'waren',
  'habe',
  'hast',
  'hat',
  'haben',
  'habt',
  'und',
  'oder',
  'aber',
  'denn',
  'weil',
  'dass',
  'nicht',
  'kein',
  'keine',
  'in',
  'an',
  'auf',
  'zu',
  'von',
  'mit',
  'für',
  'aus',
  'bei',
  'nach',
  'über',
  'um',
  'ja',
  'nein',
  'sehr',
  'auch',
  'noch',
  'nur',
  'schon',
  'hier',
  'da',
  'dort',
  'wie',
  'wo',
  'was',
  'wer',
  'wann',
  'warum',
  'woher',
  'wohin',
]);

/**
 * Shu bo'lim va undan OLDINGI bo'limlarning barcha so'z shakllari.
 *
 * Kelajakdagi bo'limning so'zi qo'shilmaydi — o'quvchi uni hali
 * ko'rmagan.
 */
export function cumulativeVocab(
  units: { sections: string[] }[],
  entriesBySection: Map<string, string[]>,
  upToIndex: number,
): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= upToIndex && i < units.length; i++) {
    for (const s of units[i].sections) {
      for (const de of entriesBySection.get(s) ?? []) {
        for (const form of wordFormsOf(de)) out.add(form);
      }
    }
  }
  return out;
}

/** Gapdagi ruxsat etilmagan so'zlar. Bo'sh massiv = gap yaroqli. */
export function unknownWords(sentence: string, allowed: Set<string>): string[] {
  return (sentence.match(WORD) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1)
    .filter((w) => !allowed.has(w) && !FUNCTION_WORDS.has(w));
}
