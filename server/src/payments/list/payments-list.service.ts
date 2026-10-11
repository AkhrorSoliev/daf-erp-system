import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { equalsOrIn } from '../../common/dto/to-array';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentMonthKey,
  tashkentRangeUtc,
} from '../../common/date/tashkent';
import {
  attributeIncome,
  loadAttributionRows,
} from '../../common/finance/income-attribution';
import {
  resolvePeriod,
  type ResolvedPeriod,
} from '../../common/finance/period-helpers';
import {
  branchIdWhere,
  groupBranchWhere,
  isEmptyScope,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { dmy, METHOD_LABEL } from '../../statements/statement-text';
import type { EnrollmentStatusEvent } from '../../students/shared/enrollment-status-on';
import type {
  PaymentListQueryDto,
  PaymentPeriodDto,
} from './dto/payment-list-query.dto';
import { formatSom } from '../shared/format-som';
import { monthWord, periodShape } from './part-labels';
import { DayEnrollment, groupIdsOnDay } from './payment-day-groups';
import { parsePaymentPeriod, periodView } from './payment-period';
import { PAYMENT_ROW_SELECT, toPaymentRow } from './payment-row';
import { paymentSearchWhere } from './payment-search';
import { EXCEL_ROW_LIMIT, paymentsWorkbook } from './payments-list.excel';
import type {
  PaymentFilterOptions,
  PaymentListResponse,
  PaymentRow,
  PaymentRowResponse,
  PaymentSummary,
} from './payments-list.types';

type ListFilters = Partial<PaymentListQueryDto>;

const PART_FILTER_LABEL = {
  CURRENT: "Shu oy to'lovi",
  ADVANCE: 'Oldindan',
  LATE: 'Eski qarz',
} as const;
const STATUS_FILTER_LABEL = {
  REVERSED: 'Bekor qilinganlar',
  ALL: 'Hammasi',
} as const;
const personName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`.trim();

interface DayGroup {
  id: string;
  name: string;
  courseId: string;
  teacherIds: number[];
}

/**
 * The To'lovlar page's reads (spec B4 §5). Every read goes through
 * `buildRows`: SQL filters → the cash engine once → payment-day groups →
 * in-memory filters. Archived students' payments are included on purpose
 * (spec §4.4): the engine counts them, so the list must too.
 */
@Injectable()
export class PaymentsListService {
  constructor(private readonly prisma: PrismaService) {}

  async rows(
    companyId: number,
    scope: ReportBranchIds,
    q: PaymentListQueryDto,
  ): Promise<PaymentListResponse> {
    const period = parsePaymentPeriod(q.startDate, q.endDate);
    const all = await this.buildRows(companyId, scope, period, q);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
    return {
      period: periodView(period),
      data: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
      totals: {
        count: all.length,
        amount: sum(
          all.filter((r) => r.status === 'COMPLETED').map((r) => r.amount),
        ),
        partAmount: q.part
          ? sum(
              all.flatMap((r) =>
                (r.parts ?? [])
                  .filter((p) => p.kind === q.part)
                  .map((p) => p.amount),
              ),
            )
          : null,
      },
    };
  }

  /**
   * The drawer (spec B4 §5.3): one payment, any status, any day. Reads no list
   * filter — only the company and the branch scope limit it; outside them it
   * is 404 (a 403 would reveal the id exists). The parts period is the given
   * one when the payment is inside it, else the payment's own Tashkent month.
   */
  async row(
    companyId: number,
    scope: ReportBranchIds,
    id: string,
    q: PaymentPeriodDto,
  ): Promise<PaymentRowResponse> {
    const p = await this.prisma.payment.findFirst({
      where: { id, companyId, ...branchIdWhere(scope) },
      select: { createdAt: true },
    });
    if (!p) throw new NotFoundException("To'lov topilmadi");
    const given =
      q.startDate && q.endDate
        ? parsePaymentPeriod(q.startDate, q.endDate)
        : undefined;
    const inside =
      given && p.createdAt >= given.start && p.createdAt <= given.endTs;
    let period = given;
    if (!inside) {
      const m = tashkentMonthKey(p.createdAt);
      period = resolvePeriod(
        `${m}-01`,
        addDaysToDateStr(`${addMonthsToMonthKey(m, 1)}-01`, -1),
      );
    }
    const [row] = await this.buildRows(companyId, scope, period!, {}, { id });
    // The payment left the scope (or was removed) between the two reads.
    if (!row) throw new NotFoundException("To'lov topilmadi");
    return { period: periodView(period!), row };
  }

  /**
   * The Excel (spec B4 §5.6): the same rows as `rows`, unpaged, refused above
   * `EXCEL_ROW_LIMIT`. The header names the chosen filters, not their ids.
   */
  async excel(
    companyId: number,
    scope: ReportBranchIds,
    q: PaymentListQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const period = parsePaymentPeriod(q.startDate, q.endDate);
    const rows = await this.buildRows(companyId, scope, period, q);
    if (rows.length > EXCEL_ROW_LIMIT) {
      throw new BadRequestException(
        `Qatorlar juda ko'p (${formatSom(rows.length)}) — davrni qisqartiring`,
      );
    }
    return {
      buffer: await paymentsWorkbook(rows, {
        period: `${dmy(period.startStr)} – ${dmy(period.endStr)}`,
        filters: await this.filterText(companyId, scope, q),
      }),
      filename: `tolovlar-${period.startStr}-${period.endStr}.xlsx`,
    };
  }

  /** «Qidiruv: …; Usul: …» in the page's order; the default status is not a filter. */
  private async filterText(
    companyId: number,
    scope: ReportBranchIds,
    q: PaymentListQueryDto,
  ): Promise<string> {
    const users = async (ids: number[] | undefined) =>
      ids
        ? (
            await this.prisma.user.findMany({
              where: { id: { in: ids }, companyId },
              select: { id: true, firstName: true, lastName: true },
              orderBy: { firstName: 'asc' },
            })
          ).map(personName)
        : [];
    const [groups, teachers, courses, receivers] = await Promise.all([
      q.groupId
        ? this.prisma.group.findMany({
            where: {
              id: { in: q.groupId },
              companyId,
              ...branchIdWhere(scope),
            },
            select: { name: true },
            orderBy: { name: 'asc' },
          })
        : [],
      users(q.teacherId),
      q.courseId
        ? this.prisma.course.findMany({
            where: { id: { in: q.courseId }, companyId },
            select: { name: true },
            orderBy: { name: 'asc' },
          })
        : [],
      users(q.receivedById),
    ]);
    const received = [...receivers, ...(q.online ? ['Onlayn'] : [])];
    const parts: [string, string][] = [
      ['Qidiruv', q.search?.trim() ?? ''],
      ['Usul', (q.method ?? []).map((m) => METHOD_LABEL[m] ?? m).join(', ')],
      ['Nimaga ketdi', q.part ? PART_FILTER_LABEL[q.part] : ''],
      ['Guruh', groups.map((g) => g.name).join(', ')],
      ['Ustoz', teachers.join(', ')],
      ['Kurs', courses.map((c) => c.name).join(', ')],
      ['Kim qabul qildi', received.join(', ')],
      [
        'Manba',
        q.source
          ? q.source === 'ONLINE'
            ? 'Onlayn avtomatik'
            : 'Admin kiritgan'
          : '',
      ],
      [
        'Holat',
        q.status && q.status !== 'COMPLETED'
          ? STATUS_FILTER_LABEL[q.status]
          : '',
      ],
    ];
    const text = parts
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
    return text || "yo'q";
  }

  /**
   * The summary card (spec B4 §5.4): the engine's figures for the period plus
   * the method split. Reads no filter. An empty scope is refused, never zeros
   * (same rule as `GET /reports/income-month-attribution`).
   */
  async summary(
    companyId: number,
    scope: ReportBranchIds,
    q: PaymentPeriodDto,
  ): Promise<PaymentSummary> {
    if (isEmptyScope(scope)) {
      throw new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      );
    }
    const period = parsePaymentPeriod(q.startDate, q.endDate);
    const where: Prisma.PaymentWhereInput = {
      companyId,
      status: 'COMPLETED',
      createdAt: tashkentRangeUtc(period.startStr, period.endStr),
      ...branchIdWhere(scope),
    };
    const [{ payerIds, rows }, byMethod, online] = await Promise.all([
      loadAttributionRows(this.prisma, companyId, period, scope),
      this.prisma.payment.groupBy({
        by: ['method'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { ...where, source: 'GATEWAY_WEBHOOK' },
        _sum: { amount: true },
        _count: true,
      }),
    ]);
    const a = payerIds.length ? attributeIncome(rows, period, scope) : null;
    const currentYear = tashkentMonthKey(new Date()).slice(0, 4);
    const late = [...(a?.lateByMonth ?? [])]
      .map(([monthKey, amount]) => ({
        monthKey,
        label: `${monthWord(monthKey, currentYear)} qarzi`,
        amount,
      }))
      .sort((x, y) => (x.monthKey < y.monthKey ? 1 : -1));
    const lateTotal = late.reduce((s, m) => s + m.amount, 0);
    const currentMonth = a?.currentMonth ?? 0;
    const advance = a?.advance ?? 0;
    return {
      period: periodView(period),
      total: currentMonth + advance + lateTotal,
      paymentCount: a?.paymentCount ?? 0,
      payerCount: payerIds.length,
      parts: { currentMonth, advance, lateTotal, late },
      byMethod: byMethod
        .map((m) => ({
          method: m.method,
          amount: m._sum.amount ?? 0,
          count: m._count,
        }))
        .filter((m) => m.amount > 0)
        .sort((x, y) => y.amount - x.amount),
      online: { amount: online._sum.amount ?? 0, count: online._count },
    };
  }

  /**
   * The filter menus (spec B4 §5.5). Groups of every status except deleted —
   * a closed group's old payments are on the page — and their current
   * teachers and courses; receivers are whoever took a payment in the scope.
   */
  async filterOptions(
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<PaymentFilterOptions> {
    const [groups, receivedBy] = await Promise.all([
      this.prisma.group.findMany({
        where: { companyId, deletedAt: null, ...branchIdWhere(scope) },
        select: {
          id: true,
          name: true,
          course: { select: { id: true, name: true } },
          teachers: {
            select: {
              teacher: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.payment.groupBy({
        by: ['receivedById'],
        where: {
          companyId,
          ...branchIdWhere(scope),
          receivedById: { not: null },
        },
      }),
    ]);
    const receiverIds = receivedBy
      .map((r) => r.receivedById)
      .filter((id): id is number => id != null);
    const receivers = receiverIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: receiverIds }, companyId },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: 'asc' },
        })
      : [];
    const teachers = new Map<
      number,
      PaymentFilterOptions['teachers'][number]
    >();
    const courses = new Map<string, PaymentFilterOptions['courses'][number]>();
    for (const g of groups) {
      courses.set(g.course.id, g.course);
      for (const { teacher } of g.teachers) teachers.set(teacher.id, teacher);
    }
    return {
      groups: groups.map(({ id, name }) => ({ id, name })),
      teachers: [...teachers.values()].sort(
        (a, b) =>
          a.firstName.localeCompare(b.firstName) ||
          a.lastName.localeCompare(b.lastName),
      ),
      courses: [...courses.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      receivers,
    };
  }

  /**
   * Every matching row, unpaged, newest first. `only` reads one payment by id
   * — any status, any day — for the drawer (spec §5.3).
   */
  async buildRows(
    companyId: number,
    scope: ReportBranchIds,
    period: ResolvedPeriod,
    q: ListFilters,
    only?: { id: string },
  ): Promise<PaymentRow[]> {
    // ponytail: the engine runs once per request, uncached (spec §10); a Redis
    // cache keyed by the company's latest Transaction if it is measured slow.
    const [payments, { rows }] = await Promise.all([
      this.prisma.payment.findMany({
        where: paymentWhere(companyId, scope, period, q, only),
        select: PAYMENT_ROW_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      loadAttributionRows(this.prisma, companyId, period, scope),
    ]);
    const { byPayment } = attributeIncome(rows, period, scope);
    const groupsOn = await this.loadDayGroups(
      scope,
      payments.map((p) => p.studentId),
    );
    const shape = periodShape(period.startStr, period.endStr);
    const currentYear = tashkentMonthKey(new Date()).slice(0, 4);

    const out: PaymentRow[] = [];
    for (const p of payments) {
      const groups = groupsOn(p.studentId, p.createdAt);
      if (q.groupId && !groups.some((g) => q.groupId!.includes(g.id))) {
        continue;
      }
      if (
        q.teacherId &&
        !groups.some((g) => g.teacherIds.some((t) => q.teacherId!.includes(t)))
      ) {
        continue;
      }
      if (q.courseId && !groups.some((g) => q.courseId!.includes(g.courseId))) {
        continue;
      }
      const row = toPaymentRow(p, {
        parts: byPayment.get(p.id),
        shape,
        currentYear,
        groups: groups.map(({ id, name }) => ({ id, name })),
      });
      if (
        q.part &&
        !row.parts?.some((x) => x.kind === q.part && x.amount > 0)
      ) {
        continue;
      }
      out.push(row);
    }
    return out;
  }

  /**
   * Spec §4.5: one read of the students' enrollments in groups of the scope
   * (deleted groups included — they show on the row), one of their logs,
   * ascending as `activeOnDay` needs. Returns the groups of a payment's day,
   * sorted by name.
   */
  private async loadDayGroups(
    scope: ReportBranchIds,
    studentIds: number[],
  ): Promise<(studentId: number, paidAt: Date) => DayGroup[]> {
    const ids = [...new Set(studentIds)];
    const enrollments = ids.length
      ? await this.prisma.enrollment.findMany({
          where: {
            studentId: { in: ids },
            deletedAt: null,
            ...groupBranchWhere(scope),
          },
          select: {
            id: true,
            studentId: true,
            groupId: true,
            status: true,
            createdAt: true,
            startDate: true,
            statusChangedAt: true,
            group: {
              select: {
                id: true,
                name: true,
                deletedAt: true,
                courseId: true,
                teachers: { select: { teacherId: true } },
              },
            },
          },
        })
      : [];
    const logs = enrollments.length
      ? await this.prisma.enrollmentStateLog.findMany({
          where: { enrollmentId: { in: enrollments.map((e) => e.id) } },
          select: { enrollmentId: true, status: true, transitionAt: true },
          orderBy: { transitionAt: 'asc' },
        })
      : [];
    const logOf = new Map<string, EnrollmentStatusEvent[]>();
    for (const l of logs) {
      const list = logOf.get(l.enrollmentId) ?? [];
      list.push({ status: l.status, transitionAt: l.transitionAt });
      logOf.set(l.enrollmentId, list);
    }
    const groupOf = new Map<string, DayGroup>();
    const byStudent = new Map<number, DayEnrollment[]>();
    for (const e of enrollments) {
      groupOf.set(e.groupId, {
        id: e.group.id,
        name: e.group.name,
        courseId: e.group.courseId,
        teacherIds: e.group.teachers.map((t) => t.teacherId),
      });
      const list = byStudent.get(e.studentId) ?? [];
      list.push({
        id: e.id,
        groupId: e.groupId,
        status: e.status,
        createdAt: e.createdAt,
        startDate: e.startDate,
        statusChangedAt: e.statusChangedAt,
        groupDeletedAt: e.group.deletedAt,
        log: logOf.get(e.id) ?? [],
      });
      byStudent.set(e.studentId, list);
    }
    return (studentId, paidAt) =>
      groupIdsOnDay(byStudent.get(studentId) ?? [], paidAt)
        .map((id) => groupOf.get(id)!)
        .sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** The SQL half of `buildRows` (spec §5.1): period, scope, status, method, source, receiver, search. */
function paymentWhere(
  companyId: number,
  scope: ReportBranchIds,
  period: ResolvedPeriod,
  q: ListFilters,
  only?: { id: string },
): Prisma.PaymentWhereInput {
  const and: Prisma.PaymentWhereInput[] = [];
  const received = receivedWhere(q.receivedById, q.online);
  if (received) and.push(received);
  const search = paymentSearchWhere(q.search);
  if (search) and.push(search);
  const status =
    only || q.status === 'ALL' ? undefined : (q.status ?? 'COMPLETED');
  const method = equalsOrIn(q.method);
  return {
    companyId,
    ...branchIdWhere(scope),
    ...(only
      ? { id: only.id }
      : { createdAt: tashkentRangeUtc(period.startStr, period.endStr) }),
    ...(status ? { status } : {}),
    ...(method ? { method } : {}),
    ...(q.source
      ? {
          source:
            q.source === 'ONLINE'
              ? 'GATEWAY_WEBHOOK'
              : { not: 'GATEWAY_WEBHOOK' },
        }
      : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

/** «Kim qabul qildi»: staff ids, «Onlayn» (= GATEWAY_WEBHOOK, spec §4.3), or either. */
function receivedWhere(
  ids: number[] | undefined,
  online: boolean | undefined,
): Prisma.PaymentWhereInput | undefined {
  const byStaff = equalsOrIn(ids);
  const staff = byStaff === undefined ? undefined : { receivedById: byStaff };
  const web = online ? { source: 'GATEWAY_WEBHOOK' as const } : undefined;
  if (staff && web) return { OR: [staff, web] };
  return staff ?? web;
}
