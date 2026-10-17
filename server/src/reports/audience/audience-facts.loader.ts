import { Injectable } from '@nestjs/common';
import { tashkentDateStr } from '../../common/date/tashkent';
import {
  studentBranchWhere,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACTIVE_ENROLLMENT_WHERE,
  activeStudentWhere,
} from '../../students/shared/active-student-where';
import type { AudienceStudent } from './audience.types';

/**
 * Everyone «Auditoriya» counts: the studying students (ADR-0015, one
 * definition), in the header's branch scope. A student has one branch (D5) and
 * one live ACTIVE enrollment; the branch shown is the one inside the scope.
 * An empty scope never reaches this class: the service refuses it first.
 */
@Injectable()
export class AudienceFactsLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<AudienceStudent[]> {
    const rows = await this.prisma.student.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...activeStudentWhere(),
        ...studentBranchWhere(scope),
      },
      select: {
        gender: true,
        dateOfBirth: true,
        branches: { select: { branch: { select: { id: true, name: true } } } },
        enrollments: {
          where: ACTIVE_ENROLLMENT_WHERE,
          take: 1,
          select: {
            group: {
              select: { course: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    return rows.map((s) => {
      const branches = s.branches.map((b) => b.branch);
      const branch =
        branches.find((b) => scope === null || scope.includes(b.id)) ??
        branches[0] ??
        null;
      const course = s.enrollments[0]?.group.course ?? null;
      return {
        gender: s.gender,
        // The stored instant is local or UTC midnight; the Tashkent day is the intended one.
        birthDate: s.dateOfBirth ? tashkentDateStr(s.dateOfBirth) : null,
        branchId: branch?.id ?? null,
        branchName: branch?.name ?? null,
        courseId: course ? String(course.id) : null,
        courseName: course?.name ?? null,
      };
    });
  }
}
