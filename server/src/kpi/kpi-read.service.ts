import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KpiResultStatus,
  KpiResultType,
  LeadOwnershipKind,
  PaymentPromiseStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isBlockedStatus } from '../common/auth/blocked-user';
import {
  addMonthsToMonthKey,
  tashkentDateStr,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../common/date/tashkent';
import {
  branchIdWhere,
  isEmptyScope,
  userBranchWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { buildHolidayDateSetsByBranch } from '../holidays/holiday-date-set';
import {
  fullName,
  liveOwnedLeadWhere,
  ownershipLogBranchWhere,
} from '../leads/ownership/lead-ownership.service';
import { KpiSettingsService } from './kpi-settings.service';
import {
  KPI_FIRST_MONTH,
  KPI_START,
  explainKpi,
  isKpiEligible,
  recordingSince,
} from './kpi-rules';
import { workingDaysOfMonth } from './kpi-signals';
import {
  assembleOverview,
  monthsFrom,
  recentResultUserIds,
  type LogFact,
  type OverviewBody,
  type ResultFact,
} from './kpi-overview.math';

/** No branch has id 0: the company-wide holidays alone (as `LeadOwnershipService` reads them). */
const COMPANY_WIDE_HOLIDAYS = 0;
const NOT_FOUND = 'Xodim topilmadi';
const FUTURE_MONTH = "Kelajak oyni tanlab bo'lmaydi";
const RESULT_FACT = {
  userId: true,
  type: true,
  status: true,
  amount: true,
  occurredAt: true,
  month: true,
} satisfies Prisma.KpiResultSelect;
const USER_FACT = {
  id: true,
  firstName: true,
  lastName: true,
  deletedAt: true,
  status: true,
  roles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect;
// Typed fallbacks: `cond ? findMany(...) : Promise.resolve([])` would make the
// element a union with `never[]` and break `.map` / `.flatMap` below.
type UserFact = Prisma.UserGetPayload<{ select: typeof USER_FACT }>;
type PaidLead = { userId: number; leadId: string | null };
type MonthRange = { gte: Date; lt: Date };

export interface KpiOverview extends OverviewBody {
  month: string;
  compare: string;
  /**
   * False when `compare` is before 2026-10 (`KPI_FIRST_MONTH`): no KPI data
   * can exist there, so nothing was read for it and every `compare` figure
   * below is an empty 0/null, not a measured one. The page hides ▲/▼, the
   * compare line and the compare series then.
   */
  compareAvailable: boolean;
  status: { enabled: boolean; changedAt: Date | null };
}

export interface KpiResultView {
  id: string;
  type: KpiResultType;
  occurredAt: Date;
  studentId: number;
  studentName: string;
  paymentAmount: number;
  amount: number;
  explanation: string;
  status: KpiResultStatus;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export interface KpiUserView {
  user: { id: number; name: string };
  month: string;
  hasAny: boolean;
  /** False when the month before is before 2026-10: `compareTotal` is then an empty 0, not a measured one. */
  compareAvailable: boolean;
  total: number;
  compareTotal: number;
  months: { month: string; count: number; amount: number }[];
  results: KpiResultView[];
}

/** `?month=` inside [2026-10, the current Tashkent month]; absent = the current one. */
export function kpiMonth(raw: string | undefined, current: string): string {
  const month = raw ?? current;
  if (month < KPI_FIRST_MONTH) {
    throw new BadRequestException('Xodimlar KPI oktabr 2026 dan boshlanadi');
  }
  if (month > current) throw new BadRequestException(FUTURE_MONTH);
  return month;
}

function assertScope(scope: ReportBranchIds): void {
  if (isEmptyScope(scope)) {
    throw new ForbiddenException(
      "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
    );
  }
}

const sumAmount = (list: readonly { amount: number }[]) =>
  list.reduce((s, r) => s + r.amount, 0);

/**
 * The reads of «Xodimlar KPI» (spec §7.7, §7.8). CEO and Branch Director
 * (`kpi.view`); the header branch scope confines results, logs, promises and
 * held leads alike (null = every branch, [] = nothing). Every figure comes
 * from `assembleOverview`.
 */
@Injectable()
export class KpiReadService {
  constructor(
    private prisma: PrismaService,
    private kpiSettings: KpiSettingsService,
  ) {}

  async overview(
    companyId: number,
    scope: ReportBranchIds,
    q: { month?: string; compare?: string },
    now: Date = new Date(),
  ): Promise<KpiOverview> {
    assertScope(scope);
    const current = tashkentMonthKey(now);
    const month = kpiMonth(q.month, current);
    const compare = q.compare ?? addMonthsToMonthKey(month, -1);
    if (compare > current) throw new BadRequestException(FUTURE_MONTH);
    // A month before the first KPI month holds no data: read nothing for it.
    const compareAvailable = compare >= KPI_FIRST_MONTH;
    const today = month === current ? tashkentDateStr(now) : null;
    const branch = branchIdWhere(scope);
    const range = tashkentMonthRangeUtc(month);
    const compareRange = tashkentMonthRangeUtc(compare);
    const active = KpiResultStatus.ACTIVE;
    const taken = [LeadOwnershipKind.CLAIM, LeadOwnershipKind.ASSIGN];
    const expire = [LeadOwnershipKind.EXPIRE];

    const [
      settings,
      monthResults,
      compareResults,
      series,
      held,
      received,
      compareReceived,
      expired,
      compareExpired,
      promises,
    ] = await Promise.all([
      this.kpiSettings.read(companyId),
      this.prisma.kpiResult.findMany({
        where: { companyId, month, ...branch },
        select: RESULT_FACT,
      }),
      // ACTIVE only: a cancelled result is no comparison.
      compareAvailable
        ? this.prisma.kpiResult.findMany({
            where: { companyId, month: compare, status: active, ...branch },
            select: RESULT_FACT,
          })
        : Promise.resolve<ResultFact[]>([]),
      this.prisma.kpiResult.findMany({
        where: {
          companyId,
          status: active,
          month: { in: monthsFrom(month) },
          ...branch,
        },
        select: RESULT_FACT,
      }),
      this.prisma.lead.groupBy({
        by: ['ownerId'],
        where: liveOwnedLeadWhere(companyId, scope),
        _count: { _all: true },
      }),
      this.logs(companyId, taken, range, scope, 'to'),
      compareAvailable
        ? this.logs(companyId, taken, compareRange, scope, 'to')
        : Promise.resolve<LogFact[]>([]),
      this.logs(companyId, expire, range, scope, 'from'),
      compareAvailable
        ? this.logs(companyId, expire, compareRange, scope, 'from')
        : Promise.resolve<LogFact[]>([]),
      this.prisma.paymentPromise.findMany({
        where: {
          companyId,
          status: {
            in: [PaymentPromiseStatus.KEPT, PaymentPromiseStatus.BROKEN],
          },
          promiseDate: range,
          ...branch,
        },
        select: { createdById: true, status: true },
      }),
    ]);

    const heldMap = new Map<number, number>();
    for (const g of held) {
      if (g.ownerId != null) heldMap.set(g.ownerId, g._count._all);
    }
    const leadIds = [
      ...new Set([...received, ...compareReceived].map((l) => l.leadId)),
    ];
    const userIds = [
      ...new Set([...monthResults.map((r) => r.userId), ...heldMap.keys()]),
    ];
    const [paidLeads, users, workingDays] = await Promise.all([
      leadIds.length
        ? this.prisma.kpiResult.findMany({
            where: {
              companyId,
              type: KpiResultType.LEAD_PAID,
              status: active,
              leadId: { in: leadIds },
            },
            select: { userId: true, leadId: true },
          })
        : Promise.resolve<PaidLead[]>([]),
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds }, companyId },
            select: USER_FACT,
          })
        : Promise.resolve<UserFact[]>([]),
      today ? this.workingDays(month, range) : Promise.resolve(null),
    ]);

    const since = recordingSince(settings);
    const body = assembleOverview({
      month,
      compare,
      compareRecorded: `${compare}-01` >= tashkentDateStr(KPI_START),
      today,
      monthResults,
      compareResults,
      series,
      // `series` holds every ACTIVE result of the last six months, so the
      // 7-day window needs no read of its own (and no second 7-day rule).
      recentUserIds: today
        ? recentResultUserIds(series, today)
        : new Set<number>(),
      held: heldMap,
      received,
      compareReceived,
      paidLeads: paidLeads.flatMap((p) =>
        p.leadId ? [{ userId: p.userId, leadId: p.leadId }] : [],
      ),
      expired,
      compareExpired,
      promises: promises.map((p) => ({
        userId: p.createdById,
        status:
          p.status === PaymentPromiseStatus.KEPT
            ? ('KEPT' as const)
            : ('BROKEN' as const),
      })),
      names: new Map(users.map((u) => [u.id, fullName(u)] as const)),
      eligibleHolders: new Set(
        users
          .filter(
            (u) =>
              !u.deletedAt &&
              !isBlockedStatus(u.status) &&
              isKpiEligible(u.roles.map((r) => r.role.name)),
          )
          .map((u) => u.id),
      ),
      workingDays,
      recordingSinceDay: since ? tashkentDateStr(since) : null,
    });
    return {
      month,
      compare,
      compareAvailable,
      status: { enabled: settings.enabled, changedAt: settings.changedAt },
      ...body,
    };
  }

  /** One person's month (spec §7.8): the drawer of the page and the employee's «KPI» tab. */
  async user(
    companyId: number,
    scope: ReportBranchIds,
    userId: number,
    q: { month?: string },
    now: Date = new Date(),
  ): Promise<KpiUserView> {
    assertScope(scope);
    const month = kpiMonth(q.month, tashkentMonthKey(now));
    const branch = branchIdWhere(scope);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException(NOT_FOUND);
    const [inBranch, anyResults] = await Promise.all([
      scope == null
        ? Promise.resolve(1)
        : this.prisma.user.count({
            where: { id: userId, ...userBranchWhere(scope) },
          }),
      this.prisma.kpiResult.count({ where: { companyId, userId, ...branch } }),
    ]);
    // A director sees the staff of their branch, anyone with a result in it
    // and whoever holds a live lead in it (spec §7.10): every overview row opens.
    if (inBranch === 0 && anyResults === 0) {
      const holds = await this.prisma.lead.count({
        where: { ...liveOwnedLeadWhere(companyId, scope), ownerId: userId },
      });
      if (holds === 0) throw new NotFoundException(NOT_FOUND);
    }

    const months = monthsFrom(month);
    const compare = addMonthsToMonthKey(month, -1);
    const [rows, series] = await Promise.all([
      // Every status: the drawer shows the cancelled ones with their reason.
      this.prisma.kpiResult.findMany({
        where: { companyId, userId, month, ...branch },
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.kpiResult.findMany({
        where: {
          companyId,
          userId,
          status: KpiResultStatus.ACTIVE,
          month: { in: months },
          ...branch,
        },
        select: { month: true, amount: true },
      }),
    ]);
    const students = rows.length
      ? await this.prisma.student.findMany({
          where: {
            companyId,
            id: { in: [...new Set(rows.map((r) => r.studentId))] },
          },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const studentName = new Map(
      students.map((s) => [s.id, fullName(s)] as const),
    );
    const ofMonth = (m: string) => series.filter((r) => r.month === m);

    return {
      user: { id: user.id, name: fullName(user) },
      month,
      hasAny: anyResults > 0,
      compareAvailable: compare >= KPI_FIRST_MONTH,
      total: sumAmount(ofMonth(month)),
      compareTotal: sumAmount(ofMonth(compare)),
      months: months.map((m) => ({
        month: m,
        count: ofMonth(m).length,
        amount: sumAmount(ofMonth(m)),
      })),
      results: rows.map((r) => ({
        id: r.id,
        type: r.type,
        occurredAt: r.occurredAt,
        studentId: r.studentId,
        studentName: studentName.get(r.studentId) ?? `#${r.studentId}`,
        paymentAmount: r.paymentAmount,
        amount: r.amount,
        explanation: explainKpi(r),
        status: r.status,
        cancelledAt: r.cancelledAt,
        cancelReason: r.cancelReason,
      })),
    };
  }

  /** Ownership log rows of a month in scope; a lead with no branch is everyone's, as on the board. */
  private async logs(
    companyId: number,
    kinds: LeadOwnershipKind[],
    range: MonthRange,
    scope: ReportBranchIds,
    side: 'to' | 'from',
  ): Promise<LogFact[]> {
    const rows = await this.prisma.leadOwnershipLog.findMany({
      where: {
        companyId,
        kind: { in: kinds },
        createdAt: range,
        ...ownershipLogBranchWhere(scope),
      },
      select: {
        leadId: true,
        toUserId: true,
        fromUserId: true,
        createdAt: true,
      },
    });
    return rows.flatMap((r) => {
      const userId = side === 'to' ? r.toUserId : r.fromUserId;
      return userId == null
        ? []
        : [{ userId, leadId: r.leadId, at: r.createdAt }];
    });
  }

  /** The month's Monday–Saturday days without the company-wide holidays (spec §7.9). */
  private async workingDays(
    month: string,
    range: MonthRange,
  ): Promise<string[]> {
    const holidays = await buildHolidayDateSetsByBranch(
      this.prisma,
      range.gte,
      new Date(range.lt.getTime() - 1),
    );
    const days = holidays(COMPANY_WIDE_HOLIDAYS);
    return workingDaysOfMonth(month, (d) => days.has(d));
  }
}
