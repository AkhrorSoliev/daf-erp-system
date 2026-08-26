const NAMED: Record<string, string> = {
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  bull: '•',
  hellip: '…',
  // Talaffuz sahifalari fonetik belgilarni HTML nom-entity sifatida beradi:
  // 3- va 6-boblarda IPA'ga yaqin belgilar (masalan `sch [&int;]`, `d - &delta;`)
  // shu ro'yxatda bo'lmagani uchun oldin dekodlanmay, xom holida chiqib ketgan edi.
  ccedil: 'ç',
  chi: 'χ',
  delta: 'δ',
  int: '∫',
  lowast: '∗',
  theta: 'θ',
};

/**
 * DiB `&#149;` kabi raqamli havolalarni ishlatadi. Bu Windows-1252 kodi,
 * Unicode emas: `String.fromCharCode(149)` ko'rinmaydigan BOSHQARUV belgisini
 * beradi, kerakli «•» ni emas. 128–159 oralig'i shuning uchun alohida
 * xaritalanadi — bu oraliq Unicode'da boshqaruv belgilariga ajratilgan va
 * hech bir veb-sahifa u yerga haqiqatan murojaat qilmaydi.
 */
const CP1252: Record<number, string> = {
  133: '…',
  145: '‘',
  146: '’',
  147: '“',
  148: '”',
  149: '•',
  150: '–',
  151: '—',
};

/**
 * DiB HTML 4.01 da yozilgan va nemis harflarini entity bilan beradi. To'liq
 * HTML dekoderi kerak emas — manbada uchraydigan belgilar to'plami cheklangan
 * va u o'zgarmaydi, chunki sayt 2009-yildan beri qotgan.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return CP1252[code] ?? String.fromCharCode(code);
    })
    .replace(/&([A-Za-z]+);/g, (m, name: string) => NAMED[name] ?? m);
}
