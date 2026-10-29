import { isMonthlyBillingMonth } from '../reports/month-charges';
import type { DailyReportData } from './telegram-group-daily-report.service';
import {
  escapeHtml,
  formatNumber,
  formatSignedSum,
  formatSum,
} from './utils/format.util';
import { buildDebtSplitLines } from './utils/debt-split-lines.util';
import { buildIncomeSplitLines } from './utils/income-split.util';
import { buildMonthChargesLines } from './utils/month-charges-lines.util';

/** «Sof foyda» ostidagi ogohlantirish — 21:00 hisobot va rm:cfin kartasi bitta matn ishlatadi. */
export const MISSING_RATES_WARNING =
  "⚠️ Hisob to'liq emas: soliq stavkasi yoki bank xarajati kiritilmagan";

const WEEKDAYS_UZ = [
  'Yakshanba',
  'Dushanba',
  'Seshanba',
  'Chorshanba',
  'Payshanba',
  'Juma',
  'Shanba',
];
const MONTHS_UZ = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentyabr',
  'oktyabr',
  'noyabr',
  'dekabr',
];
const METHOD_LABELS: Record<string, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "O'tkazma",
  QR: 'QR-kod',
};
const METHOD_ORDER = ['CASH', 'PAYME', 'CLICK', 'UZUM', 'TRANSFER', 'QR'];

export function buildMethodLine(
  byMethod: Array<{ method: string; _sum: { amount: number | null } }>,
): string | null {
  const parts = METHOD_ORDER.map((m) => {
    const row = byMethod.find((r) => r.method === m);
    const amount = row?._sum.amount ?? 0;
    if (amount <= 0) return null;
    const label = METHOD_LABELS[m] ?? m;
    return `${label} ${formatNumber(amount)}`;
  }).filter((x): x is string => x !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function buildDebtDeltaSuffix(
  yesterday: { totalDebt: number; debtorCount: number } | null,
  totalDebt: number,
  debtorCount: number,
): string {
  if (!yesterday) return '';
  const debtDelta = totalDebt - yesterday.totalDebt;
  const countDelta = debtorCount - yesterday.debtorCount;
  if (debtDelta === 0 && countDelta === 0) return '';
  // Growing debt (positive delta) is the bad direction → ▲.
  const arrow = debtDelta > 0 ? '▲' : debtDelta < 0 ? '▼' : '·';
  const countPart =
    countDelta !== 0 ? ` · ${countDelta > 0 ? '+' : ''}${countDelta}` : '';
  return `  (bugun ${arrow} ${formatNumber(Math.abs(debtDelta))}${countPart})`;
}

/** The 21:00 group message, written from already-collected figures. Pure. */
export function renderGroupMessage(d: DailyReportData): string {
  const dayNum = d.todayDate.getUTCDate();
  const monthName = MONTHS_UZ[d.todayDate.getUTCMonth()];
  const weekday = WEEKDAYS_UZ[d.todayDate.getUTCDay()];
  const companyName = escapeHtml(d.companyName);

  const lines: string[] = [];

  // Header + traffic-light verdict.
  lines.push(`📊 <b>${d.todayLabel}, ${weekday} — ${companyName}</b>`);
  // Name the scope. Two groups on different branches now receive different
  // numbers under the same title, and a reader has to be able to tell which
  // report they are holding.
  if (d.scopeLabel !== null) lines.push(`<i>${escapeHtml(d.scopeLabel)}</i>`);
  lines.push(`${d.light.emoji} <i>${d.light.subtitle}</i>`);
  lines.push('');

  // 💰 Bugungi moliya
  lines.push(`💰 <b>Bugungi moliya</b>`);
  lines.push(
    `• Kirim: <b>${formatNumber(d.todayIncomeCount)} ta · ${formatSum(d.todayIncome)}</b>`,
  );
  const methodLine = buildMethodLine(d.todayPaymentsByMethod);
  if (methodLine) lines.push(`   ${methodLine}`);
  lines.push(`• Chiqim: <b>${formatSum(d.todaySpend)}</b>`);
  lines.push(`• Sof (bugun): <b>${formatSignedSum(d.todayNet)}</b>`);
  lines.push('');

  // 👥 O'quvchilar harakati
  lines.push(`👥 <b>O'quvchilar harakati</b>`);
  lines.push(
    `• Yangi o'quvchilar: <b>${formatNumber(d.todayNewStudents)}</b> · Ketgan: <b>${formatNumber(d.departedToday)}</b> — sof <b>${d.netMovement >= 0 ? '+' : ''}${formatNumber(d.netMovement)}</b>`,
  );
  const leadLine =
    d.convertedLeadsToday > 0
      ? `• Yangi lidlar: <b>${formatNumber(d.newLeadsToday)}</b> (${formatNumber(d.convertedLeadsToday)} tasi o'quvchiga aylandi)`
      : `• Yangi lidlar: <b>${formatNumber(d.newLeadsToday)}</b>`;
  lines.push(leadLine);
  lines.push('');

  // 🎓 Bugungi o'quv jarayoni
  lines.push(`🎓 <b>Bugungi o'quv jarayoni</b>`);
  lines.push(
    `• Dars o'tilgan guruhlar: <b>${formatNumber(d.lessonsToday)}</b>`,
  );
  lines.push(
    `• Davomat: <b>${formatNumber(d.present)}</b> keldi · <b>${formatNumber(d.late)}</b> kech · <b>${formatNumber(d.absent)}</b> kelmadi · <b>${formatNumber(d.excused)}</b> uzrli — <b>${d.attendancePct}%</b>`,
  );
  lines.push('');

  // 📌 Hozirgi holat
  lines.push(`📌 <b>Hozirgi holat</b>`);
  lines.push(`• Faol o'quvchilar: <b>${formatNumber(d.activeStudents)}</b>`);
  // The debt (ADR-0059): the lines every Telegram surface prints. Only
  // «O'qiyotganlar qarzi» carries the ▲/▼ against yesterday.
  for (const line of buildDebtSplitLines(d.debtSplit, {
    studyingSuffix: buildDebtDeltaSuffix(
      d.yesterdaySnapshot,
      d.totalDebt,
      d.debtorCount,
    ),
  })) {
    lines.push(line);
  }
  lines.push('');

  // 📅 Oy boshidan
  lines.push(`📅 <b>Oy boshidan (1–${dayNum} ${monthName})</b>`);
  // The income figure and its composition come from ONE attribution result,
  // so the lines underneath are a decomposition of the number above them.
  //
  // The two figures share a window (both start at Tashkent midnight of the
  // 1st) but not a BASIS: `mtdIncome` sums the `Payment` table, while
  // `attribution.total` tallies the in-window PAYMENT rows of the effective
  // ledger. They agree while every COMPLETED payment has exactly one active
  // PAYMENT transaction of the same amount — the invariant
  // `scripts/audit-finance-reconciliation.ts` checks as G1 — and
  // `logIncomeBasisDrift` (in `collect`) says so in the log if that ever
  // stops holding.
  //
  // The returned snapshot figures keep the aggregate on purpose: it is the
  // basis `DailySnapshotService`, the row's only writer, stores `mtdIncome` on.
  lines.push(
    `• Tushum (haqiqiy): <b>${formatSum(d.attribution ? d.attribution.total : d.mtdIncome)}</b>`,
  );
  if (d.attribution) {
    for (const line of buildIncomeSplitLines(d.attribution)) lines.push(line);
  }
  lines.push(`• Xarajat: <b>${formatSum(d.mtdExpense)}</b>`);
  if (d.mtdAdvance > 0) {
    lines.push(`• Avans (ustozlarga): <b>${formatSum(d.mtdAdvance)}</b>`);
  }
  if (d.canonicalNet !== null) {
    lines.push(`• Sof foyda: <b>${formatSignedSum(d.canonicalNet)}</b>`);
    if (d.canonicalMissingRates.length > 0) {
      lines.push(MISSING_RATES_WARNING);
    }
    lines.push(
      `• Kassa harakati (oyliksiz): <b>${formatSignedSum(d.mtdCashNet)}</b>`,
    );
  } else {
    // Canonical figure unavailable — label the fallback honestly rather than
    // presenting a cash number as "Sof foyda".
    lines.push(
      `• Kassa harakati (oyliksiz): <b>${formatSignedSum(d.mtdCashNet)}</b>`,
    );
  }
  // Collection, on the ONE basis /payments/overview shows. The old line read
  // `MTD cash ÷ forecast` — two different things over a denominator that is
  // a schedule guess, so it printed 109–115% while the web page called the
  // same month 83%. Now both surfaces divide the SAME two figures.
  //
  // From 2026-09 (ADR-0058) the month is read through «Bu oy hisoblandi /
  // To'landi / Qoldi» instead, and «Shundan yig'ildi», «Oy oxiriga
  // kutilyapti» and «Oy rejasidan yig'ildi» NEVER print in such a month — not
  // even when the charges could not be read. They are the lesson-based
  // figures that are wrong under monthly billing, so a month block without
  // the new lines is right and one that falls back to these is not.
  const monthlyBilling = isMonthlyBillingMonth(d.monthKey);
  if (d.attribution && d.attribution.lessonsValue > 0) {
    lines.push(
      `• Shu oyning darslari: <b>${formatSum(d.attribution.lessonsValue)}</b>`,
    );
    if (!monthlyBilling) {
      // The month's own cash in its old meaning, advance included (ADR-0067).
      lines.push(
        `• Shundan yig'ildi: <b>${formatSum(d.attribution.currentMonth + d.attribution.advance)}</b> (<b>${d.attribution.pct}%</b>)`,
      );
    }
  }
  if (d.monthCharges) {
    // Same lines, same wording as the «Moliyaviy xulosa» card (ADR-0058).
    for (const line of buildMonthChargesLines(d.monthCharges)) lines.push(line);
  } else if (
    !monthlyBilling &&
    d.expectedValue !== null &&
    d.expectedValue > 0
  ) {
    // Lesson value, from the ONE canonical source. The line it replaces was a
    // local `exactDays × 4` walk — a second implementation of a figure the web
    // page also computed, and both were wrong the same way.
    lines.push(`• Oy oxiriga kutilyapti: <b>${formatSum(d.expectedValue)}</b>`);
    // How far through the month we are. "Shundan yig'ildi" above measures
    // against the lessons already HELD, so it can read 50% on the 5th and say
    // nothing about the month; this divides the same collected figure by the
    // WHOLE month instead. Both numerator and denominator are already on the
    // message above, and both come from the same services /payments/overview
    // reads — no third figure is fetched, so the bot and the web page cannot
    // drift apart.
    //
    // Deliberately unclamped: a reading above 100% would mean more was
    // collected than the month is worth, and that should stay visible.
    if (d.attribution) {
      // The month's own cash in its old meaning, advance included (ADR-0067).
      const monthPlanPct = Math.round(
        ((d.attribution.currentMonth + d.attribution.advance) /
          d.expectedValue) *
          100,
      );
      lines.push(`• Oy rejasidan yig'ildi: <b>${monthPlanPct}%</b>`);
    }
  }

  // 💵 Ustozlar oyligi (only when there is real lesson data — skips the
  // May-style config-gap month where getMonthly returns nulls).
  if (d.salary && d.salary.fullDeserved !== null) {
    lines.push('');
    lines.push(`💵 <b>Ustozlar oyligi (oy boshidan)</b>`);
    lines.push(
      `• To'liq ishlangan: <b>${formatSum(d.salary.fullDeserved)}</b>`,
    );
    lines.push(`• O'quvchilar to'lagan: <b>${formatSum(d.salary.covered)}</b>`);
    lines.push(
      `• 🏛 Markaz qo'shimchasi: <b>${formatSum(d.salary.centerFunded)}</b>`,
    );
  }

  // 💼 Xodimlar oyligi — non-teaching fixed-salary staff (independent of the
  // teacher lesson-data gate above).
  if (d.salary && d.salary.staffNet > 0) {
    lines.push('');
    lines.push(`💼 <b>Xodimlar oyligi</b>`);
    lines.push(`• To'lanadi: <b>${formatSum(d.salary.staffNet)}</b>`);
  }

  // 📋 Topshiriqlar (its own line, not a flag)
  if (d.taskLine) {
    lines.push('');
    lines.push(d.taskLine);
  }

  // 🚩 Diqqat (self-suppressing)
  lines.push('');
  if (d.flags.length > 0) {
    lines.push(`🚩 <b>Diqqat</b>`);
    for (const f of d.flags) lines.push(f);
  } else {
    lines.push(`✅ <b>Bugun jiddiy muammo yo'q</b>`);
  }

  return lines.join('\n');
}
