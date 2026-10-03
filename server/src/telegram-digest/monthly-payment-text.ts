import { TelegramDigestCategory } from '@prisma/client';
import { escapeHtml, formatSum } from '../telegram-groups/utils/format.util';
import { STUDENT_PORTAL_URL } from './telegram-digest.constants';
import { DedupedRow } from './telegram-digest-dedup';
import {
  MonthlyChargeDigestPayload,
  PaymentReminderDigestPayload,
  payloadOf,
} from './telegram-digest-payloads';
import { DigestBlock, header, spacer } from './telegram-message-parts';
import {
  capitalizeUz,
  formatDigestDate,
  previousMonth,
  uzMonthName,
} from './uzbek-calendar';

/**
 * The monthly payment messages (ADR-0042), worded exactly as the CEO
 * approved them on 27.09.2026 (spec §A5), and the least-share and contract
 * 3.7 wordings of 02.10.2026 (ADR-0064 §8). Pure: the renderer passes the
 * live balance in.
 */

/** Turns a shown row into its block and records it for the audit. */
export type EventBlockFn = (entry: DedupedRow, text: string) => DigestBlock;

const billOf = (e: DedupedRow) =>
  payloadOf(e.row, TelegramDigestCategory.MONTHLY_CHARGE);
const periodKey = (p: MonthlyChargeDigestPayload) =>
  p.periodYear * 100 + p.periodMonth;
const monthWord = (month: number) => capitalizeUz(uzMonthName(month));

function billGroupText(
  p: MonthlyChargeDigestPayload,
  settled: boolean,
): string {
  const days = p.daysLabel ? ` (${escapeHtml(p.daysLabel)})` : '';
  const lines = [`Guruh: ${escapeHtml(p.groupName)}${days}`];
  if (settled) {
    lines.push(
      `Oylik narx ${formatSum(p.chargedAmount)} balansingizdan yechildi.`,
    );
    return lines.join('\n');
  }
  lines.push(`Oylik narx: ${formatSum(p.price)} (${p.coveredLessons} dars)`);
  if (p.creditLessons > 0 && p.creditAmount > 0) {
    const prev = previousMonth(p.periodYear, p.periodMonth);
    lines.push(
      `${monthWord(prev.month)}dagi ${p.creditLessons} ta sababli dars uchun chegirma: −${formatSum(p.creditAmount)}`,
      `Chegirma bilan ${uzMonthName(p.periodMonth)} uchun: ${formatSum(p.chargedAmount)}`,
    );
  }
  return lines.join('\n');
}

function billTailText(
  bills: MonthlyChargeDigestPayload[],
  balance: number,
  today: string,
): string {
  if (balance >= 0) {
    const latest = bills[bills.length - 1];
    return [
      `Qolgan balans: <b>${formatSum(balance)}</b>`,
      `${monthWord(latest.periodMonth)} uchun to'lov qilish shart emas.`,
    ].join('\n');
  }
  const totalDue = -balance;
  const billed = bills.reduce((sum, b) => sum + b.chargedAmount, 0);
  const oldDebt = Math.max(0, totalDue - billed);
  const lines: string[] = [];
  if (oldDebt > 0) {
    const first = bills[0];
    const prev = previousMonth(first.periodYear, first.periodMonth);
    lines.push(
      `${monthWord(prev.month)}dan qolgan qarz: ${formatSum(oldDebt)}`,
    );
  }
  lines.push(`Jami to'lash kerak: <b>${formatSum(totalDue)}</b>`);
  const due = bills
    .map((b) => b.dueDate)
    .filter((d): d is string => d !== null && d > today)
    .sort()[0];
  if (!due) return lines.join('\n');
  lines.push(`Muddat: <b>${formatDigestDate(due)}</b> — oyning 2-darsigacha`);
  // ADR-0064: the whole month is asked for by the 2nd lesson; the least share
  // is named only as the fallback, and only while it is still unpaid.
  const afterSecondLesson = bills.reduce(
    (sum, b) =>
      sum + (b.minShare === undefined ? 0 : b.chargedAmount - b.minShare),
    0,
  );
  const minDue = Math.max(0, totalDue - afterSecondLesson);
  if (afterSecondLesson > 0 && minDue > 0) {
    lines.push(
      `Imkoni bo'lmasa, kamida ${formatSum(minDue)}; qolgani — to'langan darslar tugaguncha`,
    );
  }
  return lines.join('\n');
}

/**
 * «📅 … oyi uchun to'lov»: a month header whenever the month changes, one
 * event block per group, the totals once at the end. `balance` is the
 * student's balance at send time — the debt and the total are read from it,
 * so a payment made during the day is already counted. One group keeps the
 * approved layout exactly; several are separated by blank lines. The totals
 * ride in the last group's block, so the student's SMS record of the bill
 * carries what they were asked to pay.
 */
export function monthlyBillSection(
  entries: DedupedRow[],
  balance: number,
  today: string,
  event: EventBlockFn,
): DigestBlock[] {
  const sorted = [...entries].sort(
    (a, b) =>
      periodKey(billOf(a)) - periodKey(billOf(b)) ||
      billOf(a).groupName.localeCompare(billOf(b).groupName),
  );
  const settled = balance >= 0;
  const spaced = sorted.length > 1;
  const blocks: DigestBlock[] = [];
  let lastPeriod: number | null = null;
  const tail = billTailText(sorted.map(billOf), balance, today);
  sorted.forEach((e, i) => {
    const p = billOf(e);
    if (periodKey(p) !== lastPeriod) {
      if (lastPeriod !== null) blocks.push(spacer());
      blocks.push(
        header(`📅 <b>${monthWord(p.periodMonth)} oyi uchun to'lov</b>`),
      );
      lastPeriod = periodKey(p);
    } else if (spaced) {
      blocks.push(spacer());
    }
    const last = i === sorted.length - 1;
    const totals = last ? (spaced ? '\n\n' : '\n') + tail : '';
    blocks.push(event(e, billGroupText(p, settled) + totals));
  });
  return blocks;
}

const UNBROKEN = 'Darslaringiz uzilib qolmasligi uchun';

function reminderText(
  p: PaymentReminderDigestPayload,
  totalDue: number,
): string[] {
  if (p.paidThrough) {
    return [
      `${monthWord(p.periodMonth)} oyi uchun to'lovingiz ${formatDigestDate(p.paidThrough.through)} dagi darsgacha yetadi.`,
      `Qolgan to'lov: <b>${formatSum(totalDue)}</b>`,
      '',
      `${UNBROKEN} to'lovni ${formatDigestDate(p.lessonDate)} dagi darsgacha amalga oshirishingizni so'raymiz.`,
    ];
  }
  const tomorrow = `Ertaga (${formatDigestDate(p.lessonDate)}) ${uzMonthName(p.periodMonth)}ning 2-darsi bo'ladi.`;
  const ask = `${UNBROKEN} to'lovni ertagi darsgacha amalga oshirishingizni so'raymiz.`;
  if (p.minDue === undefined) {
    return [
      tomorrow,
      `To'lash kerak: <b>${formatSum(totalDue)}</b>`,
      '',
      `Shartnomaga ko'ra oylik to'lov 2-darsgacha qilinadi. ${ask}`,
    ];
  }
  // The whole debt is asked for first; what admits to the lesson is the
  // fallback (CEO, 02.10.2026). No percent: the lessons held, not the share,
  // are short (a month of two or three lessons) — the sentence about the
  // share would be untrue.
  const full = `${UNBROKEN} to'lovni ertagi darsgacha to'liq qilishingizni so'raymiz.`;
  const share = p.minPaidPercent === 50 ? 'yarmi' : `${p.minPaidPercent}% i`;
  return [
    tomorrow,
    `To'lash kerak: <b>${formatSum(totalDue)}</b>`,
    `Darsga kirish uchun kamida: ${formatSum(Math.min(p.minDue, totalDue))}`,
    '',
    p.minPaidPercent === undefined
      ? full
      : `Shartnomaga ko'ra 2-darsdan boshlab darslarga oy to'lovining kamida ${share} to'langandan keyin qatnashish mumkin. ${full}`,
  ];
}

/**
 * «⏰ To'lov eslatmasi». Every reminder in one digest is of one kind and
 * names the same lesson day, so several groups share one block; the block
 * carries all their rows. Three wordings: the 2nd-lesson reminder as approved
 * on 27.09.2026, the same under the least share, and contract 3.7's reminder
 * before the paid lessons run out (ADR-0064). `entries` must not be empty.
 */
export function paymentReminderSection(
  entries: DedupedRow[],
  totalDue: number,
  event: EventBlockFn,
): DigestBlock[] {
  const p = payloadOf(entries[0].row, TelegramDigestCategory.PAYMENT_REMINDER);
  const text = reminderText(p, totalDue).join('\n');
  const block = event(entries[0], text);
  return [
    header("⏰ <b>To'lov eslatmasi</b>"),
    { ...block, itemIds: entries.flatMap((e) => e.ids) },
  ];
}

/**
 * The closing lines of a bill that asks to pay and of the reminder. When both
 * are shown one closing serves them — the reminder's, which adds the line
 * about questions.
 */
export function monthlyPaymentClosing(
  askToPay: boolean,
  reminder: boolean,
): string[] {
  if (!askToPay && !reminder) return [];
  return [
    "To'lov: markazda, Payme yoki Click orqali.",
    ...(reminder
      ? ["Savollar bo'lsa, markaz administratoriga murojaat qiling."]
      : []),
    `🔗 Profilingiz: ${STUDENT_PORTAL_URL}`,
  ];
}
