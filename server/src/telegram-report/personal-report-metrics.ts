import type { TelegramReportSection } from '@prisma/client';
import type { DailyReportData } from '../telegram-groups/telegram-group-daily-report.service';
import { formatNumber, formatSum } from '../telegram-groups/utils/format.util';

/** One decimal of millions, Uzbek comma: 4 200 000 → «4,2». */
export function formatMln(n: number): string {
  return (Math.round(n / 100_000) / 10).toFixed(1).replace('.', ',');
}

/** «4,2 mln» from 100 000 so'm up, plain so'm below. */
export function shortSum(n: number): string {
  return Math.abs(n) >= 100_000 ? `${formatMln(n)} mln` : formatSum(n);
}

export interface Metric {
  section: TelegramReportSection;
  emoji: string;
  label: string;
  money: boolean;
  /** Carries the day-over-day debt arrow. */
  debtArrow?: boolean;
  value(d: DailyReportData): number | string | null;
}

/**
 * The personal report's rows. Every value is a field of `DailyReportData` —
 * the 21:00 report's own figures (ADR-0095); nothing is computed here.
 */
export const METRICS: Metric[] = [
  {
    section: 'TODAY_MONEY',
    emoji: '💰',
    label: 'Tushum',
    money: true,
    value: (d) => d.todayIncome,
  },
  {
    section: 'TODAY_MONEY',
    emoji: '💸',
    label: 'Xarajat',
    money: true,
    value: (d) => d.todaySpend,
  },
  {
    section: 'STUDENTS',
    emoji: '👥',
    label: 'Yangi/ketdi',
    money: false,
    value: (d) => `+${d.todayNewStudents}/−${d.departedToday}`,
  },
  {
    section: 'STUDENTS',
    emoji: '📥',
    label: 'Yangi lid',
    money: false,
    value: (d) => d.newLeadsToday,
  },
  {
    section: 'LESSONS',
    emoji: '🎓',
    label: 'Dars',
    money: false,
    value: (d) => (d.lessonsToday > 0 ? d.lessonsToday : null),
  },
  {
    section: 'LESSONS',
    emoji: '✅',
    label: 'Davomat',
    money: false,
    value: (d) => (d.attendanceDenom > 0 ? `${d.attendancePct}%` : null),
  },
  {
    section: 'ACTIVE_STUDENTS',
    emoji: '👤',
    label: "Faol o'quvchi",
    money: false,
    value: (d) => d.activeStudents,
  },
  {
    section: 'DEBT',
    emoji: '📌',
    label: 'Qarz',
    money: true,
    debtArrow: true,
    value: (d) => d.debtSplit.studying.total,
  },
  {
    section: 'DEBT',
    emoji: '📎',
    label: "Qarz (o'qimaydi)",
    money: true,
    value: (d) => d.debtSplit.notStudying.total,
  },
  {
    section: 'MONTH',
    emoji: '📅',
    label: 'Oy tushumi',
    money: true,
    value: (d) => d.attribution?.total ?? d.mtdIncome,
  },
  {
    section: 'MONTH',
    emoji: '🧾',
    label: 'Oy xarajati',
    money: true,
    value: (d) => d.mtdExpense,
  },
  {
    section: 'MONTH',
    emoji: '📈',
    label: 'Sof foyda',
    money: true,
    value: (d) => d.canonicalNet,
  },
  {
    section: 'MONTH',
    emoji: '⏳',
    label: 'Oy qoldi',
    money: true,
    value: (d) => d.monthCharges?.unpaid ?? null,
  },
  {
    section: 'SALARY',
    emoji: '💵',
    label: 'Ustoz oyligi',
    money: true,
    value: (d) => d.salary?.fullDeserved ?? null,
  },
  {
    section: 'SALARY',
    emoji: '🏛',
    label: 'Markaz',
    money: true,
    value: (d) =>
      d.salary && d.salary.fullDeserved !== null ? d.salary.centerFunded : null,
  },
];

/** The ▲/▼ is only true where a stored snapshot of the same scope exists. */
function debtArrow(d: DailyReportData): string | null {
  const oneScope = d.branchIds === null || d.branchIds.length === 1;
  if (!oneScope || !d.yesterdaySnapshot) return null;
  const delta = d.totalDebt - d.yesterdaySnapshot.totalDebt;
  if (delta === 0) return null;
  return `${delta > 0 ? '▲' : '▼'}${shortSum(Math.abs(delta))}`;
}

/** Text form of one metric for one scope; null hides it. */
export function metricCell(m: Metric, d: DailyReportData): string | null {
  const v = m.value(d);
  if (v === null) return null;
  const text =
    typeof v === 'string' ? v : m.money ? shortSum(v) : formatNumber(v);
  const arrow = m.debtArrow ? debtArrow(d) : null;
  return arrow ? `${text} (${arrow})` : text;
}

/** Table form: money in millions without a unit (the table says «mln so'm»). */
export function tableCell(m: Metric, d: DailyReportData): string | null {
  const v = m.value(d);
  if (v === null) return null;
  return typeof v === 'string' ? v : m.money ? formatMln(v) : formatNumber(v);
}
