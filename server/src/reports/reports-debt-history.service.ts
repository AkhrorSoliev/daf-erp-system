import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StudentStatus, TransactionType } from '@prisma/client';
import {
  type ReportBranchIds,
  studentBranchWhere,
} from '../common/finance/report-branch-scope';
import {
  DEBT_FLOOR_MONTH,
  enumerateMonths,
  monthLabel,
  nextMonthKey,
  tashkentMonthKey,
  tashkentMonthStart,
} from './debt-history.util';

/**
 * Which slice of the student body a debt figure covers. The page's segmented
 * control maps 1:1 onto this — see `resolveStatusFilter`.
 */
export type DebtStatusFilter = 'all' | 'active' | 'inactive';

/** A student row as the replay needs it. */
interface ReplayStudent {
  id: number;
  balance: number;
  status: StudentStatus;
  deletedAt: Date | null;
}

/** Per-month movement of the DEBT component, split by what caused it. */
interface FlowBucket {
  debtAdded: number;
  debtPaid: number;
  debtForgiven: number;
  debtOther: number;
}
const emptyFlow = (): FlowBucket => ({
  debtAdded: 0,
  debtPaid: 0,
  debtForgiven: 0,
  debtOther: 0,
});

export interface DebtMonthRow {
  monthKey: string;
  label: string;
  /** True for the month that has not closed yet — its figures still move. */
  isCurrent: boolean;

  // ── The month's OWN debt: how much debt this month created ──
  /**
   * Debt that arose in THIS month — lessons taught to students whose balance
   * could not cover them. Independent of what happened afterwards, so it is a
   * property of the month rather than of today. `monthUnpaid` is the part of it
   * still outstanding; the difference has since been paid or forgiven.
   */
  monthDebt: number;
  /** People who fell into debt during this month. */
  monthDebtorCount: number;
  /** This month's share of all debt ever created, 0–100. */
  monthShare: number;
  /** Of `monthDebt`, what is still unpaid today. */
  monthUnpaid: number;

  // ── Aging: TODAY's debt, split by the month the charge was incurred ──
  /**
   * Of what is owed right now, how much arose in THIS month and is still
   * unpaid. Unlike `closingDebt` these are disjoint buckets, so they sum — and
   * they sum exactly to today's total debt, which is what makes a «Jami» row
   * on this table meaningful. Also the only view that can tell two months
   * apart for a student who stopped being billed: a frozen debtor showed the
   * same cumulative figure under every month before this existed.
   */
  agedDebt: number;
  /** People carrying unpaid debt from this month. Does NOT sum across months —
   *  one student's debt can span several (204 of 450 do). */
  agedDebtorCount: number;
  /** This bucket's share of today's total debt, 0–100. */
  agedShare: number;

  // ── Roll-forward: opening + added − paid − forgiven − other = closing ──
  openingDebt: number;
  debtAdded: number;
  debtPaid: number;
  debtForgiven: number;
  debtOther: number;
  closingDebt: number;
  /** closingDebt − openingDebt. Positive = debt grew that month. */
  delta: number;

  // ── Cohort: what happened to the people who closed THIS month in debt ──
  debtorCount: number;
  recovered: number;
  writtenOff: number;
  remaining: number;
  remainingDebtorCount: number;
  recoveryRate: number;
  /** What that same cohort owes TODAY — usually far above `remaining`. */
  cohortDebtNow: number;
  cohortDebtorsNow: number;
}

export interface DebtStatusSlice {
  status: StudentStatus | 'ARCHIVED_SOFT';
  label: string;
  amount: number;
  count: number;
  /** Share of the company-wide current debt, 0–100. */
  share: number;
}

export interface LongestDebtor {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  groups: string[];
  debt: number;
  /** First instant of the unbroken debt streak that reaches today. */
  since: Date;
  sinceMonthKey: string;
  /** Whole Tashkent months the streak has lasted (0 = started this month). */
  monthsInDebt: number;
  status: StudentStatus;
  isArchived: boolean;
}

export interface DebtHistoryResponse {
  months: DebtMonthRow[];
  /**
   * FLOW columns only. Balance columns (opening/closing) are deliberately
   * absent: summing month-end balances counts the same debt once per month.
   */
  totals: {
    debtAdded: number;
    debtPaid: number;
    debtForgiven: number;
    debtOther: number;
  };
  current: {
    debt: number;
    debtorCount: number;
    /** Movement since the previous month's close (the last CLOSED month). */
    delta: number;
    /** Always company-wide (unfiltered) — this block doubles as the filter. */
    byStatus: DebtStatusSlice[];
  };
  longestDebtors: LongestDebtor[];
  statusFilter: DebtStatusFilter;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Faol',
  INACTIVE: 'Nofaol',
  FROZEN: 'Muzlatilgan',
  GRADUATED: 'Bitirgan',
  EXPELLED: 'Chetlatilgan',
  ARCHIVED: 'Arxivlangan',
  PROSPECT: "Ro'yxatdan o'tgan",
  ARCHIVED_SOFT: 'Arxivlangan',
};

const LONGEST_DEBTORS_LIMIT = 10;

/**
 * «Oylik qarzdorlik» — everything the /payments/debt-history page shows, from
 * ONE chronological replay of the student ledger.
 *
 * Why a replay rather than aggregate queries: total debt is `Σ max(0, −balance)`,
 * and a `max()` does not distribute over a sum. You cannot ask the database
 * "how much did debt grow in June" — a student swinging +100 000 → −50 000 moved
 * 150 000 of balance but only 50 000 of DEBT. Only a per-student walk can split
 * that, which is also what lets every so'm be attributed to the month it moved
 * in and to the reason that moved it.
 *
 * The replay is exact because `Student.balance` is a pure accumulator: a
 * production check found `balance === Σ Transaction.amount` for all 859
 * students, 0 so'm of drift. Reversals are NOT filtered — `reverseTransaction`
 * writes its counter-row with the original's `type`, so including both halves
 * nets them to zero (filtering `reversedAt: null` would keep the undo and drop
 * the original — the bug this service replaces).
 *
 * Two different questions live here and are deliberately kept apart:
 *  • the ROLL-FORWARD (`debtAdded/Paid/Forgiven/Other`) — a period measure that
 *    foots and sums;
 *  • the COHORT (`recovered/remaining`) — "of the people who ended May in debt,
 *    how much have they since paid", which is a nested-window measure and must
 *    NEVER be summed across months.
 */
@Injectable()
export class ReportsDebtHistoryService {
  constructor(private prisma: PrismaService) {}

  async getDebtHistory(
    companyId: number,
    scope: ReportBranchIds,
    statusFilter: DebtStatusFilter = 'all',
  ): Promise<DebtHistoryResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { systemStartDate: true },
    });
    const floorKey = company?.systemStartDate
      ? tashkentMonthKey(company.systemStartDate)
      : DEBT_FLOOR_MONTH;
    const currentKey = tashkentMonthKey(new Date());
    const monthKeys = enumerateMonths(floorKey, currentKey);

    // Scoping this ONE query scopes everything below it: the replay, the
    // cohorts and the longest-debtor list all walk the ids it returns.
    const allStudents = await this.prisma.student.findMany({
      where: { companyId, ...studentBranchWhere(scope) },
      select: { id: true, balance: true, status: true, deletedAt: true },
    });

    // The status card is the filter control, so it must show every slice —
    // including the ones the current filter excludes.
    const byStatus = this.buildStatusSlices(allStudents);

    const students = allStudents.filter((s) => matchesFilter(s, statusFilter));
    if (students.length === 0) {
      return this.emptyResponse(monthKeys, byStatus, statusFilter);
    }

    const replay = await this.replay(companyId, students, monthKeys);

    const months = this.buildMonths(monthKeys, currentKey, replay);
    const totals = months.reduce(
      (acc, m) => ({
        debtAdded: acc.debtAdded + m.debtAdded,
        debtPaid: acc.debtPaid + m.debtPaid,
        debtForgiven: acc.debtForgiven + m.debtForgiven,
        debtOther: acc.debtOther + m.debtOther,
      }),
      { debtAdded: 0, debtPaid: 0, debtForgiven: 0, debtOther: 0 },
    );

    const currentRow = months[months.length - 1];
    const previousRow = months[months.length - 2];
    const longestDebtors = await this.buildLongestDebtors(replay, students);

    return {
      months,
      totals,
      current: {
        debt: currentRow?.closingDebt ?? 0,
        debtorCount: currentRow?.debtorCount ?? 0,
        // Against the last CLOSED month, not against this month's own opening —
        // "how far have we moved since the last time the books stood still".
        delta: previousRow
          ? (currentRow?.closingDebt ?? 0) - previousRow.closingDebt
          : (currentRow?.delta ?? 0),
        byStatus,
      },
      longestDebtors,
      statusFilter,
    };
  }

  /**
   * Who still owes money that arose in ONE given month.
   *
   * This is the month dialog's list, and it answers a different question from
   * the old cohort drill-down: not "who ended the month in debt" (which repeats
   * the same cumulative figure under every later month for a student who
   * stopped being billed) but "whose unpaid charges from THIS month are still
   * outstanding, and how much". A student appears under each month their debt
   * came from, with that month's share — so June and July show different
   * amounts for the same person, and `otherMonths` flags that the rest of their
   * debt lives elsewhere.
   */
  async getMonthAgingDetail(
    companyId: number,
    monthKey: string,
    scope: ReportBranchIds,
    statusFilter: DebtStatusFilter = 'all',
  ): Promise<{
    monthKey: string;
    label: string;
    totals: {
      /** Debt created in this month — ties EXACTLY to the table row. */
      debt: number;
      debtorCount: number;
      /** Of that, still unpaid today. */
      unpaid: number;
      unpaidDebtorCount: number;
    };
    debtors: Array<{
      id: number;
      firstName: string;
      lastName: string;
      phone: string | null;
      groups: string[];
      status: StudentStatus;
      isArchived: boolean;
      /** Debt this student ran up in THIS month (paid or not). */
      monthDebt: number;
      /** Of that, still unpaid today. Zero means they have settled it. */
      monthUnpaid: number;
      /** Everything this student owes today, across all months. */
      totalDebt: number;
      /** Other months this student also carries unpaid debt from. */
      otherMonths: Array<{ monthKey: string; label: string; amount: number }>;
    }>;
    writeOffs: Array<{
      id: string;
      studentId: number | null;
      firstName: string;
      lastName: string;
      amount: number;
      reason: string | null;
      performedBy: string | null;
      createdAt: Date;
    }>;
  }> {
    const currentKey = tashkentMonthKey(new Date());
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { systemStartDate: true },
    });
    const floorKey = company?.systemStartDate
      ? tashkentMonthKey(company.systemStartDate)
      : DEBT_FLOOR_MONTH;
    const monthKeys = enumerateMonths(floorKey, currentKey);

    const allStudents = await this.prisma.student.findMany({
      where: { companyId, ...studentBranchWhere(scope) },
      select: { id: true, balance: true, status: true, deletedAt: true },
    });
    const students = allStudents.filter((s) => matchesFilter(s, statusFilter));

    const empty = {
      monthKey,
      label: monthLabel(monthKey),
      totals: { debt: 0, debtorCount: 0, unpaid: 0, unpaidDebtorCount: 0 },
      debtors: [],
      writeOffs: [],
    };
    if (students.length === 0) return empty;

    const { agingPerStudent, addedPerStudent } = await this.replay(
      companyId,
      students,
      monthKeys,
    );

    // Only those who STILL owe from this month. Someone who has settled it is
    // not a debtor and does not belong on a debtor list — and including them
    // meant the dialog's total no longer matched the row that opened it.
    const hits = students
      .map((s) => ({
        student: s,
        added: addedPerStudent.get(s.id),
        mine: agingPerStudent.get(s.id),
      }))
      .filter((h) => (h.mine?.get(monthKey) ?? 0) > 0);
    if (hits.length === 0) {
      return { ...empty, writeOffs: await this.monthWriteOffs(companyId, monthKey, students) };
    }

    const enriched = await this.prisma.student.findMany({
      where: { id: { in: hits.map((h) => h.student.id) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          select: { group: { select: { name: true } } },
        },
      },
    });
    const byId = new Map(enriched.map((e) => [e.id, e]));

    const debtors = hits
      .map(({ student, added, mine }) => {
        const e = byId.get(student.id);
        const monthDebt = added!.get(monthKey) ?? 0;
        const monthUnpaid = mine?.get(monthKey) ?? 0;
        const otherMonths = [...(mine?.entries() ?? [])]
          .filter(([k, v]) => k !== monthKey && v > 0)
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([k, v]) => ({ monthKey: k, label: monthLabel(k), amount: v }));
        return {
          id: student.id,
          firstName: e?.firstName ?? '',
          lastName: e?.lastName ?? '',
          phone: e?.phone ?? null,
          groups: e?.enrollments.map((en) => en.group.name) ?? [],
          status: student.status,
          isArchived: student.deletedAt != null,
          monthDebt,
          monthUnpaid,
          totalDebt: student.balance < 0 ? -student.balance : 0,
          otherMonths,
        };
      })
      .sort((a, b) => b.monthUnpaid - a.monthUnpaid);

    return {
      monthKey,
      label: monthLabel(monthKey),
      totals: {
        // `debt` IS the outstanding figure — the one number the page reports
        // per month, and the one the table row shows.
        debt: debtors.reduce((s, d) => s + d.monthUnpaid, 0),
        debtorCount: debtors.length,
        unpaid: debtors.reduce((s, d) => s + d.monthUnpaid, 0),
        unpaidDebtorCount: debtors.length,
      },
      debtors,
      writeOffs: await this.monthWriteOffs(companyId, monthKey, students),
    };
  }

  /**
   * Debt forgiven DURING this month. Forgiven money is gone from the aging
   * buckets by construction (the credit consumed a fragment), so this list is
   * the only place it stays visible — and a write-off is the one debt outcome
   * that needs a name and a reason attached to it.
   */
  private async monthWriteOffs(
    companyId: number,
    monthKey: string,
    students: ReplayStudent[],
  ) {
    const start = tashkentMonthStart(monthKey);
    const end = tashkentMonthStart(nextMonthKey(monthKey));
    const rows = await this.prisma.transaction.findMany({
      where: {
        companyId,
        studentId: { in: students.map((s) => s.id) },
        type: TransactionType.DEBT_WRITE_OFF,
        createdAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        studentId: true,
        amount: true,
        createdAt: true,
        description: true,
        metadata: true,
        student: { select: { firstName: true, lastName: true } },
        performedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((t) => {
      const meta = (t.metadata as { reason?: string } | null) ?? null;
      return {
        id: t.id,
        studentId: t.studentId,
        firstName: t.student?.firstName ?? '',
        lastName: t.student?.lastName ?? '',
        amount: t.amount,
        reason: meta?.reason ?? t.description ?? null,
        performedBy: t.performedBy
          ? `${t.performedBy.firstName} ${t.performedBy.lastName}`.trim()
          : null,
        createdAt: t.createdAt,
      };
    });
  }

  /**
   * The single chronological walk. Returns, per student, the month-end debt of
   * every month, the payments they made in each month, and the start of the
   * unbroken debt streak that reaches today (null when they owe nothing now).
   */
  private async replay(
    companyId: number,
    students: ReplayStudent[],
    monthKeys: string[],
  ) {
    const ids = students.map((s) => s.id);
    // `amount: { not: 0 }` drops LESSON_CONSUMPTION, the one row type written
    // without a balance lock; every other type moves the balance.
    const rows = await this.prisma.transaction.findMany({
      where: { companyId, studentId: { in: ids }, amount: { not: 0 } },
      select: {
        studentId: true,
        type: true,
        amount: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const perStudent = new Map<number, typeof rows>();
    for (const r of rows) {
      if (r.studentId == null) continue;
      const list = perStudent.get(r.studentId);
      if (list) list.push(r);
      else perStudent.set(r.studentId, [r]);
    }

    const flowByMonth = new Map<string, FlowBucket>();
    const closingByMonth = new Map<string, number>();
    const debtorsByMonth = new Map<string, number>();
    /** studentId → (origin month → still-unpaid amount from that month). */
    const agingPerStudent = new Map<number, Map<string, number>>();
    /** studentId → (month → debt CREATED that month, paid or not). */
    const addedPerStudent = new Map<number, Map<string, number>>();
    // Per student: month-end debt, payments made in each month, streak start.
    const closingPerStudent = new Map<number, Map<string, number>>();
    const paymentsPerStudent = new Map<number, Map<string, number>>();
    const debtSince = new Map<number, Date>();

    const flowOf = (key: string) => {
      let b = flowByMonth.get(key);
      if (!b) {
        b = emptyFlow();
        flowByMonth.set(key, b);
      }
      return b;
    };

    for (const student of students) {
      const list = perStudent.get(student.id) ?? [];
      let balance = 0;
      let debt = 0;
      let since: Date | null = null;
      const touched = new Map<string, number>();
      const paid = new Map<string, number>();
      const added = new Map<string, number>();

      // FIFO aging queue: every uncovered charge is parked under the month it
      // landed in, and every credit eats the OLDEST fragment first — which is
      // how the billing engine itself settles. Whatever is left at the end IS
      // the student's current debt, already split by where it came from.
      const aging: Array<{ month: string; left: number }> = [];
      let head = 0;
      let prepaid = 0;

      for (const r of list) {
        const key = tashkentMonthKey(r.createdAt);
        const before = debt;
        balance += r.amount;
        debt = balance < 0 ? -balance : 0;

        if (r.amount < 0) {
          // A charge: an advance absorbs it first; only the uncovered remainder
          // becomes debt attributable to this month.
          let debit = -r.amount;
          const absorbed = Math.min(prepaid, debit);
          prepaid -= absorbed;
          debit -= absorbed;
          if (debit > 0) {
            aging.push({ month: key, left: debit });
            added.set(key, (added.get(key) ?? 0) + debit);
          }
        } else {
          let credit = r.amount;
          while (credit > 0 && head < aging.length) {
            const frag = aging[head];
            const take = Math.min(credit, frag.left);
            frag.left -= take;
            credit -= take;
            if (frag.left === 0) head++;
          }
          if (credit > 0) prepaid += credit;
        }

        // The streak that matters is "in debt continuously until now", so it
        // restarts every time the balance climbs back to zero or above.
        if (before === 0 && debt > 0) since = r.createdAt;
        else if (debt === 0) since = null;

        const change = debt - before;
        if (change !== 0) {
          const bucket = flowOf(key);
          if (change > 0) {
            // Lessons billed, mock-exam fees — anything that deepened the hole.
            bucket.debtAdded += change;
          } else if (r.type === TransactionType.PAYMENT) {
            bucket.debtPaid += -change;
          } else if (r.type === TransactionType.DEBT_WRITE_OFF) {
            bucket.debtForgiven += -change;
          } else {
            // ADJUSTMENT / INITIAL_BALANCE / REFUND — real debt relief, but not
            // money the centre collected, so it never enters «To'landi».
            bucket.debtOther += -change;
          }
        }

        if (r.type === TransactionType.PAYMENT && r.amount > 0) {
          paid.set(key, (paid.get(key) ?? 0) + r.amount);
        }
        touched.set(key, debt);
      }

      // Whatever survived the FIFO walk is this student's live debt, already
      // labelled by origin month.
      const mine = new Map<string, number>();
      for (let i = head; i < aging.length; i++) {
        const frag = aging[i];
        if (frag.left > 0) {
          mine.set(frag.month, (mine.get(frag.month) ?? 0) + frag.left);
        }
      }
      if (mine.size > 0) agingPerStudent.set(student.id, mine);
      if (added.size > 0) addedPerStudent.set(student.id, added);

      // Carry the last known debt across months with no ledger activity.
      let carry = 0;
      const perMonth = new Map<string, number>();
      for (const key of monthKeys) {
        const atMonthEnd = touched.get(key);
        if (atMonthEnd !== undefined) carry = atMonthEnd;
        perMonth.set(key, carry);
        closingByMonth.set(key, (closingByMonth.get(key) ?? 0) + carry);
        if (carry > 0) {
          debtorsByMonth.set(key, (debtorsByMonth.get(key) ?? 0) + 1);
        }
      }
      closingPerStudent.set(student.id, perMonth);
      paymentsPerStudent.set(student.id, paid);
      if (debt > 0 && since) debtSince.set(student.id, since);
    }

    return {
      monthKeys,
      flowByMonth,
      closingByMonth,
      debtorsByMonth,
      closingPerStudent,
      paymentsPerStudent,
      agingPerStudent,
      addedPerStudent,
      debtSince,
      students,
    };
  }

  /** Assemble the per-month rows: roll-forward legs plus the cohort legs. */
  private buildMonths(
    monthKeys: string[],
    currentKey: string,
    replay: Awaited<ReturnType<ReportsDebtHistoryService['replay']>>,
  ): DebtMonthRow[] {
    const {
      flowByMonth,
      closingByMonth,
      debtorsByMonth,
      closingPerStudent,
      paymentsPerStudent,
      agingPerStudent,
      addedPerStudent,
      students,
    } = replay;

    // Today's debt, bucketed by the month each unpaid charge landed in. These
    // buckets are disjoint and sum to the live total — the property that makes
    // the table's «Jami» row true.
    // Debt CREATED per month — the month's own figure, independent of whether
    // it was later paid. `people` is who fell into debt that month.
    const createdByMonth = new Map<string, { sum: number; people: number }>();
    let createdTotal = 0;
    for (const added of addedPerStudent.values()) {
      for (const [key, amount] of added) {
        if (amount <= 0) continue;
        const cur = createdByMonth.get(key) ?? { sum: 0, people: 0 };
        cur.sum += amount;
        cur.people += 1;
        createdByMonth.set(key, cur);
        createdTotal += amount;
      }
    }

    const agedByMonth = new Map<string, { sum: number; people: number }>();
    let agedTotal = 0;
    for (const mine of agingPerStudent.values()) {
      for (const [key, amount] of mine) {
        if (amount <= 0) continue;
        const cur = agedByMonth.get(key) ?? { sum: 0, people: 0 };
        cur.sum += amount;
        cur.people += 1;
        agedByMonth.set(key, cur);
        agedTotal += amount;
      }
    }

    const balanceNow = new Map(students.map((s) => [s.id, s.balance]));

    const rows: DebtMonthRow[] = [];
    let opening = 0;

    monthKeys.forEach((monthKey, index) => {
      const flow = flowByMonth.get(monthKey) ?? emptyFlow();
      const closingDebt = closingByMonth.get(monthKey) ?? 0;

      // ── Cohort: everyone whose month-end debt was positive ──
      // `recovered` is capped per student at that month's debt because the
      // system settles oldest-first, so a later month's new debt can never
      // inflate an earlier month's recovery.
      const laterMonths = monthKeys.slice(index + 1);
      let debtorCount = 0;
      let recovered = 0;
      let remaining = 0;
      let remainingDebtorCount = 0;
      let cohortDebtNow = 0;
      let cohortDebtorsNow = 0;

      for (const student of students) {
        const debt = closingPerStudent.get(student.id)?.get(monthKey) ?? 0;
        if (debt <= 0) continue;
        debtorCount++;

        const payments = paymentsPerStudent.get(student.id);
        let paidAfter = 0;
        if (payments) {
          for (const later of laterMonths) paidAfter += payments.get(later) ?? 0;
        }
        const rec = Math.min(debt, Math.max(0, paidAfter));
        recovered += rec;
        const left = debt - rec;
        remaining += left;
        if (left > 0) remainingDebtorCount++;

        const live = balanceNow.get(student.id) ?? 0;
        if (live < 0) {
          cohortDebtNow += -live;
          cohortDebtorsNow++;
        }
      }

      const aged = agedByMonth.get(monthKey) ?? { sum: 0, people: 0 };
      const created = createdByMonth.get(monthKey) ?? { sum: 0, people: 0 };

      rows.push({
        monthKey,
        label: monthLabel(monthKey),
        isCurrent: monthKey === currentKey,
        monthDebt: created.sum,
        monthDebtorCount: created.people,
        monthShare:
          createdTotal > 0
            ? Math.round((created.sum / createdTotal) * 1000) / 10
            : 0,
        monthUnpaid: aged.sum,
        agedDebt: aged.sum,
        agedDebtorCount: aged.people,
        agedShare:
          agedTotal > 0 ? Math.round((aged.sum / agedTotal) * 1000) / 10 : 0,
        openingDebt: opening,
        debtAdded: flow.debtAdded,
        debtPaid: flow.debtPaid,
        debtForgiven: flow.debtForgiven,
        debtOther: flow.debtOther,
        closingDebt,
        delta: closingDebt - opening,
        debtorCount,
        recovered,
        // Kept as a cohort figure (forgiven AFTER that month closed) so the
        // Excel sheet and the drill-down agree; the roll-forward's own
        // write-off leg is `debtForgiven`.
        writtenOff: flow.debtForgiven,
        remaining,
        remainingDebtorCount,
        recoveryRate:
          closingDebt > 0
            ? Math.round((recovered / closingDebt) * 1000) / 10
            : 0,
        cohortDebtNow,
        cohortDebtorsNow,
      });

      opening = closingDebt;
    });

    return rows;
  }

  /**
   * The «eng uzoq qarzdorlar» block — the one thing this page can say that the
   * debtors list cannot: how long the debt has been standing. Ordered by the
   * age of the streak first, size second, because a small three-month-old debt
   * is a worse signal than a large one incurred last week.
   */
  private async buildLongestDebtors(
    replay: Awaited<ReturnType<ReportsDebtHistoryService['replay']>>,
    students: ReplayStudent[],
  ): Promise<LongestDebtor[]> {
    const now = new Date();
    const candidates = students
      .filter((s) => s.balance < 0 && replay.debtSince.has(s.id))
      .map((s) => {
        const since = replay.debtSince.get(s.id)!;
        return {
          student: s,
          since,
          debt: -s.balance,
          monthsInDebt: wholeMonthsBetween(since, now),
        };
      })
      .sort(
        (a, b) => b.monthsInDebt - a.monthsInDebt || b.debt - a.debt,
      )
      .slice(0, LONGEST_DEBTORS_LIMIT);

    if (candidates.length === 0) return [];

    const enriched = await this.prisma.student.findMany({
      where: { id: { in: candidates.map((c) => c.student.id) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          select: { group: { select: { name: true } } },
        },
      },
    });
    const byId = new Map(enriched.map((e) => [e.id, e]));

    return candidates.map((c) => {
      const e = byId.get(c.student.id);
      return {
        id: c.student.id,
        firstName: e?.firstName ?? '',
        lastName: e?.lastName ?? '',
        phone: e?.phone ?? null,
        groups: e?.enrollments.map((en) => en.group.name) ?? [],
        debt: c.debt,
        since: c.since,
        sinceMonthKey: tashkentMonthKey(c.since),
        monthsInDebt: c.monthsInDebt,
        status: c.student.status,
        isArchived: c.student.deletedAt != null,
      };
    });
  }

  /** Current debt split by student status — always company-wide. */
  private buildStatusSlices(students: ReplayStudent[]): DebtStatusSlice[] {
    const acc = new Map<string, { amount: number; count: number }>();
    let total = 0;
    for (const s of students) {
      if (s.balance >= 0) continue;
      const key = s.deletedAt ? 'ARCHIVED_SOFT' : s.status;
      const cur = acc.get(key) ?? { amount: 0, count: 0 };
      cur.amount += -s.balance;
      cur.count++;
      acc.set(key, cur);
      total += -s.balance;
    }
    return [...acc.entries()]
      .map(([status, v]) => ({
        status: status as DebtStatusSlice['status'],
        label: STATUS_LABELS[status] ?? status,
        amount: v.amount,
        count: v.count,
        share: total > 0 ? Math.round((v.amount / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  private emptyResponse(
    monthKeys: string[],
    byStatus: DebtStatusSlice[],
    statusFilter: DebtStatusFilter,
  ): DebtHistoryResponse {
    const currentKey = tashkentMonthKey(new Date());
    return {
      months: monthKeys.map((monthKey) => ({
        monthKey,
        label: monthLabel(monthKey),
        isCurrent: monthKey === currentKey,
        monthDebt: 0,
        monthDebtorCount: 0,
        monthShare: 0,
        monthUnpaid: 0,
        agedDebt: 0,
        agedDebtorCount: 0,
        agedShare: 0,
        openingDebt: 0,
        debtAdded: 0,
        debtPaid: 0,
        debtForgiven: 0,
        debtOther: 0,
        closingDebt: 0,
        delta: 0,
        debtorCount: 0,
        recovered: 0,
        writtenOff: 0,
        remaining: 0,
        remainingDebtorCount: 0,
        recoveryRate: 0,
        cohortDebtNow: 0,
        cohortDebtorsNow: 0,
      })),
      totals: { debtAdded: 0, debtPaid: 0, debtForgiven: 0, debtOther: 0 },
      current: { debt: 0, debtorCount: 0, delta: 0, byStatus },
      longestDebtors: [],
      statusFilter,
    };
  }
}

/** `all` keeps everyone; `active` is the live roster; `inactive` is the rest. */
function matchesFilter(s: ReplayStudent, filter: DebtStatusFilter): boolean {
  if (filter === 'all') return true;
  const isActive = s.status === StudentStatus.ACTIVE && s.deletedAt == null;
  return filter === 'active' ? isActive : !isActive;
}

/** Whole Tashkent months elapsed — 0 while the streak is inside its own month. */
function wholeMonthsBetween(from: Date, to: Date): number {
  const a = new Date(from.getTime() + 5 * 60 * 60 * 1000);
  const b = new Date(to.getTime() + 5 * 60 * 60 * 1000);
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months--;
  return Math.max(0, months);
}
