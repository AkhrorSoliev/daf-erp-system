/**
 * Javobni solishtirish.
 *
 * NEGA KECHIRIMLI. Boshlovchi `tschüss` ni `tschuess` deb yozadi, chunki
 * klaviaturasida umlaut yo'q; `heißen` ni `heissen` deb yozadi, chunki
 * ß ni qayerdan olishni bilmaydi. Bularning ikkalasi ham NEMISCHADA
 * to'g'ri yozuv hisoblanadi. Ularni «xato» deb belgilash o'quvchini
 * imlo klaviaturasi bilan jazolash bo'lardi, tilni bilishi bilan emas.
 *
 * NEGA O'ZBEKCHA YOZDIRILMAYDI. Bu funksiya faqat NEMISCHA javob uchun.
 * O'zbekcha tarjimaning o'nlab to'g'ri shakli bor va to'g'ri javobni
 * «xato» deb belgilash o'quvchini eng tez qochiradigan narsa.
 */

const UMLAUT: Array<[RegExp, string]> = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
];

export function normalisieren(s: string): string {
  let out = s.toLowerCase().trim();
  for (const [from, to] of UMLAUT) out = out.replace(from, to);
  out = out.replace(/[.,!?;:]/g, '');
  out = out.replace(/\s+/g, ' ');
  return out.trim();
}

/**
 * `akzeptiert` — materialda yozilgan QO'SHIMCHA to'g'ri javoblar.
 * Bo'sh javob har doim xato: «hech narsa yozmaslik» to'g'ri bo'la olmaydi.
 */
export function istRichtig(
  gegeben: string,
  richtig: string,
  akzeptiert: string[] = [],
): boolean {
  const g = normalisieren(gegeben);
  if (g === '') return false;
  return [richtig, ...akzeptiert].some((r) => normalisieren(r) === g);
}
