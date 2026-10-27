import { SAVOL_SONI } from './jang-qoidalari';

export type JangSavolTuri = 'CHOOSE' | 'TYPE' | 'LISTEN';

export interface SavolNomzodi {
  id: number;
  kind: JangSavolTuri;
  oxirgiKorilgan: Date | null;
}

/** 6 savoldan: ~50 % tanlash, ~35 % yozish, ~15 % eshitish (spec §4). */
const TUR_REJASI: ReadonlyArray<[JangSavolTuri, number]> = [
  ['CHOOSE', 3],
  ['TYPE', 2],
  ['LISTEN', 1],
];

export function aralashtir<T>(
  xs: readonly T[],
  rng: () => number = Math.random,
): T[] {
  const ys = [...xs];
  for (let i = ys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [ys[i], ys[j]] = [ys[j], ys[i]];
  }
  return ys;
}

/**
 * Avval yaqinda ko'rilmaganlardan tur rejasi bo'yicha, keyin istalgan turdan.
 * Baribir yetmasa — eng UZOQ vaqt oldin ko'rilganlar qaytadi: faqat u01 ni
 * o'tgan o'quvchida ~35 savol bor, kuniga 30 tasini ko'radi (spec §4).
 */
export function savollarniTanla(
  nomzodlar: SavolNomzodi[],
  korilgan: Set<number>,
  rng: () => number = Math.random,
): number[] {
  const yangi = aralashtir(
    nomzodlar.filter((n) => !korilgan.has(n.id)),
    rng,
  );
  const tanlangan: number[] = [];
  for (const [tur, soni] of TUR_REJASI) {
    for (const n of yangi.filter((x) => x.kind === tur).slice(0, soni))
      tanlangan.push(n.id);
  }
  for (const n of yangi) {
    if (tanlangan.length >= SAVOL_SONI) break;
    if (!tanlangan.includes(n.id)) tanlangan.push(n.id);
  }
  const eski = nomzodlar
    .filter((n) => korilgan.has(n.id))
    .sort(
      (a, b) =>
        (a.oxirgiKorilgan?.getTime() ?? 0) - (b.oxirgiKorilgan?.getTime() ?? 0),
    );
  for (const n of eski) {
    if (tanlangan.length >= SAVOL_SONI) break;
    tanlangan.push(n.id);
  }
  return aralashtir(tanlangan.slice(0, SAVOL_SONI), rng);
}
