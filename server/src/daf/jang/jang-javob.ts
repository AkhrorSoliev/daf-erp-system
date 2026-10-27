import { istRichtig } from '../uebung/antwort';

/**
 * Tanlash/eshitish — mijoz variant MATNINI yuboradi, aynan solishtiriladi.
 * Yozish — mashq tizimidagi kechirimli solishtirish (`ä`/`ae`, `ß`/`ss`).
 */
export function javobTogrimi(
  savol: {
    kind: 'CHOOSE' | 'TYPE' | 'LISTEN';
    answer: string;
    akzeptiert: string[];
  },
  berilgan: string,
): boolean {
  if (savol.kind === 'TYPE')
    return istRichtig(berilgan, savol.answer, savol.akzeptiert);
  return berilgan === savol.answer;
}
