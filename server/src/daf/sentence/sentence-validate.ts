/**
 * Yasalgan gapni o'quvchining so'z boyligiga solishtiradi.
 *
 * Bu qoida bo'lmasa gap mashq emas, to'siq bo'ladi: manbadagi A1
 * gaplarining atigi 27 % i o'quvchi bilgan so'zlardan tuzilgan edi.
 * Faza 1b dagi javob kaliti qo'riqchisi bilan bir ruhda — tekshirilmagan
 * kontent jimgina buzadi.
 */

const WORD = /[a-zA-ZäöüÄÖÜß]+/g;

/**
 * Matndagi so'zlar, kichik harfda, TAKRORLARI BILAN.
 *
 * Takror ataylab saqlanadi: bu funksiya gap uzunligini sanashga ham
 * xizmat qiladi, «Ich heiße Anna und ich komme aus Anna» esa sakkiz
 * so'z, olti emas.
 */
export function wordsOf(text: string): string[] {
  return (text.match(WORD) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1);
}

/**
 * Muntazam fe'lning hozirgi zamondagi shakllari.
 *
 * Lug'atda fe'l INFINITIVDA turadi (`wohnen`), o'quvchi esa gapda uni
 * tuslaydi (`Ich wohne`). Faqat yozilgan shaklni tanish deb bilsak,
 * tabiiy gap yasashning imkoni qolmaydi — 1-bo'limdagi o'lchov shuni
 * ko'rsatdi: rad etishlarning yarmi `wohne`, `gehe`, `finde`, `geht`
 * kabi qonuniy shakllar edi, va modelga infinitiv bilan undovdan
 * boshqa material qolmasdi.
 *
 * Qamrov ATAYLAB tor: faqat muntazam tuslanish. Ot ko'pligi, sifat
 * kelishigi va o'zak unlisining o'zgarishi (`fahren → fährt`) bu yerda
 * yo'q — ular alohida va kattaroq ish.
 *
 * Ot va sifat ham `-n` ga tugashi mumkin (`Morgen`, `schön`), ya'ni
 * to'plamga ma'nosiz shakllar ham tushadi (`morge`, `schöst`). Bu
 * zararsiz: nemis tilida bunday so'z yo'q, demak gapda uchramaydi.
 * Teskarisi — qonuniy shaklni rad etish — zararli edi, va biz uni
 * ko'rdik.
 */
function presentTenseForms(word: string): string[] {
  const stem = word.endsWith('en')
    ? word.slice(0, -2)
    : word.endsWith('n')
      ? word.slice(0, -1)
      : null;
  if (stem === null || stem.length < 2) return [];

  const forms = [stem + 'e', stem + 'st', stem + 't', stem + 'en'];
  // «arbeiten → du arbeitest, er arbeitet»: -t/-d bilan tugagan o'zak
  // qo'shimchadan oldin yordamchi «e» oladi. Bu ham muntazam tuslanish.
  if (stem.endsWith('t') || stem.endsWith('d')) {
    forms.push(stem + 'est', stem + 'et');
  }
  return forms;
}

/**
 * Lug'at yozuvidagi barcha so'z shakllari, kichik harfda.
 *
 * «Barcha shakllar» — yozuvda YOZILGANI va o'quvchi undan qonuniy
 * hosil qiladigani. Ikkinchisisiz funksiya o'z nomini oqlamasdi.
 */
export function wordFormsOf(de: string): string[] {
  return [...new Set(wordsOf(de).flatMap((w) => [w, ...presentTenseForms(w)]))];
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
  return wordsOf(sentence).filter(
    (w) => !allowed.has(w) && !FUNCTION_WORDS.has(w),
  );
}
