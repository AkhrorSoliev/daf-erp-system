export interface BotJavobi {
  togri: boolean;
  ms: number;
}

const MIN_EHTIMOL = 0.6;
const MAX_EHTIMOL = 0.75;
const MIN_MS = 3000;
const MAX_MS = 9000;

/**
 * Dafi bot jang boshida BIR MARTA hisoblanadi va saqlanadi: jang davomida
 * qayta so'ralsa natija o'zgarmasligi kerak (spec §6).
 */
export function botJavoblari(
  soni: number,
  kuch: number,
  rng: () => number = Math.random,
): BotJavobi[] {
  const p = Math.min(MAX_EHTIMOL, Math.max(MIN_EHTIMOL, kuch));
  return Array.from({ length: soni }, () => ({
    togri: rng() < p,
    ms: MIN_MS + Math.floor(rng() * (MAX_MS - MIN_MS + 1)),
  }));
}
