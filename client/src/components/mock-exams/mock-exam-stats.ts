import { MOCK_PAYMENT_METHOD_LABELS } from "./mock-payment";
import type { MockExamStats, MockStatsMethod } from "./exam-detail-types";

/**
 * Words for the statistics block on a mock exam's «Umumiy» tab. The numbers
 * arrive ready from the server (`mock-exam-stats.ts`); this only names them.
 */

const METHOD_LABELS: Record<MockStatsMethod, string> = {
  ...MOCK_PAYMENT_METHOD_LABELS,
  UZUM: "Uzum",
  TRANSFER: "O'tkazma",
  BALANCE: "Balansdan (eski)",
  UNKNOWN: "To'lov turi yozilmagan",
};

export function statsMethodLabel(method: MockStatsMethod): string {
  return METHOD_LABELS[method];
}

export function paidHint(m: MockExamStats["money"]): string {
  const base = `${m.paidCount} kishi to'lagan`;
  return m.freeCount > 0 ? `${base} · ${m.freeCount} bepul` : base;
}

export function unpaidHint(m: MockExamStats["money"]): string {
  const base = `${m.unpaidCount} kishi`;
  return m.cashIntentCount > 0
    ? `${base} · ${m.cashIntentCount} tasi naqd deydi`
    : base;
}

export function channelHint(c: MockExamStats["channel"]): string {
  return `Botdan ${c.bot} · Admin ${c.admin}`;
}

export function dafHint(d: MockExamStats["daf"]): string {
  const base = `DaF emas ${d.outsider}`;
  return d.converted > 0
    ? `${base} (${d.converted} tasi keyin o'quvchi bo'ldi)`
    : base;
}

export function levelLabel(level: string | null): string {
  return level ?? "Darajasiz";
}

export function timeLabel(time: string | null): string {
  return time ?? "Tanlanmagan";
}

/** The levels card only when the exam has levels: a lone «Darajasiz» row says nothing. */
export function hasLevels(s: MockExamStats): boolean {
  return s.levels.some((l) => l.level !== null);
}

/** The time card only when there is a choice to compare. */
export function hasTimeChoice(s: MockExamStats): boolean {
  return s.times.length > 1;
}

/** Bar width, in percent of the busiest level. */
export function barPercent(value: number, max: number): number {
  return max > 0 ? Math.round((value / max) * 100) : 0;
}

export function resultRows(
  r: NonNullable<MockExamStats["results"]>,
): { label: string; value: number }[] {
  const rows = [
    { label: "Natija olishi kerak", value: r.audience },
    { label: "Telegramda yetib bordi", value: r.delivered },
    { label: "Telegram bog'lanmagan", value: r.noTelegram },
  ];
  if (r.failed > 0) rows.push({ label: "Yuborib bo'lmadi", value: r.failed });
  if (r.pending > 0) {
    rows.push({ label: "Hali yuborilmagan", value: r.pending });
  }
  return rows;
}
