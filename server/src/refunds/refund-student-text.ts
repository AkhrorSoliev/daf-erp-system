import { formatUzPhone } from '../common/utils/phone.util';
import { dmy, monthName } from '../statements/statement-text';
import { escapeHtml, formatSum } from '../telegram-groups/utils/format.util';

/**
 * The student's refund messages (spec §5.4) and the shared pieces of the
 * balance notice (§5.3), approved by the CEO on 10.10.2026 — do not reword;
 * the specs pin every line. Telegram HTML: names and reasons are escaped.
 */
export const greetingLine = (firstName: string) =>
  firstName ? `Hurmatli ${escapeHtml(firstName)}!` : 'Assalomu alaykum!';

/** «23-oktabrgacha» from 'YYYY-MM-DD'. */
export const untilDay = (day: string) =>
  `${Number(day.slice(8, 10))}-${monthName(day)}gacha`;

const phoneBlock = (phone: string | null) =>
  phone ? ['', `📞 Savol bo'lsa: ${formatUzPhone(phone)}`] : [];

export function refundRequestedText(p: {
  firstName: string;
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  balance: number;
  phone: string | null;
}): string {
  return [
    "<b>🔄 Pulni qaytarish so'rovi qabul qilindi</b>",
    '',
    greetingLine(p.firstName),
    '',
    `Qaytariladigan summa: <b>${formatSum(p.amount)}</b>`,
    `Pul <b>${untilDay(p.dueDate)}</b> qaytarib beriladi.`,
    `Bu summa hisobingizdan ushlab turiladi — joriy balansingiz: <b>${formatSum(p.balance)}</b>`,
    ...phoneBlock(p.phone),
    '',
    'Rahmat!',
  ].join('\n');
}

export function refundHandedOverText(p: {
  firstName: string;
  amount: number;
  method: 'CASH' | 'TRANSFER';
  /** YYYY-MM-DD, Tashkent */
  handedOverDay: string;
  receiptUrl: string;
}): string {
  return [
    '<b>✅ Pulingiz qaytarib berildi</b>',
    '',
    greetingLine(p.firstName),
    '',
    `<b>${formatSum(p.amount)}</b> qaytarib berildi — <b>${p.method === 'CASH' ? 'naqd' : 'kartaga'}</b>.`,
    `Sana: <b>${dmy(p.handedOverDay)}</b>`,
    '',
    `📄 Kvitansiya: ${escapeHtml(p.receiptUrl)}`,
    '',
    "DaF Sprachzentrum'ni tanlaganingiz uchun rahmat!",
  ].join('\n');
}

export function refundCancelledText(p: {
  firstName: string;
  amount: number;
  reason: string;
  balance: number;
  phone: string | null;
}): string {
  return [
    "<b>↩️ Pulni qaytarish so'rovi bekor qilindi</b>",
    '',
    greetingLine(p.firstName),
    '',
    `<b>${formatSum(p.amount)}</b> qaytarish so'rovingiz bekor qilindi.`,
    `Sabab: ${escapeHtml(p.reason)}`,
    `Pul hisobingizga qaytdi — joriy balansingiz: <b>${formatSum(p.balance)}</b>`,
    ...phoneBlock(p.phone),
  ].join('\n');
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** The drawer's preview of a Telegram HTML text: no tags, entities decoded, lines kept. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m]);
}
