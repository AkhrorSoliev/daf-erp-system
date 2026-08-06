import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryMonthlyService } from '../salary/salary-monthly.service';
import { ReportsService } from '../reports/reports.service';
import {
  escapeHtml,
  firstOfThisMonthDate,
  firstOfThisMonthUtc,
  formatNumber,
  formatSignedSum,
  formatSum,
  tashkentDayRange,
  tashkentTodayDate,
} from './utils/format.util';

/**
 * Builds the once-a-day 21:00 Telegram daily report — the center's end-of-day
 * financial + operational glance.
 *
 * The message surfaces the most decision-useful slices of the heavy
 * `/payments/overview` Excel report, narrowed to what is meaningful for a
 * single day and cheap enough to compute on the cron hot path:
 *
 *   🚦 traffic-light verdict (green / yellow / red)
 *   💰 Bugungi moliya      — today's cash in (by method), operational spend, net
 *   👥 O'quvchilar harakati — new vs departed students (net) + new leads
 *   🎓 Bugungi o'quv jarayoni — lessons held + attendance breakdown
 *   📌 Hozirgi holat        — active students + debt (with day-over-day ▲/▼)
 *   📅 Oy boshidan          — MTD income / expense / net + lesson collection %
 *   💵 Ustozlar oyligi      — deserved / students-paid / center-funded, MTD
 *   🚩 Diqqat               — self-suppressing flags (refund / write-off / …)
 *
 * The day-over-day debt delta reads the most recent PRIOR `DailyFinancialSnapshot`
 * row. Writing that row is NOT this service's job — `DailySnapshotCron` does it
 * every day at 23:40, including the Sundays and holidays this report skips.
 *
 * Metric semantics mirror the CEO's `/payments/salary` and financial pages:
 *  - "Tushum (haqiqiy)" = cash actually received (COMPLETED payments), NOT billed.
 *  - "Shu oyning darslari" / "Shundan yig'ildi" = the collection ratio, taken
 *    from `getIncomeMonthAttribution` so the bot and /payments/overview divide
 *    the SAME two figures. Never re-derive it here.
 *  - "Oy oxiriga kutilyapti" = lesson value for the whole month (held-and-paid
 *    plus the remaining scheduled slots), from `ReportsService
 *    .getMonthlyExpectation`. Never re-derive it here — the line it replaced
 *    was a local `exactDays × 4` walk that assumed every month was four weeks.
 *  - "Oy rejasidan yig'ildi" = the two lines above divided: collected ÷ the
 *    whole month. It answers "are we on track", which the held-lessons ratio
 *    cannot — that one can read 50% on the 5th. Same pair of figures the
 *    /payments/overview income drill-down shows, so the two cannot disagree.
 *  - "Markaz qo'shimchasi" = SalaryMonthly `centerFunded` — the center's own
 *    leg of the month: top-up accruals it has already written PLUS the lessons
 *    it still has to front. It does NOT drop to 0 once the month is settled.
 */
@Injectable()
export class TelegramGroupDailyReportService {
  private readonly logger = new Logger(TelegramGroupDailyReportService.name);

  /** Below this, a debt increase is not worth downgrading the day to 🟡. */
  private static readonly DEBT_GROWTH_YELLOW = 500_000;
  /** Today's refund + write-off total at/above this downgrades the day to 🔴. */
  private static readonly BIG_MONEY_OUT_RED = 2_000_000;
  /** ADJUSTMENT below this is routine noise — only flag larger ones. */
  private static readonly ADJUSTMENT_FLAG_MIN = 500_000;
  /** Attendance below this fires a red flag + downgrades to 🟡. */
  private static readonly ATTENDANCE_LOW_PCT = 75;

  private static readonly WEEKDAYS_UZ = [
    'Yakshanba',
    'Dushanba',
    'Seshanba',
    'Chorshanba',
    'Payshanba',
    'Juma',
    'Shanba',
  ];
  private static readonly MONTHS_UZ = [
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
  private static readonly METHOD_LABELS: Record<string, string> = {
    CASH: 'Naqd',
    PAYME: 'Payme',
    CLICK: 'Click',
    UZUM: 'Uzum',
    TRANSFER: "O'tkazma",
  };
  private static readonly METHOD_ORDER = [
    'CASH',
    'PAYME',
    'CLICK',
    'UZUM',
    'TRANSFER',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly salaryMonthly: SalaryMonthlyService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * Builds the full daily report and returns it alongside the point-in-time
   * figures the cron should persist as tonight's snapshot (for tomorrow's
   * ▲/▼ delta). Building does NOT write the snapshot — that is the cron's job
   * after a confirmed send.
   */
  async build(companyId: number): Promise<{
    message: string;
    snapshot: DailySnapshotData;
  }> {
    const today = tashkentDayRange();
    const todayDate = tashkentTodayDate();
    // `firstOfMonth` (a -5h-shifted timestamp) is correct only for the income
    // query below, which filters `Payment.createdAt` (a real timestamp).
    // `Expense.date` is a DATE column, so its month window must use date-only
    // bounds (`firstOfMonthDate` … `todayDate`) — otherwise Postgres floors the
    // shifted lower bound to the previous 30th/31st and leaks that day's
    // expenses into this month. See firstOfThisMonthDate() docstring.
    const firstOfMonth = firstOfThisMonthUtc();
    const firstOfMonthDate = firstOfThisMonthDate();

    const [
      company,
      activeStudents,
      todayNewStudents,
      droppedStudentsToday,
      newLeadsToday,
      convertedLeadsToday,
      todayPayments,
      todayPaymentsByMethod,
      todayExpenses,
      attendanceBreakdown,
      lessonGroupsToday,
      debtorAgg,
      monthlyIncome,
      monthlyExpenses,
      monthlyAdvances,
      todayFlags,
      yesterdaySnapshot,
    ] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
      this.prisma.student.count({
        where: { companyId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: today.start, lt: today.end },
        },
      }),
      // Distinct students dropped FROM A GROUP today (per the confirmed
      // "Ketgan o'quvchilar" semantics — DROPPED only; TRANSFERRED is a group
      // move, not a departure; center-level FROZEN/EXPELLED are separate).
      this.prisma.enrollment.findMany({
        where: {
          status: 'DROPPED',
          deletedAt: null,
          statusChangedAt: { gte: today.start, lt: today.end },
          student: { companyId, deletedAt: null },
        },
        distinct: ['studentId'],
        select: { studentId: true },
      }),
      // Leads are single-tenant (no companyId) — a global "created today" count.
      this.prisma.lead.count({
        where: { createdAt: { gte: today.start, lt: today.end } },
      }),
      this.prisma.lead.count({
        where: {
          statusEnum: 'CONVERTED',
          statusChangedAt: { gte: today.start, lt: today.end },
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: today.start, lt: today.end },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: today.start, lt: today.end },
        },
        _sum: { amount: true },
      }),
      // Operational spend only — TEACHER_ADVANCE is teacher pay (surfaced in
      // the salary context), not an operational Xarajat. Expense.date is a
      // DATE column, so match the Tashkent calendar date directly.
      this.prisma.expense.aggregate({
        where: {
          companyId,
          deletedAt: null,
          date: todayDate,
          category: { not: 'TEACHER_ADVANCE' },
        },
        _sum: { amount: true },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { companyId, date: todayDate },
        _count: true,
      }),
      this.prisma.attendance.groupBy({
        by: ['groupId'],
        where: { companyId, date: todayDate },
      }),
      this.prisma.student.aggregate({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          balance: { lt: 0 },
        },
        _sum: { balance: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: firstOfMonth },
        },
        _sum: { amount: true },
      }),
      // Operational MTD spend — advance-free. `Expense.date` is a DATE column,
      // so bound it with date-only [1st-of-Tashkent-month … today]; the missing
      // upper bound + shifted lower bound previously leaked the prev-month 30th
      // (June rent/salaries) AND any future-dated row into this total.
      this.prisma.expense.aggregate({
        where: {
          companyId,
          deletedAt: null,
          date: { gte: firstOfMonthDate, lte: todayDate },
          category: { not: 'TEACHER_ADVANCE' },
        },
        _sum: { amount: true },
      }),
      // MTD teacher advances — surfaced on their own "Avans" line (advances are
      // teacher pay, not operational Xarajat). Same date-only window.
      this.prisma.expense.aggregate({
        where: {
          companyId,
          deletedAt: null,
          date: { gte: firstOfMonthDate, lte: todayDate },
          category: 'TEACHER_ADVANCE',
        },
        _sum: { amount: true },
      }),
      // One cheap groupBy powers the whole 🚩 Diqqat block: today's refunds,
      // debt write-offs and manual adjustments from the append-only ledger.
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: {
          companyId,
          reversedAt: null,
          createdAt: { gte: today.start, lt: today.end },
          type: { in: ['REFUND', 'DEBT_WRITE_OFF', 'ADJUSTMENT'] },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.dailyFinancialSnapshot.findFirst({
        where: { companyId, date: { lt: todayDate } },
        orderBy: { date: 'desc' },
      }),
    ]);

    // Prognoz + salary top-up are computed separately (heavier, and each is
    // wrapped so a failure degrades gracefully rather than killing the report).
    // Tashkent calendar month of "today" — the window the MTD block reports on.
    const monthKey = tashkentTodayDate().toISOString().slice(0, 7);
    const [expectedValue, salary, canonicalNet, collection] =
      await Promise.all([
        this.computeExpectation(companyId, monthKey),
        this.computeSalaryTopUp(companyId),
        this.computeCanonicalNetProfit(companyId, monthKey),
        this.computeCollection(companyId),
      ]);

    // ── Derive figures ────────────────────────────────────────────────────
    const todayIncome = todayPayments._sum.amount ?? 0;
    const todayIncomeCount = todayPayments._count ?? 0;
    const todaySpend = todayExpenses._sum.amount ?? 0;
    const todayNet = todayIncome - todaySpend;

    const departedToday = droppedStudentsToday.length;
    const netMovement = todayNewStudents - departedToday;

    const present = this.attendanceCount(attendanceBreakdown, 'PRESENT');
    const late = this.attendanceCount(attendanceBreakdown, 'LATE');
    const absent = this.attendanceCount(attendanceBreakdown, 'ABSENT');
    const excused = this.attendanceCount(attendanceBreakdown, 'EXCUSED');
    const attended = present + late;
    const attendanceDenom = attended + absent;
    const attendancePct =
      attendanceDenom > 0 ? Math.round((attended / attendanceDenom) * 100) : 0;
    const lessonsToday = lessonGroupsToday.length;

    const totalDebt = Math.abs(debtorAgg._sum.balance ?? 0);
    const debtorCount = debtorAgg._count;

    const mtdIncome = monthlyIncome._sum.amount ?? 0;
    const mtdExpense = monthlyExpenses._sum.amount ?? 0;
    // Advances are real cash paid to teachers (teacher pay), so Sof foyda nets
    // them out too — shown on their own line, kept out of the Xarajat figure.
    const mtdAdvance = monthlyAdvances._sum.amount ?? 0;
    // Cash-only figure, kept for the «kassa harakati» reading below.
    const mtdCashNet = mtdIncome - mtdExpense - mtdAdvance;

    const flags = this.buildFlagLines(todayFlags, attendancePct);

    const debtGrowth = yesterdaySnapshot
      ? totalDebt - yesterdaySnapshot.totalDebt
      : 0;

    // Real money leaving the center's pocket today (refunds + forgiven debt),
    // used for the 🔴 threshold — distinct from debt growth or a book adjustment.
    const flagAmount = (type: string) =>
      Math.abs(todayFlags.find((f) => f.type === type)?._sum.amount ?? 0);
    const refundWriteOffToday =
      flagAmount('REFUND') + flagAmount('DEBT_WRITE_OFF');

    const light = this.resolveTrafficLight({
      todayNet,
      flagCount: flags.length,
      refundWriteOffToday,
      debtGrowth,
      attendancePct,
      attendanceDenom,
    });

    // ── Compose message ───────────────────────────────────────────────────
    const dayNum = todayDate.getUTCDate();
    const monthName = TelegramGroupDailyReportService.MONTHS_UZ[
      todayDate.getUTCMonth()
    ];
    const weekday =
      TelegramGroupDailyReportService.WEEKDAYS_UZ[todayDate.getUTCDay()];
    const companyName = escapeHtml(company?.name ?? 'Hisobot');

    const lines: string[] = [];

    // Header + traffic-light verdict.
    lines.push(`📊 <b>${today.label}, ${weekday} — ${companyName}</b>`);
    lines.push(`${light.emoji} <i>${light.subtitle}</i>`);
    lines.push('');

    // 💰 Bugungi moliya
    lines.push(`💰 <b>Bugungi moliya</b>`);
    lines.push(
      `• Kirim: <b>${formatNumber(todayIncomeCount)} ta · ${formatSum(todayIncome)}</b>`,
    );
    const methodLine = this.buildMethodLine(todayPaymentsByMethod);
    if (methodLine) lines.push(`   ${methodLine}`);
    lines.push(`• Chiqim: <b>${formatSum(todaySpend)}</b>`);
    lines.push(`• Sof (bugun): <b>${formatSignedSum(todayNet)}</b>`);
    lines.push('');

    // 👥 O'quvchilar harakati
    lines.push(`👥 <b>O'quvchilar harakati</b>`);
    lines.push(
      `• Yangi o'quvchilar: <b>${formatNumber(todayNewStudents)}</b> · Ketgan: <b>${formatNumber(departedToday)}</b> — sof <b>${netMovement >= 0 ? '+' : ''}${formatNumber(netMovement)}</b>`,
    );
    const leadLine =
      convertedLeadsToday > 0
        ? `• Yangi lidlar: <b>${formatNumber(newLeadsToday)}</b> (${formatNumber(convertedLeadsToday)} tasi o'quvchiga aylandi)`
        : `• Yangi lidlar: <b>${formatNumber(newLeadsToday)}</b>`;
    lines.push(leadLine);
    lines.push('');

    // 🎓 Bugungi o'quv jarayoni
    lines.push(`🎓 <b>Bugungi o'quv jarayoni</b>`);
    lines.push(`• Dars o'tilgan guruhlar: <b>${formatNumber(lessonsToday)}</b>`);
    lines.push(
      `• Davomat: <b>${formatNumber(present)}</b> keldi · <b>${formatNumber(late)}</b> kech · <b>${formatNumber(absent)}</b> kelmadi · <b>${formatNumber(excused)}</b> uzrli — <b>${attendancePct}%</b>`,
    );
    lines.push('');

    // 📌 Hozirgi holat
    lines.push(`📌 <b>Hozirgi holat</b>`);
    lines.push(`• Faol o'quvchilar: <b>${formatNumber(activeStudents)}</b>`);
    lines.push(
      `• Qarzdorlar: <b>${formatNumber(debtorCount)}</b> ta — <b>${formatSum(totalDebt)}</b>${this.buildDebtDeltaSuffix(yesterdaySnapshot, totalDebt, debtorCount)}`,
    );
    lines.push('');

    // 📅 Oy boshidan
    lines.push(`📅 <b>Oy boshidan (1–${dayNum} ${monthName})</b>`);
    lines.push(`• Tushum (haqiqiy): <b>${formatSum(mtdIncome)}</b>`);
    lines.push(`• Xarajat: <b>${formatSum(mtdExpense)}</b>`);
    if (mtdAdvance > 0) {
      lines.push(`• Avans (ustozlarga): <b>${formatSum(mtdAdvance)}</b>`);
    }
    if (canonicalNet !== null) {
      lines.push(`• Sof foyda: <b>${formatSignedSum(canonicalNet)}</b>`);
      lines.push(
        `• Kassa harakati (oyliksiz): <b>${formatSignedSum(mtdCashNet)}</b>`,
      );
    } else {
      // Canonical figure unavailable — label the fallback honestly rather than
      // presenting a cash number as "Sof foyda".
      lines.push(
        `• Kassa harakati (oyliksiz): <b>${formatSignedSum(mtdCashNet)}</b>`,
      );
    }
    // Collection, on the ONE basis /payments/overview shows. The old line read
    // `MTD cash ÷ forecast` — two different things over a denominator that is
    // a schedule guess, so it printed 109–115% while the web page called the
    // same month 83%. Now both surfaces divide the SAME two figures.
    if (collection && collection.lessonsValue > 0) {
      lines.push(
        `• Shu oyning darslari: <b>${formatSum(collection.lessonsValue)}</b>`,
      );
      lines.push(
        `• Shundan yig'ildi: <b>${formatSum(collection.collected)}</b> (<b>${collection.pct}%</b>)`,
      );
    }
    if (expectedValue !== null && expectedValue > 0) {
      // Lesson value, from the ONE canonical source. The line it replaces was a
      // local `exactDays × 4` walk — a second implementation of a figure the web
      // page also computed, and both were wrong the same way.
      lines.push(
        `• Oy oxiriga kutilyapti: <b>${formatSum(expectedValue)}</b>`,
      );
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
      if (collection) {
        const monthPlanPct = Math.round(
          (collection.collected / expectedValue) * 100,
        );
        lines.push(`• Oy rejasidan yig'ildi: <b>${monthPlanPct}%</b>`);
      }
    }

    // 💵 Ustozlar oyligi (only when there is real lesson data — skips the
    // May-style config-gap month where getMonthly returns nulls).
    if (salary && salary.fullDeserved !== null) {
      lines.push('');
      lines.push(`💵 <b>Ustozlar oyligi (oy boshidan)</b>`);
      lines.push(`• To'liq ishlangan: <b>${formatSum(salary.fullDeserved)}</b>`);
      lines.push(`• O'quvchilar to'lagan: <b>${formatSum(salary.covered)}</b>`);
      lines.push(`• 🏛 Markaz qo'shimchasi: <b>${formatSum(salary.centerFunded)}</b>`);
    }

    // 💼 Xodimlar oyligi — non-teaching fixed-salary staff (independent of the
    // teacher lesson-data gate above).
    if (salary && salary.staffNet > 0) {
      lines.push('');
      lines.push(`💼 <b>Xodimlar oyligi</b>`);
      lines.push(`• To'lanadi: <b>${formatSum(salary.staffNet)}</b>`);
    }

    // 🚩 Diqqat (self-suppressing)
    lines.push('');
    if (flags.length > 0) {
      lines.push(`🚩 <b>Diqqat</b>`);
      for (const f of flags) lines.push(f);
    } else {
      lines.push(`✅ <b>Bugun jiddiy muammo yo'q</b>`);
    }

    return {
      message: lines.join('\n'),
      snapshot: { totalDebt, debtorCount, activeStudents, mtdIncome },
    };
  }

  // `persistSnapshot` lived here. It ran only after a confirmed Telegram send,
  // and the Telegram cron skips Sundays and holidays — so those days had no
  // snapshot at all, and a month closing on a Sunday had no closing figure.
  // `DailySnapshotService` + `DailySnapshotCron` now write it every day,
  // independently, per branch. Do not re-attach it to the send path.

  // ── Helpers ─────────────────────────────────────────────────────────────

  private attendanceCount(
    breakdown: Array<{ status: string; _count: number }>,
    status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED',
  ): number {
    return breakdown.find((r) => r.status === status)?._count ?? 0;
  }

  private buildMethodLine(
    byMethod: Array<{ method: string; _sum: { amount: number | null } }>,
  ): string | null {
    const parts = TelegramGroupDailyReportService.METHOD_ORDER.map((m) => {
      const row = byMethod.find((r) => r.method === m);
      const amount = row?._sum.amount ?? 0;
      if (amount <= 0) return null;
      const label = TelegramGroupDailyReportService.METHOD_LABELS[m] ?? m;
      return `${label} ${formatNumber(amount)}`;
    }).filter((x): x is string => x !== null);
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  private buildDebtDeltaSuffix(
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

  private buildFlagLines(
    todayFlags: Array<{
      type: string;
      _sum: { amount: number | null };
      _count: number;
    }>,
    attendancePct: number,
  ): string[] {
    const lines: string[] = [];
    const flagFor = (type: string) => todayFlags.find((f) => f.type === type);

    const refund = flagFor('REFUND');
    if (refund && refund._count > 0) {
      lines.push(
        `• Qaytarilgan to'lov: <b>${formatSum(Math.abs(refund._sum.amount ?? 0))}</b> (${refund._count} ta)`,
      );
    }

    const writeOff = flagFor('DEBT_WRITE_OFF');
    if (writeOff && writeOff._count > 0) {
      lines.push(
        `• Qarz kechirildi: <b>${formatSum(Math.abs(writeOff._sum.amount ?? 0))}</b> (${writeOff._count} ta)`,
      );
    }

    const adjustment = flagFor('ADJUSTMENT');
    const adjustmentAbs = Math.abs(adjustment?._sum.amount ?? 0);
    if (
      adjustment &&
      adjustment._count > 0 &&
      adjustmentAbs >= TelegramGroupDailyReportService.ADJUSTMENT_FLAG_MIN
    ) {
      lines.push(
        `• Katta tuzatish: <b>${formatSum(adjustmentAbs)}</b> (${adjustment._count} ta)`,
      );
    }

    if (
      attendancePct > 0 &&
      attendancePct < TelegramGroupDailyReportService.ATTENDANCE_LOW_PCT
    ) {
      lines.push(`• Davomat past: <b>${attendancePct}%</b>`);
    }

    return lines;
  }

  private resolveTrafficLight(input: {
    todayNet: number;
    flagCount: number;
    refundWriteOffToday: number;
    debtGrowth: number;
    attendancePct: number;
    attendanceDenom: number;
  }): { emoji: string; subtitle: string } {
    const {
      todayNet,
      flagCount,
      refundWriteOffToday,
      debtGrowth,
      attendancePct,
      attendanceDenom,
    } = input;

    // 🔴 — the day lost money, or a large refund/write-off hit.
    if (
      todayNet < 0 ||
      refundWriteOffToday >= TelegramGroupDailyReportService.BIG_MONEY_OUT_RED
    ) {
      return { emoji: '🔴', subtitle: "Kun yakuni: e'tibor talab" };
    }
    // 🟡 — a flag fired, debt grew notably, or attendance dipped.
    const debtGrewNotably =
      debtGrowth >= TelegramGroupDailyReportService.DEBT_GROWTH_YELLOW;
    const lowAttendance =
      attendanceDenom > 0 &&
      attendancePct < TelegramGroupDailyReportService.ATTENDANCE_LOW_PCT;
    if (flagCount > 0 || debtGrewNotably || lowAttendance) {
      return { emoji: '🟡', subtitle: "Kun yakuni: ehtiyot bo'ling" };
    }
    return { emoji: '🟢', subtitle: 'Kun yakuni: yaxshi' };
  }

  /**
   * «Oy oxiriga kutilyapti» from the ONE canonical source.
   *
   * This used to be a local `exactDays × 4` walk — a second implementation of a
   * figure `/payments/overview` also computed, and both were wrong the same
   * way: every month treated as four weeks (8–13% short on a five-week month)
   * and rebuilt from whoever was ACTIVE at request time, so June and July both
   * scored the same number.
   *
   * Company-wide (the report covers the whole centre). Returns null on failure
   * so the line is dropped rather than breaking the report.
   */
  private async computeExpectation(
    companyId: number,
    month: string,
  ): Promise<number | null> {
    try {
      const e = await this.reports.getMonthlyExpectation(companyId, {
        month,
        branchIds: null,
      });
      return e.expectedValue;
    } catch (err: any) {
      this.logger.warn(
        `Expectation failed for company ${companyId} (${month}): ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /**
   * Current-month salary top-up totals via `SalaryMonthlyService.getMonthly`
   * (the same source as the CEO's `/payments/salary` page). Needs a CEO /
   * Administrator caller so the figures are company-wide, not branch-scoped.
   * Returns null (block hidden) when no such user exists or the compute fails.
   */
  /**
   * Month-to-date collection on the SAME basis as the /overview "Tushum
   * tarkibi" panel — `ReportsFinancialService.getIncomeMonthAttribution`, which
   * returns both sides of the ratio (`lessonsValue`, `currentMonth`) already
   * computed against one window.
   *
   * The previous line divided MTD cash by the schedule forecast, a different
   * numerator over a different denominator than anything on the web page: the
   * bot said 109–115% while /payments/overview called the same month 83%.
   * Calling the shared service is what makes a repeat of that impossible —
   * there is no second formula to drift.
   *
   * Company-wide (the report covers the whole centre) and MTD (1st → today,
   * Tashkent), matching the "Oy boshidan" block it sits in. Returns null on
   * failure so the block is simply dropped.
   */
  private async computeCollection(companyId: number): Promise<{
    lessonsValue: number;
    collected: number;
    pct: number;
  } | null> {
    try {
      const attribution = await this.reports.getIncomeMonthAttribution(
        companyId,
        {
          branchIds: null,
          startDate: firstOfThisMonthDate().toISOString().slice(0, 10),
          endDate: tashkentTodayDate().toISOString().slice(0, 10),
        },
      );
      if (attribution.collectionPct === null) return null;
      return {
        lessonsValue: attribution.lessonsValue,
        collected: attribution.currentMonth,
        pct: attribution.collectionPct,
      };
    } catch (e) {
      this.logger.warn(`Collection ratio failed for company ${companyId}: ${e}`);
      return null;
    }
  }

  /**
   * The ONE canonical "Sof foyda" — the same figure the /overview Foyda card and
   * the Excel «Sof foyda» sheet show (`ReportsService.getMonthlyNetProfit`).
   *
   * This message used to print `tushum − xarajat − avans`, which subtracts NO
   * salary at all (payroll is never written to `Expense`) while still deducting
   * advance cash the canonical formula does not treat as an expense. So the
   * headline profit was far too high — and the very same message printed the
   * full deserved salary a few lines below it.
   *
   * Returns null on failure so a broken figure never takes the whole 21:00
   * report down; the caller then falls back to the cash line.
   */
  private async computeCanonicalNetProfit(
    companyId: number,
    month: string,
  ): Promise<number | null> {
    try {
      const caller = await this.prisma.user.findFirst({
        where: {
          companyId,
          deletedAt: null,
          roles: { some: { role: { name: 'CEO' } } },
        },
        select: { id: true },
      });
      if (!caller) return null;
      const np = await this.reports.getMonthlyNetProfit(companyId, {
        month,
        // Company-wide: the daily report covers the whole centre.
        branchIds: null,
        performedById: caller.id,
      });
      return np.netProfit;
    } catch (e) {
      this.logger.warn(
        `Canonical net profit failed for company ${companyId} (${month}): ${e}`,
      );
      return null;
    }
  }

  private async computeSalaryTopUp(
    companyId: number,
  ): Promise<SalaryTopUp | null> {
    try {
      const caller =
        (await this.prisma.user.findFirst({
          where: {
            companyId,
            deletedAt: null,
            roles: { some: { role: { name: 'CEO' } } },
          },
          select: { id: true },
        })) ??
        (await this.prisma.user.findFirst({
          where: {
            companyId,
            deletedAt: null,
            roles: { some: { role: { name: 'Administrator' } } },
          },
          select: { id: true },
        }));
      if (!caller) return null;

      const { totals, staffTotals } = await this.salaryMonthly.getMonthly(
        {},
        companyId,
        caller.id,
      );
      // Non-teaching fixed-salary staff net — independent of teacher lesson data.
      const staffNet = staffTotals?.netToPay ?? 0;
      // getMonthly totals sum only over rows that have lesson data; a
      // config-gap month yields 0s across the board. Treat an all-zero teacher
      // result as "no data" so the teacher block hides — but still carry
      // staffNet so the staff line can show on a config-gap month.
      if (
        totals.fullDeserved === 0 &&
        totals.covered === 0 &&
        totals.centerFunded === 0
      ) {
        return { fullDeserved: null, covered: 0, centerFunded: 0, staffNet };
      }
      return {
        fullDeserved: totals.fullDeserved,
        covered: totals.covered,
        centerFunded: totals.centerFunded,
        staffNet,
      };
    } catch (err: any) {
      this.logger.warn(
        `Salary top-up compute failed for company ${companyId}: ${err?.message ?? err}`,
      );
      return null;
    }
  }
}

export interface DailySnapshotData {
  totalDebt: number;
  debtorCount: number;
  activeStudents: number;
  mtdIncome: number;
}

interface SalaryTopUp {
  fullDeserved: number | null;
  covered: number;
  centerFunded: number;
  /** Net payable to non-teaching FIXED_MONTHLY staff this month (Σ staff netToPay). */
  staffNet: number;
}
