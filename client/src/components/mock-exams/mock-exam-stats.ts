import type { Translate } from "@/components/notifications/notification-view";
import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import type { MockExamStats, MockStatsMethod } from "./exam-detail-types";

/**
 * Words for the statistics block on a mock exam's «Umumiy» tab. The numbers
 * arrive ready from the server (`mock-exam-stats.ts`); this only names them.
 * Every helper takes an optional last `t` (Uzbek by default).
 */

// Brand names (Click, Payme, Uzum) are printed as they are, never through `t`.
const METHOD_WORDS: Partial<Record<MockStatsMethod, string>> = {
  CASH: msg("Naqd"),
  TRANSFER: msg("O'tkazma"),
  QR: msg("QR-kod"),
  BALANCE: msg("Balansdan (eski)"),
  UNKNOWN: msg("To'lov turi yozilmagan"),
};
const METHOD_BRANDS: Partial<Record<MockStatsMethod, string>> = {
  CLICK: "Click",
  PAYME: "Payme",
  UZUM: "Uzum",
};

export function statsMethodLabel(
  method: MockStatsMethod,
  t: Translate = interpolate,
): string {
  const word = METHOD_WORDS[method];
  return word ? t(word) : (METHOD_BRANDS[method] ?? method);
}

export function paidHint(
  m: MockExamStats["money"],
  t: Translate = interpolate,
): string {
  return m.freeCount > 0
    ? t("{paid} kishi to'lagan · {free} bepul", {
        paid: m.paidCount,
        free: m.freeCount,
      })
    : t("{n} kishi to'lagan", { n: m.paidCount });
}

export function unpaidHint(
  m: MockExamStats["money"],
  t: Translate = interpolate,
): string {
  return m.cashIntentCount > 0
    ? t("{n} kishi · {cash} tasi naqd deydi", {
        n: m.unpaidCount,
        cash: m.cashIntentCount,
      })
    : t("{n} kishi", { n: m.unpaidCount });
}

export function channelHint(
  c: MockExamStats["channel"],
  t: Translate = interpolate,
): string {
  return t("Botdan {bot} · Admin {admin}", { bot: c.bot, admin: c.admin });
}

export function dafHint(
  d: MockExamStats["daf"],
  t: Translate = interpolate,
): string {
  return d.converted > 0
    ? t("DaF emas {n} ({converted} tasi keyin o'quvchi bo'ldi)", {
        n: d.outsider,
        converted: d.converted,
      })
    : t("DaF emas {n}", { n: d.outsider });
}

export function levelLabel(
  level: string | null,
  t: Translate = interpolate,
): string {
  return level ?? t("Darajasiz");
}

export function timeLabel(
  time: string | null,
  t: Translate = interpolate,
): string {
  return time ?? t("Tanlanmagan");
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
  const rows: { label: string; value: number }[] = [
    { label: msg("Natija olishi kerak"), value: r.audience },
    { label: msg("Telegramda yetib bordi"), value: r.delivered },
    { label: msg("Telegram bog'lanmagan"), value: r.noTelegram },
  ];
  if (r.failed > 0) rows.push({ label: msg("Yuborib bo'lmadi"), value: r.failed });
  if (r.pending > 0) {
    rows.push({ label: msg("Hali yuborilmagan"), value: r.pending });
  }
  return rows;
}
