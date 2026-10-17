import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryMonthlyService } from '../salary/salary-monthly.service';
import { ReportsService } from '../reports/reports.service';
import {
  isMonthlyBillingMonth,
  type MonthCharges,
} from '../reports/month-charges';
import type { DebtSplit } from '../reports/debt-split';
import {
  branchIdWhere,
  groupBranchWhere,
  singleBranchId,
  studentBranchWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { leadAttributionWhere } from '../leads/shared/lead-scope';
import { activeStudentWhere } from '../students/shared/active-student-where';
import {
  formatSum,
  firstOfThisMonthDate,
  firstOfThisMonthUtc,
  tashkentDayRange,
  tashkentTodayDate,
} from './utils/format.util';
import { renderGroupMessage } from './daily-report-group-message';
import { buildTaskLine } from './utils/task-line.util';
import { loadTaskReportFigures } from '../tasks/task-report-figures';

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
 *   📌 Hozirgi holat        — active students + debt as two numbers
 *                             («O'qiyotganlar» with day-over-day ▲/▼ and its
 *                             shu oy / eski qarz split, «O'qimayotganlar»)
 *   📅 Oy boshidan          — MTD income (+ this-month / advance / old-debt
 *                             split, per month) / expense / net + lesson
 *                             collection %;
 *                             from 2026-09 «Bu oy hisoblandi / To'landi /
 *                             Qoldi» take the place of the lesson-based
 *                             collection % and the month-end lines
 *   💵 Ustozlar oyligi      — deserved / students-paid / center-funded, MTD
 *   📋 Topshiriqlar         — open / overdue tasks + who is most behind
 *                             (a line, not a flag; none while nothing is overdue)
 *   🚩 Diqqat               — self-suppressing flags (refund / write-off / …)
 *
 * The day-over-day debt delta reads the most recent PRIOR `DailyFinancialSnapshot`
 * row. Writing that row is NOT this service's job — `DailySnapshotCron` does it
 * every day at 23:40, including the Sundays and holidays this report skips.
 *
 * Metric semantics mirror the CEO's `/payments/salary` and financial pages:
 *  - «O'qiyotganlar qarzi» / «O'qimayotganlar qarzi» = the debt as two numbers
 *    that are never added, from `ReportsService.getDebtSplit` (ADR-0059).
 *    «O'qiyotganlar» = students in an active group (ADR-0015's «faol
 *    o'quvchi»), split into this month's charges and older debt; everyone else
 *    who owes is «O'qimayotganlar». The ▲/▼ delta, the 🟡 light and the
 *    snapshot's `totalDebt`/`debtorCount` follow «O'qiyotganlar» alone. Never
 *    re-derive either here — the status-ACTIVE aggregate this replaced counted
 *    an ungrouped «faol» student as a debtor and no other surface did.
 *  - "Tushum (haqiqiy)" = cash actually received, NOT billed — read from
 *    `getIncomeMonthAttribution` so the lines under it («Shu oy uchun»,
 *    «Oldindan (keyingi oy uchun)», «Eski qarzlar uchun», per month) decompose
 *    the figure printed above them (ADR-0067).
 *    The `Payment` aggregate of the same window still feeds the snapshot.
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
 *  - "Bu oy hisoblandi" / "To'landi" / "Qoldi" = what the month's monthly
 *    charges came to, how much of it is paid and what is still owed, from
 *    `ReportsService.getMonthCharges` (ADR-0058). Printed from 2026-09 on, in
 *    place of "Shundan yig'ildi", "Oy oxiriga kutilyapti" and "Oy rejasidan
 *    yig'ildi" ("Shu oyning darslari" stays). Those three lines print only
 *    before 2026-09; from then on they never do, not even when the call fails
 *    (the month block then simply has no hisoblandi / to'landi / qoldi lines,
 *    and a warning goes to the log). Never re-derive it here.
 *  - "Markaz qo'shimchasi" = SalaryMonthly `centerFunded` — the center's own
 *    leg of the month: top-up accruals it has already written PLUS the lessons
 *    it still has to front. It does NOT drop to 0 once the month is settled.
 */
@Injectable()
export class TelegramGroupDailyReportService {
  private readonly logger = new Logger(TelegramGroupDailyReportService.name);

  /** Below this, a rise in «O'qiyotganlar qarzi» is not worth downgrading the day to 🟡. */
  private static readonly DEBT_GROWTH_YELLOW = 500_000;
  /** Today's refund + write-off total at/above this downgrades the day to 🔴. */
  private static readonly BIG_MONEY_OUT_RED = 2_000_000;
  /** ADJUSTMENT below this is routine noise — only flag larger ones. */
  private static readonly ADJUSTMENT_FLAG_MIN = 500_000;
  /** Attendance below this fires a red flag + downgrades to 🟡. */
  private static readonly ATTENDANCE_LOW_PCT = 75;

  constructor(
    private readonly prisma: PrismaService,
    private readonly salaryMonthly: SalaryMonthlyService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * Builds the full daily report and returns it alongside its point-in-time
   * snapshot figures. Nothing persists them: the day's `DailyFinancialSnapshot`
   * row has one writer, `DailySnapshotService` (23:40, see the class comment),
   * and the next report's ▲/▼ reads that row.
   */
  async build(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<{
    message: string;
    snapshot: DailySnapshotData;
  }> {
    const d = await this.collect(companyId, branchIds);
    return {
      message: renderGroupMessage(d),
      snapshot: {
        totalDebt: d.totalDebt,
        debtorCount: d.debtorCount,
        activeStudents: d.activeStudents,
        mtdIncome: d.mtdIncome,
      },
    };
  }

  /**
   * Runs every query behind the 21:00 report and returns the figures, before
   * any text is written. `renderGroupMessage` turns them into the group
   * message; the personal Telegram reports read the same data.
   */
  async collect(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<DailyReportData> {
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
      debtSplit,
      monthlyIncome,
      monthlyExpenses,
      monthlyAdvances,
      todayFlags,
      yesterdaySnapshot,
      staleUnmarked,
      staleJoinRequests,
    ] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
      // «Faol o'quvchilar» — bosh sahifadagi bilan bitta ta'rif.
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          ...activeStudentWhere(),
          ...studentBranchWhere(branchIds),
        },
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: today.start, lt: today.end },
          ...studentBranchWhere(branchIds),
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
          ...groupBranchWhere(branchIds),
        },
        distinct: ['studentId'],
        select: { studentId: true },
      }),
      // `Lead` gained companyId AND branchId; the comment here still said it
      // was single-tenant, and the queries counted every company's leads.
      //
      // `leadAttributionWhere` (not `leadBranchWhere`) because this is a COUNT:
      // an unassigned lead is workable from either branch but must be added to
      // neither total, or Sigma(branches) would exceed the company figure. The
      // leads module documents that invariant.
      this.prisma.lead.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: today.start, lt: today.end },
          ...leadAttributionWhere(branchIds),
        },
      }),
      this.prisma.lead.count({
        where: {
          companyId,
          deletedAt: null,
          statusEnum: 'CONVERTED',
          statusChangedAt: { gte: today.start, lt: today.end },
          ...leadAttributionWhere(branchIds),
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: today.start, lt: today.end },
          ...branchIdWhere(branchIds),
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
          ...branchIdWhere(branchIds),
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
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { companyId, date: todayDate, ...groupBranchWhere(branchIds) },
        _count: true,
      }),
      this.prisma.attendance.groupBy({
        by: ['groupId'],
        where: { companyId, date: todayDate, ...groupBranchWhere(branchIds) },
      }),
      // The debt as two numbers that are never added (ADR-0059). It replaces a
      // status-ACTIVE aggregate that counted an ungrouped «faol» student as a
      // debtor. The month is the current Tashkent one, which is this report's own.
      this.reports.getDebtSplit(companyId, { branchIds }),
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: firstOfMonth },
          ...branchIdWhere(branchIds),
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
          ...branchIdWhere(branchIds),
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
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
      }),
      // One cheap groupBy powers the whole 🚩 Diqqat block: today's refunds,
      // debt write-offs and manual adjustments from the append-only ledger.
      // Live rows only: cancelling writes a counter-row of the same type with
      // `reversedTransactionId` set and `reversedAt: null`, so `reversedAt`
      // alone would still report a refund that was undone.
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: {
          companyId,
          reversedAt: null,
          reversedTransactionId: null,
          createdAt: { gte: today.start, lt: today.end },
          type: { in: ['REFUND', 'DEBT_WRITE_OFF', 'ADJUSTMENT'] },
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
        _count: true,
      }),
      // `DailyFinancialSnapshot` holds one row per company AND one per branch,
      // so a query without a branch predicate could return either — the
      // day-over-day arrow was comparing against whichever row sorted first.
      // Pin it to the same scope the rest of this report is built from.
      this.prisma.dailyFinancialSnapshot.findFirst({
        where: {
          companyId,
          date: { lt: todayDate },
          branchId: singleBranchId(branchIds) ?? null,
        },
        orderBy: { date: 'desc' },
      }),
      // «Dars bo'ldimi?» questions left unanswered for more than a day
      // (spec 2026-09-29 §3.7) — scoped like the rest of the report.
      this.prisma.unmarkedLesson.count({
        where: {
          companyId,
          status: 'PENDING',
          createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          group: { deletedAt: null },
          ...branchIdWhere(branchIds),
        },
      }),
      // Bot sign-ups no administrator answered for more than a day
      // (ADR-0083 / spec D10), scoped like the rest of the report.
      this.prisma.studentJoinRequest.count({
        where: {
          companyId,
          status: 'PENDING',
          createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          ...branchIdWhere(branchIds),
        },
      }),
    ]);

    // Prognoz + salary top-up are computed separately (heavier, and each is
    // wrapped so a failure degrades gracefully rather than killing the report).
    // Tashkent calendar month of "today" — the window the MTD block reports on.
    const monthKey = tashkentTodayDate().toISOString().slice(0, 7);
    const [
      expectedValue,
      salary,
      canonicalNet,
      attribution,
      monthCharges,
      taskLine,
    ] = await Promise.all([
      this.computeExpectation(companyId, monthKey, branchIds),
      this.computeSalaryTopUp(companyId, branchIds),
      this.computeCanonicalNetProfit(companyId, monthKey, branchIds),
      this.computeIncomeAttribution(companyId, branchIds),
      this.computeMonthCharges(companyId, monthKey, branchIds),
      this.computeTaskLine(companyId, branchIds),
    ]);

    // The printed income line reads the ledger tally (`attribution.total`) while
    // the snapshot keeps the `Payment` aggregate — see `logIncomeBasisDrift`.
    const mtdIncome = monthlyIncome._sum.amount ?? 0;
    this.logIncomeBasisDrift(companyId, attribution, mtdIncome);

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

    // The snapshot, the ▲/▼ delta and the 🟡 light all follow «O'qiyotganlar»;
    // `DailySnapshotService` writes the same two figures from the same split.
    // «O'qimayotganlar» is printed and nothing more — it is never added to it.
    const totalDebt = debtSplit.studying.total;
    const debtorCount = debtSplit.studying.count;

    const mtdExpense = monthlyExpenses._sum.amount ?? 0;
    // Advances are real cash paid to teachers (teacher pay), so Sof foyda nets
    // them out too — shown on their own line, kept out of the Xarajat figure.
    const mtdAdvance = monthlyAdvances._sum.amount ?? 0;
    // Cash-only figure, kept for the «kassa harakati» reading below.
    const mtdCashNet = mtdIncome - mtdExpense - mtdAdvance;

    const flags = this.buildFlagLines(
      todayFlags,
      attendancePct,
      staleUnmarked,
      staleJoinRequests,
    );

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

    // Name the scope. Two groups on different branches now receive different
    // numbers under the same title, and a reader has to be able to tell which
    // report they are holding.
    const scopeLabel =
      branchIds !== null ? await this.branchNames(companyId, branchIds) : null;

    return {
      branchIds,
      todayLabel: today.label,
      todayDate,
      monthKey,
      companyName: company?.name ?? 'Hisobot',
      scopeLabel,
      todayIncome,
      todayIncomeCount,
      todayPaymentsByMethod,
      todaySpend,
      todayNet,
      todayNewStudents,
      departedToday,
      netMovement,
      newLeadsToday,
      convertedLeadsToday,
      present,
      late,
      absent,
      excused,
      attendancePct,
      attendanceDenom,
      lessonsToday,
      activeStudents,
      debtSplit,
      yesterdaySnapshot,
      totalDebt,
      debtorCount,
      mtdIncome,
      mtdExpense,
      mtdAdvance,
      mtdCashNet,
      attribution,
      canonicalNet,
      expectedValue,
      monthCharges,
      salary,
      taskLine,
      flags,
      light,
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

  private buildFlagLines(
    todayFlags: Array<{
      type: string;
      _sum: { amount: number | null };
      _count: number;
    }>,
    attendancePct: number,
    staleUnmarked: number,
    staleJoinRequests: number,
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

    if (staleUnmarked > 0) {
      lines.push(
        `• Javobsiz darslar (1 kundan ortiq): <b>${staleUnmarked}</b> ta — «Topshiriqlar»da javob bering`,
      );
    }

    if (staleJoinRequests > 0) {
      lines.push(
        `• Javobsiz o'quvchi so'rovlari (1 kundan ortiq): <b>${staleJoinRequests}</b> ta — «Topshiriqlar»da javob bering`,
      );
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

  /** Branch names for the scope line, falling back to ids if a name is gone. */
  private async branchNames(
    companyId: number,
    branchIds: number[],
  ): Promise<string> {
    if (branchIds.length === 0) return 'Filial tanlanmagan';
    const rows = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, companyId },
      select: { id: true, name: true },
    });
    const byId = new Map(rows.map((b) => [b.id, b.name]));
    return branchIds.map((id) => byId.get(id) ?? `Filial #${id}`).join(', ');
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
   * Scoped to the branches the asking group may see. Returns null on failure
   * so the line is dropped rather than breaking the report.
   */
  private async computeExpectation(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
  ): Promise<number | null> {
    try {
      const e = await this.reports.getMonthlyExpectation(companyId, {
        month,
        branchIds,
      });
      return e.expectedValue;
    } catch (err: any) {
      this.logger.warn(
        `Expectation failed for company ${companyId} (${month}): ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /** «Bu oy hisoblandi / To'landi / Qoldi» (ADR-0058); null before 2026-09 or on failure. */
  private async computeMonthCharges(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
  ): Promise<MonthCharges | null> {
    if (!isMonthlyBillingMonth(month)) return null;
    try {
      return await this.reports.getMonthCharges(companyId, {
        month,
        branchIds,
      });
    } catch (err: any) {
      this.logger.warn(`Oy hisoblari olinmadi: ${err?.message ?? err}`);
      return null;
    }
  }

  /**
   * The task line (spec §4 screen 5). Not a 🚩 flag: system tasks are overdue
   * most evenings and would turn every day 🟡. A failure drops the line only.
   */
  private async computeTaskLine(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<string | null> {
    try {
      return buildTaskLine(
        await loadTaskReportFigures(this.prisma, companyId, branchIds),
      );
    } catch (err) {
      this.logger.warn(`task line failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Current-month salary top-up totals via `SalaryMonthlyService.getMonthly`
   * (the same source as the CEO's `/payments/salary` page, per ADR-0006 — the
   * figure is never recomputed here). The CEO / Administrator caller supplies
   * only an identity the payroll resolver requires; the SCOPE comes from the
   * group, exactly as `/salary/monthly` passes `singleBranchId(scope)`.
   * Returns null (block hidden) when no such user exists or the compute fails.
   */
  /**
   * Month-to-date income composition on the SAME basis as the «Qayerdan keldi»
   * dialog on «Umumiy ma'lumotlar» — `ReportsFinancialService.getIncomeMonthAttribution`,
   * which returns the cash total, its three parts — this month's own income,
   * the advance paid ahead for the next month and late payments settling older
   * debt (broken out per month), ADR-0067 — and both sides of the collection
   * ratio, all computed against ONE window.
   *
   * Three lines of the message read this: the income figure and its split, and
   * the collection ratio. The previous ratio line divided MTD cash by the
   * schedule forecast — a different numerator over a different denominator than
   * anything on the web page, so the bot said 109–115% while /payments/overview
   * called the same month 83%. Calling the shared service is what makes a
   * repeat of that impossible — there is no second formula to drift.
   *
   * Scoped to the asking group's branches, and MTD (1st → today, Tashkent),
   * matching the "Oy boshidan" block it sits in. Returns null on failure so the
   * lines are simply dropped.
   */
  /**
   * The printed income line reads the ledger tally; the `Payment` aggregate
   * still feeds the snapshot. The two are the same money counted from two
   * tables, so a difference is not a rounding artefact — it means a COMPLETED
   * payment has no live PAYMENT transaction behind it (or carries a different
   * amount or branch), which is the G1 invariant of
   * `scripts/audit-finance-reconciliation.ts`.
   *
   * Logged rather than surfaced: the reader cannot act on it, and a report that
   * starts explaining its own plumbing is a report nobody finishes. Nothing is
   * suppressed either — a silently smaller headline is exactly the failure this
   * makes findable.
   */
  private logIncomeBasisDrift(
    companyId: number,
    attribution: { total: number } | null,
    mtdIncome: number,
  ): void {
    if (!attribution || attribution.total === mtdIncome) return;
    this.logger.warn(
      `Income basis drift for company ${companyId}: ledger ${attribution.total} vs payments ${mtdIncome} (diff ${attribution.total - mtdIncome}) — check audit-finance-reconciliation G1`,
    );
  }

  private async computeIncomeAttribution(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<IncomeAttribution | null> {
    try {
      const attribution = await this.reports.getIncomeMonthAttribution(
        companyId,
        {
          branchIds,
          startDate: firstOfThisMonthDate().toISOString().slice(0, 10),
          endDate: tashkentTodayDate().toISOString().slice(0, 10),
        },
      );
      // A month with no lessons held yet has no collection RATIO, but its cash
      // still has a composition — returning null on a null `collectionPct`
      // (which is what this did while it only served the ratio) would drop the
      // income split with it. The ratio lines guard on `lessonsValue` instead,
      // and `collectionPct` is null only when that is 0.
      return {
        total: attribution.total,
        currentMonth: attribution.currentMonth,
        advance: attribution.advance,
        lateTotal: attribution.lateTotal,
        late: attribution.late,
        lessonsValue: attribution.lessonsValue,
        pct: attribution.collectionPct,
      };
    } catch (e) {
      this.logger.warn(
        `Income attribution failed for company ${companyId}: ${e}`,
      );
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
    branchIds: ReportBranchIds,
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
        // The CEO id supplies only the identity the report layer requires; the
        // scope belongs to the group that asked.
        branchIds,
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
    branchIds: ReportBranchIds,
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
        { branchId: singleBranchId(branchIds) },
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
  /** «O'qiyotganlar qarzi» — the studying debt, never the two added (ADR-0059). */
  totalDebt: number;
  /** How many students owe it. */
  debtorCount: number;
  activeStudents: number;
  mtdIncome: number;
}

export interface IncomeAttribution {
  total: number;
  currentMonth: number;
  advance: number;
  lateTotal: number;
  late: Array<{ label: string; amount: number }>;
  lessonsValue: number;
  pct: number | null;
}

export interface SalaryTopUp {
  fullDeserved: number | null;
  covered: number;
  centerFunded: number;
  /** Net payable to non-teaching FIXED_MONTHLY staff this month (Σ staff netToPay). */
  staffNet: number;
}

/** Everything the 21:00 message prints, before any text is written. */
export interface DailyReportData {
  branchIds: ReportBranchIds;
  todayLabel: string; // tashkentDayRange().label
  todayDate: Date; // tashkentTodayDate()
  monthKey: string; // 'YYYY-MM'
  companyName: string; // raw, NOT escaped; 'Hisobot' when the company has no name
  scopeLabel: string | null; // branch names when branchIds !== null, else null
  todayIncome: number;
  todayIncomeCount: number;
  todayPaymentsByMethod: Array<{
    method: string;
    _sum: { amount: number | null };
  }>;
  todaySpend: number;
  todayNet: number;
  todayNewStudents: number;
  departedToday: number;
  netMovement: number;
  newLeadsToday: number;
  convertedLeadsToday: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendancePct: number;
  attendanceDenom: number;
  lessonsToday: number;
  activeStudents: number;
  debtSplit: DebtSplit;
  yesterdaySnapshot: { totalDebt: number; debtorCount: number } | null;
  totalDebt: number;
  debtorCount: number;
  mtdIncome: number;
  mtdExpense: number;
  mtdAdvance: number;
  mtdCashNet: number;
  attribution: IncomeAttribution | null;
  canonicalNet: number | null;
  expectedValue: number | null;
  monthCharges: MonthCharges | null;
  salary: SalaryTopUp | null;
  taskLine: string | null;
  flags: string[];
  light: { emoji: string; subtitle: string };
}
