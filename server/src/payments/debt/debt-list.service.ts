import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  StudentStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DebtAgeService } from '../../common/finance/debt-age.service';
import {
  branchIdWhere,
  studentBranchWhere,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { tashkentDateStr, tashkentMonthKey } from '../../common/date/tashkent';
import { MonthlyPaymentNoticeService } from '../../billing/monthly-payment-notice.service';
import {
  debtKindOf,
  debtTabAmount,
  loadDebtRows,
  type DebtTab,
} from '../../reports/debt-split';
import { studentNotFound } from '../../common/auth/other-branch';
import { StatementService } from '../../statements/statement.service';
import { debtListWorkbook } from './debt-list.excel';
import {
  drawerMonths,
  filterDebtRows,
  filterOptions,
  groupsOf,
  promiseCell,
  sortDebtRows,
  tabTotals,
  toListRow,
  type DebtDrawer,
  type DebtListItem,
  type DebtListResponse,
  type DebtListRow,
  type EnrollmentFact,
} from './debt-list.math';
import type { DebtListQueryDto } from './dto/debt-list-query.dto';

/** The enrollment shape `groupsOf` reads (newest first). */
export const ENROLLMENT_SELECT = {
  studentId: true,
  status: true,
  deletedAt: true,
  group: {
    select: {
      id: true,
      name: true,
      deletedAt: true,
      statusEnum: true,
      teachers: {
        select: {
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  },
} satisfies Prisma.EnrollmentSelect;

/**
 * The debt page (spec B2a, ADR-0072). Every row and every tab total comes from
 * `loadDebtRows` and its one tab rule; this service only names, filters, sorts
 * and pages the rows, in batched reads.
 */
@Injectable()
export class DebtListService {
  private readonly logger = new Logger(DebtListService.name);

  constructor(
    private prisma: PrismaService,
    private debtAge: DebtAgeService,
    private notices: MonthlyPaymentNoticeService,
    private statements: StatementService,
  ) {}

  async list(
    companyId: number,
    scope: ReportBranchIds,
    q: DebtListQueryDto,
  ): Promise<DebtListResponse> {
    const now = new Date();
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const { rows, split, options } = await this.tabRows(
      companyId,
      scope,
      q,
      now,
    );
    const [data, writeOffCount] = await Promise.all([
      this.withPageFacts(
        companyId,
        rows.slice((page - 1) * pageSize, page * pageSize),
        q.tab,
        now,
      ),
      this.prisma.transaction.count({
        where: {
          companyId,
          type: TransactionType.DEBT_WRITE_OFF,
          reversedAt: null,
          reversedTransactionId: null,
          ...branchIdWhere(scope),
        },
      }),
    ]);
    return {
      data,
      total: rows.length,
      page,
      pageSize,
      sum: rows.reduce((s, r) => s + r.amount, 0),
      tabs: tabTotals(split),
      leftThisMonth: split.notStudying.currentMonth,
      options,
      writeOffCount,
    };
  }

  /**
   * The drawer (spec §2.5). One read open to every role of the page — the
   * statement endpoints refuse Cashier. Its months are the statement model's
   * own allocation (`drawerMonths`), never a new calculation.
   */
  async student(
    companyId: number,
    scope: ReportBranchIds,
    ceiling: ReportBranchIds,
    id: number,
  ): Promise<DebtDrawer> {
    const student = await this.prisma.student.findFirst({
      where: { id, companyId, deletedAt: null, ...studentBranchWhere(scope) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        balance: true,
        status: true,
      },
    });
    if (!student)
      throw await studentNotFound(this.prisma, companyId, id, scope, ceiling);
    const latest = { orderBy: { createdAt: 'desc' as const } };
    const [enrollments, model, payment, call, promise] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { studentId: id, deletedAt: null },
        ...latest,
        select: ENROLLMENT_SELECT,
      }),
      // One odd ledger must not take the payment, call and promise down with it.
      this.statements.build(id, companyId).catch((err: unknown) => {
        this.logger.warn(
          `Debt drawer: statement for student ${id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }),
      this.prisma.payment.findFirst({
        where: { companyId, studentId: id, status: PaymentStatus.COMPLETED },
        ...latest,
        select: { createdAt: true, amount: true, method: true },
      }),
      this.prisma.callLog.findFirst({
        where: { companyId, studentId: id },
        ...latest,
        select: {
          createdAt: true,
          outcome: true,
          note: true,
          calledBy: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.paymentPromise.findFirst({
        where: { companyId, studentId: id },
        ...latest,
        select: { status: true, promiseDate: true, promisedAmount: true },
      }),
    ]);
    // The split's rule on one card: studying = ACTIVE with a live active group.
    const studying =
      student.status === StudentStatus.ACTIVE &&
      groupsOf(null, enrollments).length > 0;
    const kind = studying ? null : debtKindOf(student.status);
    const debt = Math.max(0, -student.balance);
    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone,
      },
      kind,
      groups: groupsOf(kind, enrollments),
      debt,
      months: model ? drawerMonths(model) : [],
      lastPayment: payment
        ? {
            createdAt: payment.createdAt.toISOString(),
            amount: payment.amount,
            method: payment.method,
          }
        : null,
      lastCall: call
        ? {
            createdAt: call.createdAt.toISOString(),
            outcome: call.outcome,
            note: call.note,
            calledByName:
              `${call.calledBy.firstName} ${call.calledBy.lastName}`.trim(),
          }
        : null,
      promise: promiseCell(promise, tashkentDateStr(new Date())),
    };
  }

  /** The open tab with its filters, every page, as xlsx (spec §2.7). */
  async excel(
    companyId: number,
    scope: ReportBranchIds,
    q: DebtListQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const now = new Date();
    const { rows } = await this.tabRows(companyId, scope, q, now);
    const items = await this.withPageFacts(companyId, rows, q.tab, now);
    return {
      buffer: await debtListWorkbook(q.tab, items),
      filename: `qarzdorlik-${q.tab}-${tashkentDateStr(now)}.xlsx`,
    };
  }

  /** Every row of the tab, filtered and sorted — the pages and the Excel are cut from it. */
  protected async tabRows(
    companyId: number,
    scope: ReportBranchIds,
    q: DebtListQueryDto,
    now: Date,
  ) {
    const { rows: all, split } = await loadDebtRows(this.prisma, companyId, {
      branchIds: scope,
    });
    const inTab = all.filter((r) => debtTabAmount(r, q.tab) > 0);
    const ids = inTab.map((r) => r.studentId);
    if (ids.length === 0)
      return { rows: [] as DebtListRow[], split, options: filterOptions([]) };

    const [students, enrollments, promises, ages] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, phone: true },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId: { in: ids }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: ENROLLMENT_SELECT,
      }),
      // The latest promise of each student, any month (spec §2.3 «Va'da»).
      this.prisma.paymentPromise.findMany({
        where: { companyId, studentId: { in: ids } },
        orderBy: [{ studentId: 'asc' }, { createdAt: 'desc' }],
        distinct: ['studentId'],
        select: {
          studentId: true,
          status: true,
          promiseDate: true,
          promisedAmount: true,
        },
      }),
      this.debtAge.getDebtAges(companyId),
    ]);
    const studentOf = new Map(students.map((s) => [s.id, s]));
    const enrolOf = new Map<number, EnrollmentFact[]>();
    for (const e of enrollments)
      enrolOf.set(e.studentId, [...(enrolOf.get(e.studentId) ?? []), e]);
    const promiseOf = new Map(promises.map((p) => [p.studentId, p]));
    const today = tashkentDateStr(now);
    const currentMonth = tashkentMonthKey(now);

    const rows = inTab.map((r) =>
      toListRow(r, q.tab, {
        student: studentOf.get(r.studentId) ?? {
          firstName: '',
          lastName: '',
          phone: null,
        },
        groups: groupsOf(r.kind, enrolOf.get(r.studentId) ?? []),
        promise: promiseCell(promiseOf.get(r.studentId) ?? null, today),
        ageMonths: ages.get(r.studentId)?.months ?? null,
        currentMonth,
      }),
    );
    return {
      rows: sortDebtRows(filterDebtRows(rows, q), q.sort),
      split,
      options: filterOptions(rows),
    };
  }

  /** The facts only a shown row needs: due date (Shu oy), last call, last payment. */
  protected async withPageFacts(
    companyId: number,
    rows: DebtListRow[],
    tab: DebtTab,
    now: Date,
  ): Promise<DebtListItem[]> {
    const ids = rows.map((r) => r.studentId);
    if (ids.length === 0) return [];
    const latest = {
      orderBy: [{ studentId: 'asc' as const }, { createdAt: 'desc' as const }],
      distinct: ['studentId' as const],
    };
    const [calls, payments, dues] = await Promise.all([
      this.prisma.callLog.findMany({
        where: { companyId, studentId: { in: ids } },
        ...latest,
        select: { studentId: true, createdAt: true, outcome: true },
      }),
      this.prisma.payment.findMany({
        where: {
          companyId,
          studentId: { in: ids },
          status: PaymentStatus.COMPLETED,
        },
        ...latest,
        select: { studentId: true, createdAt: true, amount: true },
      }),
      tab === 'shu-oy'
        ? this.notices.dueDates(companyId, ids, tashkentMonthKey(now))
        : Promise.resolve(new Map<number, string>()),
    ]);
    const callOf = new Map(calls.map((c) => [c.studentId, c]));
    const payOf = new Map(payments.map((p) => [p.studentId, p]));
    return rows.map((r) => {
      const call = callOf.get(r.studentId);
      const pay = payOf.get(r.studentId);
      return {
        ...r,
        dueDate: dues.get(r.studentId) ?? null,
        lastCall: call
          ? { createdAt: call.createdAt.toISOString(), outcome: call.outcome }
          : null,
        lastPayment: pay
          ? { createdAt: pay.createdAt.toISOString(), amount: pay.amount }
          : null,
      };
    });
  }
}
