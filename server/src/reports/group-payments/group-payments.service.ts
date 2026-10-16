import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MonthlyChargeStatus } from '@prisma/client';
import {
  branchIdWhere,
  isEmptyScope,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { splitMonthChargesByCharge } from '../month-charges';
import { groupPaymentsWorkbook } from './group-payments.excel';
import {
  buildRowsResponse,
  filteredRows,
  groupDrawer,
  parseReportMonth,
  studentSheetLines,
  toGpQuery,
  type GpData,
  type GpGroupResponse,
  type GpRawQuery,
  type GpRowsResponse,
} from './group-payments.math';

/** «Guruhlar bo'yicha to'lov» (spec B5 §5). Every figure comes from `splitMonthChargesByCharge`. */
@Injectable()
export class GroupPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /reports/group-payments` (spec B5 §5.2). */
  async rows(
    companyId: number,
    scope: ReportBranchIds,
    q: GpRawQuery,
  ): Promise<GpRowsResponse> {
    const data = await this.load(
      companyId,
      scope,
      parseReportMonth(q.oy, new Date()),
    );
    return buildRowsResponse(data, toGpQuery(q));
  }

  /** `GET /reports/group-payments/excel` (spec B5 §5.4): the table's filters without the page; sheet 2 honours `qarzdor` only. */
  async excel(
    companyId: number,
    scope: ReportBranchIds,
    q: GpRawQuery,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const month = parseReportMonth(q.oy, new Date());
    const data = await this.load(companyId, scope, month);
    const f = toGpQuery(q);
    const buffer = await groupPaymentsWorkbook({
      kesim: f.kesim,
      rows: filteredRows(data, f),
      students: studentSheetLines(data, f.qarzdor),
    });
    return { buffer, filename: `guruhlar-tolovi-${month}.xlsx` };
  }

  /** `GET /reports/group-payments/groups/:groupId` (spec B5 §5.3). */
  async group(
    companyId: number,
    scope: ReportBranchIds,
    groupId: string,
    oy?: string,
  ): Promise<GpGroupResponse> {
    const data = await this.load(
      companyId,
      scope,
      parseReportMonth(oy, new Date()),
    );
    const out = groupDrawer(data, groupId);
    if (!out) throw new NotFoundException('Bu guruh tanlangan oyda topilmadi');
    return out;
  }

  /**
   * The month's in-scope charges with their unpaid shares. Branch scoping is a
   * CHAIN, as in `loadMonthCharges`: only the holders query carries `branchId`;
   * the later charges (any branch — the balance is one), the balances and the
   * groups are read for what it returned. Deleted groups, archived students and
   * deleted courses are read on purpose (spec B5 §3.5): no `deletedAt` filter.
   * No cache: a month is ~500 charge rows.
   */
  private async load(
    companyId: number,
    scope: ReportBranchIds,
    month: string,
  ): Promise<GpData> {
    if (isEmptyScope(scope)) {
      throw new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      );
    }
    const [y, m] = month.split('-').map(Number);
    const holders = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: {
        companyId,
        periodYear: y,
        periodMonth: m,
        status: MonthlyChargeStatus.CHARGED,
        ...branchIdWhere(scope),
      },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    const studentIds = holders.map((h) => h.studentId);
    if (studentIds.length === 0)
      return { month, charges: [], groups: new Map(), students: new Map() };

    const [rows, students] = await Promise.all([
      this.prisma.enrollmentMonthlyCharge.findMany({
        where: {
          companyId,
          studentId: { in: studentIds },
          status: MonthlyChargeStatus.CHARGED,
          OR: [
            { periodYear: { gt: y } },
            { periodYear: y, periodMonth: { gte: m } },
          ],
        },
        select: {
          id: true,
          studentId: true,
          groupId: true,
          enrollmentId: true,
          periodYear: true,
          periodMonth: true,
          branchId: true,
          chargedAmount: true,
          enrollment: { select: { status: true, createdAt: true } },
        },
      }),
      this.prisma.student.findMany({
        where: { companyId, id: { in: studentIds } },
        select: {
          id: true,
          balance: true,
          firstName: true,
          lastName: true,
          phone: true,
          deletedAt: true,
        },
      }),
    ]);
    const shares = splitMonthChargesByCharge({
      month,
      branchIds: scope,
      rows,
      balances: new Map(students.map((s) => [s.id, s.balance])),
    });
    const groups = await this.prisma.group.findMany({
      where: {
        companyId,
        id: { in: [...new Set(shares.map((s) => s.groupId))] },
      },
      select: {
        id: true,
        name: true,
        groupNumber: true,
        statusEnum: true,
        deletedAt: true,
        course: { select: { id: true, name: true } },
        teachers: {
          select: {
            teacher: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    const rowById = new Map(rows.map((r) => [r.id, r]));
    return {
      month,
      charges: shares.map((s) => {
        const enrollment = rowById.get(s.id)!.enrollment;
        return {
          ...s,
          enrollmentStatus: enrollment.status,
          enrollmentCreatedAt: enrollment.createdAt,
        };
      }),
      groups: new Map(
        groups.map((g) => {
          const deleted = g.deletedAt !== null;
          return [
            g.id,
            {
              id: g.id,
              name: g.name,
              groupNumber: g.groupNumber,
              courseId: g.course.id,
              courseName: g.course.name,
              teachers: g.teachers
                .map((t) => ({
                  id: t.teacher.id,
                  name: `${t.teacher.firstName} ${t.teacher.lastName}`.trim(),
                }))
                .sort((a, b) => a.name.localeCompare(b.name, 'uz')),
              deleted,
              // A deleted group shows only «o'chirilgan», never also «yopilgan».
              closed:
                !deleted &&
                (g.statusEnum === 'COMPLETED' || g.statusEnum === 'CANCELLED'),
            },
          ];
        }),
      ),
      students: new Map(
        students.map((s) => [
          s.id,
          {
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            phone: s.phone,
            archived: s.deletedAt !== null,
          },
        ]),
      ),
    };
  }
}
