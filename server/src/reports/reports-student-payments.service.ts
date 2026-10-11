import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  branchIdWhere,
  userBranchWhere,
} from '../common/finance/report-branch-scope';

@Injectable()
export class ReportsStudentPaymentsService {
  constructor(private prisma: PrismaService) {}

  async getStudentPaymentsFilterOptions(
    companyId: number,
    scope: ReportBranchIds,
  ) {
    // The filter bar's own options were company-wide while the report they
    // filter is branch-scoped: a Branch Director could pick the other branch's
    // teacher or course from the dropdown (leaking the staff roster by name)
    // and then get an empty report back, with no explanation.
    const [groups, teachers, courses] = await Promise.all([
      this.prisma.group.findMany({
        where: { companyId, deletedAt: null, ...branchIdWhere(scope) },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, branchId: true },
      }),
      this.prisma.user.findMany({
        where: {
          companyId,
          deletedAt: null,
          roles: { some: { role: { name: 'Teacher' } } },
          AND: [userBranchWhere(scope)],
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.course.findMany({
        where: { companyId, deletedAt: null, ...branchIdWhere(scope) },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    return {
      groups,
      teachers: teachers.map((t) => ({
        id: t.id,
        fullName: `${t.firstName} ${t.lastName}`,
      })),
      courses,
    };
  }
}
