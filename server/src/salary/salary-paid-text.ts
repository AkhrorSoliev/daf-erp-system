import { formatSom } from '../payments/shared/format-som';
import { dmy, monthTitle } from '../statements/statement-text';

/** Staff message on «Berildi» (spec §6, CEO 10.10.2026 — do not reword). */
export interface SalaryPaidTextInput {
  firstName: string;
  /** Payroll month, `YYYY-MM`. */
  month: string;
  gross: number;
  advances: number;
  net: number;
  cash: number;
  card: number;
  /** Tashkent day the money was handed over, `YYYY-MM-DD`. */
  paidDay: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** « — naqd X, kartaga Y» from the payout's cash movements; empty when none. */
function method(cash: number, card: number): string {
  if (cash > 0 && card > 0) {
    return ` — naqd ${formatSom(cash)}, kartaga ${formatSom(card)}`;
  }
  if (cash > 0) return ' — naqd';
  if (card > 0) return ' — kartaga';
  return '';
}

export function salaryPaidText(i: SalaryPaidTextInput): string {
  const oy = monthTitle(i.month);
  const yil = i.month.slice(0, 4);
  const usul = method(i.cash, i.card);
  const money =
    i.advances > 0
      ? [
          `${oy} ${yil} uchun hisoblandi: <b>${formatSom(i.gross)} so'm</b>`,
          `Avans ushlandi: <b>${formatSom(i.advances)} so'm</b>`,
          `Berildi: <b>${formatSom(i.net)} so'm</b>${usul}`,
        ]
      : [`${oy} ${yil} uchun: <b>${formatSom(i.net)} so'm</b>${usul}`];
  return [
    `<b>✅ ${oy} oyligingiz berildi</b>`,
    '',
    `Hurmatli ${esc(i.firstName)}!`,
    '',
    ...money,
    `Sana: <b>${dmy(i.paidDay)}</b>`,
    '',
    "Batafsil — tizimdagi «Ish haqi» bo'limida.",
    '',
    'Rahmat!',
  ].join('\n');
}
