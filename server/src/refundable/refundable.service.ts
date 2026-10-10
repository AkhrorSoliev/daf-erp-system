import { Injectable } from '@nestjs/common';
import {
  CashAccountType,
  PaymentStatus,
  Prisma,
  RefundStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { studentNotFound } from '../common/auth/other-branch';
import {
  studentBranchWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { tashkentDateStr, tashkentDayStartUtc } from '../common/date/tashkent';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { activeStudentWhere } from '../students/shared/active-student-where';
import { matchesSearch } from '../payments/debt/debt-list.math';
import {
  loadNoticeText,
  loadTransferState,
} from '../balance-notices/load-transfer-state';
import type { TransferState } from '../balance-notices/transfer-condition';
import { htmlToPlainText } from '../refunds/refund-student-text';
import { refundableWorkbook } from './refundable.excel';
import {
  chipCounts,
  pendingBranchId,
  refundableTabTotals,
  sortRefundableRows,
  toPendingRow,
  toRefundableRow,
  type AgeBucket,
  type PendingFact,
  type PendingRefundRow,
  type RefundableRow,
  type RefundableTab,
} from './refundable.math';
import type { RefundableQueryDto } from './dto/refundable-query.dto';

/** One branch per student (D5); the lowest id keeps the pick deterministic. */
const ONE_BRANCH = {
  select: { branchId: true },
  orderBy: { branchId: 'asc' },
  take: 1,
} satisfies Prisma.Student$branchesArgs;

const PENDING_SELECT = {
  id: true,
  studentId: true,
  requestedAmount: true,
  approvedAmount: true,
  createdAt: true,
  dueDate: true,
  reason: true,
  student: {
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      branches: ONE_BRANCH,
    },
  },
} satisfies Prisma.RefundSelect;

export interface RefundableListResponse {
  summary: { total: number; count: number };
  tabs: Record<RefundableTab, { total: number; count: number }>;
  chips: Record<'all' | AgeBucket, number>;
  rows: {
    data: RefundableRow[];
    total: number;
    page: number;
    pageSize: number;
  };
  pending: {
    data: PendingRefundRow[];
    total: number;
    sum: number;
    page: number;
    pageSize: number;
    historyCount: number;
    lastHandedOverAt: string | null;
  };
  cashAccounts: {
    id: string;
    name: string;
    type: CashAccountType;
    branchId: number;
  }[];
}

export interface RefundableDrawer {
  student: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    status: StudentStatus;
    branchId: number | null;
  };
  balance: number;
  kind: RefundableTab | null;
  since: string | null;
  days: number | null;
  lastGroup: { id: string; name: string } | null;
  lastPayment: { createdAt: string; amount: number } | null;
  telegramLinked: boolean;
  /** The bot text «Botga xabar yuborish» would send now; null = no phone. */
  noticePreview: string | null;
  transfer: TransferState;
}

/**
 * «Qaytariladigan pul» (spec B2b §3, ADR-0076): the money of students who are
 * not studying, by ADR-0067's kinds, and the open refund requests. Every row
 * of every tab is built in one batch (three queries) — the totals, the chips,
 * the pages and the Excel are cut from it.
 * ponytail: fine at hundreds of non-studying students with money; split the
 * page facts out (as the debt page does) if it reaches thousands.
 */
@Injectable()
export class RefundableService {
  constructor(private prisma: PrismaService) {}

  async list(
    companyId: number,
    scope: ReportBranchIds,
    q: RefundableQueryDto,
    now: Date = new Date(),
  ): Promise<RefundableListResponse> {
    const today = tashkentDateStr(now);
    const tab = q.tab ?? 'muzlatilgan';
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const pendingPage = q.pendingPage ?? 1;
    const pendingPageSize = q.pendingPageSize ?? 10;

    const [all, pending, pendingTotals] = await Promise.all([
      this.rows(companyId, scope, today),
      this.pendingRows(companyId, scope, today, {
        skip: (pendingPage - 1) * pendingPageSize,
        take: pendingPageSize,
      }),
      this.pendingTotals(companyId, scope),
    ]);
    const shown = all.filter(
      (r) =>
        r.kind === tab &&
        (!q.search || matchesSearch(r, q.search)) &&
        (tab !== 'muzlatilgan' || !q.age || r.ageBucket === q.age),
    );
    return {
      summary: {
        total: all.reduce((s, r) => s + r.balance, 0),
        count: all.length,
      },
      tabs: refundableTabTotals(all),
      chips: chipCounts(all.filter((r) => r.kind === 'muzlatilgan')),
      rows: {
        data: shown.slice((page - 1) * pageSize, page * pageSize),
        total: shown.length,
        page,
        pageSize,
      },
      pending: {
        data: pending,
        page: pendingPage,
        pageSize: pendingPageSize,
        ...pendingTotals,
      },
      cashAccounts: await this.cashAccounts(companyId, pending),
    };
  }

  /** The drawer (spec §3.5). Another branch's student is ADR-0063's 404. */
  async student(
    companyId: number,
    scope: ReportBranchIds,
    ceiling: ReportBranchIds,
    id: number,
    now: Date = new Date(),
  ): Promise<RefundableDrawer> {
    const s = await this.prisma.student.findFirst({
      where: { id, companyId, deletedAt: null, ...studentBranchWhere(scope) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        balance: true,
        status: true,
        statusChangedAt: true,
        createdAt: true,
        telegramChatId: true,
        telegramDisconnectedAt: true,
        branches: ONE_BRANCH,
      },
    });
    if (!s)
      throw await studentNotFound(this.prisma, companyId, id, scope, ceiling);
    const branchId = s.branches[0]?.branchId ?? null;
    const [studying, last, payment, transfer, noticePreview] =
      await Promise.all([
        this.prisma.student.count({ where: { id, ...activeStudentWhere() } }),
        this.prisma.enrollment.findFirst({
          where: { studentId: id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            statusChangedAt: true,
            group: { select: { id: true, name: true } },
          },
        }),
        this.prisma.payment.findFirst({
          where: { companyId, studentId: id, status: PaymentStatus.COMPLETED },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, amount: true },
        }),
        loadTransferState(this.prisma, s, branchId, now),
        // The bot sends the HTML; the page shows it as plain text (spec §5.3).
        loadNoticeText(
          this.prisma,
          { firstName: s.firstName, balance: s.balance, branchId, companyId },
          now,
        ).then((html) => (html === null ? null : htmlToPlainText(html))),
      ]);
    const row =
      studying > 0
        ? null
        : toRefundableRow(s, last, null, tashkentDateStr(now));
    return {
      student: {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        status: s.status,
        branchId,
      },
      balance: s.balance,
      kind: row?.kind ?? null,
      since: row?.since ?? null,
      days: row?.days ?? null,
      lastGroup: last ? { id: last.group.id, name: last.group.name } : null,
      lastPayment: payment
        ? { createdAt: payment.createdAt.toISOString(), amount: payment.amount }
        : null,
      // ADR-0066: a chat that refused the bot is not «ulangan».
      telegramLinked: !!s.telegramChatId && s.telegramDisconnectedAt === null,
      noticePreview,
      transfer,
    };
  }

  /** Spec §3.7: four sheets, the caller's scope, the active search on the student sheets. */
  async excel(
    companyId: number,
    scope: ReportBranchIds,
    q: RefundableQueryDto,
    now: Date = new Date(),
  ): Promise<{ buffer: Buffer; filename: string }> {
    const today = tashkentDateStr(now);
    const [all, pending] = await Promise.all([
      this.rows(companyId, scope, today),
      this.pendingRows(companyId, scope, today),
    ]);
    const found = q.search
      ? all.filter((r) => matchesSearch(r, q.search!))
      : all;
    const of = (tab: RefundableTab) => found.filter((r) => r.kind === tab);
    return {
      buffer: await refundableWorkbook({
        pending,
        muzlatilgan: of('muzlatilgan'),
        guruhsiz: of('guruhsiz'),
        ketgan: of('ketgan'),
      }),
      filename: `qaytariladigan-pul-${today}.xlsx`,
    };
  }

  /** Every non-studying student in scope with money on the balance, as rows. */
  private async rows(
    companyId: number,
    scope: ReportBranchIds,
    today: string,
  ): Promise<RefundableRow[]> {
    const students = await this.prisma.student.findMany({
      where: {
        companyId,
        deletedAt: null,
        balance: { gt: 0 },
        NOT: activeStudentWhere(),
        ...studentBranchWhere(scope),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        balance: true,
        status: true,
        statusChangedAt: true,
        createdAt: true,
      },
    });
    if (students.length === 0) return [];
    const ids = students.map((s) => s.id);
    const latestPer = {
      orderBy: [{ studentId: 'asc' as const }, { createdAt: 'desc' as const }],
      distinct: ['studentId' as const],
    };
    const [enrollments, notices] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { studentId: { in: ids }, deletedAt: null },
        ...latestPer,
        select: {
          studentId: true,
          statusChangedAt: true,
          group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.balanceNotice.findMany({
        where: { studentId: { in: ids } },
        ...latestPer,
        select: { studentId: true, createdAt: true, channel: true },
      }),
    ]);
    const enrolOf = new Map(enrollments.map((e) => [e.studentId, e]));
    const noticeOf = new Map(notices.map((n) => [n.studentId, n]));
    return sortRefundableRows(
      students.map((s) =>
        toRefundableRow(
          s,
          enrolOf.get(s.id) ?? null,
          noticeOf.get(s.id) ?? null,
          today,
        ),
      ),
    );
  }

  private pendingWhere(
    companyId: number,
    scope: ReportBranchIds,
  ): Prisma.RefundWhereInput {
    return {
      companyId,
      status: RefundStatus.REQUESTED,
      student: studentBranchWhere(scope),
    };
  }

  /** Open requests, oldest due first; `paging` omitted = all (Excel). */
  private async pendingRows(
    companyId: number,
    scope: ReportBranchIds,
    today: string,
    paging?: { skip: number; take: number },
  ): Promise<PendingRefundRow[]> {
    const rows: PendingFact[] = await this.prisma.refund.findMany({
      where: this.pendingWhere(companyId, scope),
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      ...paging,
      select: PENDING_SELECT,
    });
    if (rows.length === 0) return [];
    // One holiday read per branch, over today and every due day of the page.
    const days = [
      today,
      ...rows.flatMap((r) => (r.dueDate ? [tashkentDateStr(r.dueDate)] : [])),
    ].sort();
    const branchIds = [...new Set(rows.map(pendingBranchId))];
    const sets = await Promise.all(
      branchIds.map((b) =>
        buildHolidayDateSet(
          this.prisma,
          tashkentDayStartUtc(days[0]),
          tashkentDayStartUtc(days[days.length - 1]),
          b,
        ),
      ),
    );
    const holidaysOf = new Map(branchIds.map((b, i) => [b, sets[i]]));
    return rows.map((r) =>
      toPendingRow(r, today, holidaysOf.get(pendingBranchId(r)) ?? new Set()),
    );
  }

  private async pendingTotals(companyId: number, scope: ReportBranchIds) {
    const closed = { companyId, student: studentBranchWhere(scope) };
    const [agg, historyCount, last] = await Promise.all([
      this.prisma.refund.aggregate({
        where: this.pendingWhere(companyId, scope),
        _count: { _all: true },
        _sum: { requestedAmount: true },
      }),
      this.prisma.refund.count({
        where: {
          ...closed,
          status: { in: [RefundStatus.COMPLETED, RefundStatus.REJECTED] },
        },
      }),
      // «Oxirgisi dd.MM da berilgan.» — processedAt is the hand-over, old rows included.
      this.prisma.refund.findFirst({
        where: {
          ...closed,
          status: RefundStatus.COMPLETED,
          processedAt: { not: null },
        },
        orderBy: { processedAt: 'desc' },
        select: { processedAt: true },
      }),
    ]);
    return {
      total: agg._count._all,
      sum: agg._sum.requestedAmount ?? 0,
      historyCount,
      lastHandedOverAt: last?.processedAt?.toISOString() ?? null,
    };
  }

  /** The drawers «Berildi» may name: active accounts of the pending page's branches, no balances. */
  private async cashAccounts(companyId: number, rows: PendingRefundRow[]) {
    const branchIds = [
      ...new Set(
        rows.map((r) => r.branchId).filter((b): b is number => b !== null),
      ),
    ];
    if (branchIds.length === 0) return [];
    return this.prisma.cashAccount.findMany({
      where: {
        companyId,
        branchId: { in: branchIds },
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ branchId: 'asc' }, { type: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, type: true, branchId: true },
    });
  }
}
