import { Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  EnrollmentStatus,
  GroupStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface StreakRow {
  enrollmentId: string;
  studentId: number;
  groupId: string;
  consecutiveAbsentCount: number;
  lastAbsenceDate: Date;
  // Most recent PRESENT or LATE attendance date. null = no record of ever
  // attending this group's lessons. Used in the UI to show "Oxirgi marta
  // dars kelgan sanasi" so the admin can judge how long the student has
  // been MIA.
  lastPresentDate: Date | null;
}

@Injectable()
export class AbsenceStreakService {
  constructor(private prisma: PrismaService) {}

  /**
   * Compute consecutive ABSENT streaks per ACTIVE enrollment and return only
   * those at or above `threshold`. EXCUSED, PRESENT, and LATE all break a
   * streak — only sababsiz absences count.
   *
   * Reads up to the last 10 attendances per enrollment. That covers any
   * realistic streak (3-strike is the trigger; longer streaks just keep
   * incrementing) without paging the full attendance history.
   */
  async computeStreaks(params: {
    companyId: number;
    branchIds?: number[];
    threshold?: number;
  }): Promise<StreakRow[]> {
    const threshold = params.threshold ?? 3;

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: { deletedAt: null },
        group: {
          deletedAt: null,
          statusEnum: GroupStatus.ACTIVE,
          companyId: params.companyId,
          ...(params.branchIds && params.branchIds.length > 0
            ? { branchId: { in: params.branchIds } }
            : {}),
        },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
      },
    });

    if (enrollments.length === 0) return [];

    const results = await Promise.all(
      enrollments.map(async (e) => {
        const lastTen = await this.prisma.attendance.findMany({
          where: {
            studentId: e.studentId,
            groupId: e.groupId,
            companyId: params.companyId,
          },
          orderBy: { date: 'desc' },
          take: 10,
          select: { date: true, status: true },
        });

        const streak = consecutiveAbsentCount(lastTen);
        if (streak < threshold) return null;

        // lastPresentDate: walk the same 10 rows first; fall back to a
        // single targeted query if none of the last 10 are PRESENT/LATE.
        // The fallback runs only for the small subset of enrollments that
        // qualify for the removal queue, so total queries stay bounded.
        const inLastTen = lastTen.find(
          (a) =>
            a.status === AttendanceStatus.PRESENT ||
            a.status === AttendanceStatus.LATE,
        );
        let lastPresentDate: Date | null = inLastTen?.date ?? null;
        if (!lastPresentDate) {
          const earlier = await this.prisma.attendance.findFirst({
            where: {
              studentId: e.studentId,
              groupId: e.groupId,
              companyId: params.companyId,
              status: {
                in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE],
              },
            },
            orderBy: { date: 'desc' },
            select: { date: true },
          });
          lastPresentDate = earlier?.date ?? null;
        }

        return {
          enrollmentId: e.id,
          studentId: e.studentId,
          groupId: e.groupId,
          consecutiveAbsentCount: streak,
          lastAbsenceDate: lastTen[0].date,
          lastPresentDate,
        };
      }),
    );

    return results.filter((r): r is StreakRow => r !== null);
  }
}

/**
 * Walk attendances from newest to oldest. Count consecutive ABSENT entries
 * starting from the latest. Any non-ABSENT (PRESENT, LATE, EXCUSED) breaks
 * the streak. Exported for unit tests.
 */
export function consecutiveAbsentCount(
  attendancesDesc: { status: AttendanceStatus }[],
): number {
  let count = 0;
  for (const a of attendancesDesc) {
    if (a.status === AttendanceStatus.ABSENT) {
      count++;
    } else {
      break;
    }
  }
  return count;
}
