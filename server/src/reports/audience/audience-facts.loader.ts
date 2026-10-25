import { Injectable } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
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
import { departuresInRange } from '../../students/shared/departure-episodes';
import { ageOn } from '../../students/shared/student-onboarding';
import { loadDepartures } from '../shared/departures.loader';
import type { AudienceStudent, DepartureAges } from './audience.types';

const DAY_MS = 24 * 60 * 60 * 1000;

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
              select: {
                level: true,
                course: { select: { id: true, name: true } },
              },
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
        level: s.enrollments[0]?.group.level?.trim() || null,
      };
    });
  }

  /** Everyone the system holds in scope: not deleted, archived or prospect, studying or not. */
  countAll(companyId: number, scope: ReportBranchIds): Promise<number> {
    return this.prisma.student.count({
      where: {
        companyId,
        deletedAt: null,
        status: { notIn: [StudentStatus.PROSPECT, StudentStatus.ARCHIVED] },
        ...studentBranchWhere(scope),
      },
    });
  }

  /**
   * Confirmed departures of the last 12 months (ADR-0035, the one definition),
   * each with the age he had on the day he left.
   */
  async loadDeparted(
    companyId: number,
    scope: ReportBranchIds,
    now: Date,
  ): Promise<DepartureAges> {
    const { episodes, floor } = await loadDepartures(
      this.prisma,
      companyId,
      scope,
      { now },
    );
    const left = departuresInRange(
      episodes,
      { gte: new Date(now.getTime() - 365 * DAY_MS), lt: now },
      floor,
    );
    if (left.length === 0) return { ages: [], ageUnknown: 0 };
    const rows = await this.prisma.student.findMany({
      where: { id: { in: left.map((e) => e.studentId) } },
      select: { id: true, dateOfBirth: true },
    });
    const born = new Map(rows.map((r) => [r.id, r.dateOfBirth]));
    const ages: number[] = [];
    for (const e of left) {
      const dob = born.get(e.studentId);
      if (dob) {
        ages.push(ageOn(tashkentDateStr(dob), tashkentDateStr(e.startedAt)));
      }
    }
    return { ages, ageUnknown: left.length - ages.length };
  }
}
