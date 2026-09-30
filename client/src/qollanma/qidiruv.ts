import type { QollanmaSahifa } from "./turlar";

/** ʻ ʼ ' ' ` ´ — o'zbek lotinidagi apostrof variantlari. */
const APOSTROFLAR = /[ʻʼ''`´]/g;

export function normallashtir(matn: string): string {
  return matn.toLowerCase().replace(APOSTROFLAR, "'").replace(/\s+/g, " ").trim();
}

/**
 * Har so'z sarlavhada (2 ball) yoki qisqacha/kalit so'zda (1 ball) bo'lishi
 * shart. Teng balldagilar reyestr tartibida qoladi (sort barqaror).
 */
export function qidir(royxat: readonly QollanmaSahifa[], sorov: string): QollanmaSahifa[] {
  const sozlar = normallashtir(sorov).split(" ").filter(Boolean);
  if (sozlar.length === 0) return [];
  const baholangan: { sahifa: QollanmaSahifa; ball: number }[] = [];
  for (const sahifa of royxat) {
    const sarlavha = normallashtir(sahifa.sarlavha);
    const qolgani = normallashtir([sahifa.qisqacha, ...sahifa.kalitSozlar].join(" "));
    let ball = 0;
    for (const soz of sozlar) {
      if (sarlavha.includes(soz)) ball += 2;
      else if (qolgani.includes(soz)) ball += 1;
      else {
        ball = 0;
        break;
      }
    }
    if (ball > 0) baholangan.push({ sahifa, ball });
  }
  return baholangan.sort((a, b) => b.ball - a.ball).map((x) => x.sahifa);
}
