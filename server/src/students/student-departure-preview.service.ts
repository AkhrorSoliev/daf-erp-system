import { Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, PaymentModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MonthlyChargeService,
  type DepartureOutcomesPreview,
} from '../billing/monthly-charge.service';
import {
  DEFAULT_DEPARTURE_POLICY,
  type DeparturePolicy,
} from '../billing/departure-policy';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { mayChooseDeparturePolicy } from './shared/departure-policy-access';

export interface DeparturePreviewEnrollment {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  status: EnrollmentStatus;
  /** Null: a lesson-pack course, or no standing charge for this month. */
  month: DepartureOutcomesPreview | null;
}

export interface DeparturePreview {
  /** Tashkent 'YYYY-MM-DD' the figures were computed for: today. */
  departureDay: string;
  /** The student's balance now; negative is a debt. */
  balance: number;
  /** Whether this caller may choose a policy other than the default. */
  mayChoosePolicy: boolean;
  defaultPolicy: DeparturePolicy;
  enrollments: DeparturePreviewEnrollment[];
}

/**
 * What removing, expelling or archiving a student now would do to their
 * month's charge under each policy (contract 6.2, ADR-0043). The dialogs
 * show it before anything is confirmed; the figures come from the same
 * `policyRelease` rule the write runs, so the dialog cannot quote a sum the
 * write does not credit. Writes nothing.
 */
@Injectable()
export class StudentDeparturePreviewService {
  constructor(
    private prisma: PrismaService,
    private monthlyChargeService: MonthlyChargeService,
  ) {}

  /**
   * Every open (ACTIVE or FROZEN) enrollment of the student — what an
   * expulsion or an archive closes — or, with `enrollmentId`, that one of
   * theirs, which is what a removal closes.
   */
  async preview(
    studentId: number,
    companyId: number,
    userId: number,
    enrollmentId?: string,
  ): Promise<DeparturePreview> {
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) throw new NotFoundException(`O'quvchi topilmadi`);

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        deletedAt: null,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.FROZEN] },
        ...(enrollmentId ? { id: enrollmentId } : {}),
      },
      select: {
        id: true,
        status: true,
        groupId: true,
        group: {
          select: { name: true, course: { select: { paymentModel: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (enrollmentId && enrollments.length === 0) {
      throw new NotFoundException('Faol yozuv topilmadi');
    }

    // The instant a removal or an expulsion confirmed now would use.
    const now = new Date();
    const rows: DeparturePreviewEnrollment[] = [];
    for (const e of enrollments) {
      const month =
        e.group.course.paymentModel === PaymentModel.MONTHLY
          ? await this.monthlyChargeService.previewDepartureOutcomes(
              this.prisma,
              { enrollmentId: e.id, departureDate: now, companyId },
            )
          : null;
      rows.push({
        enrollmentId: e.id,
        groupId: e.groupId,
        groupName: e.group.name,
        status: e.status,
        month,
      });
    }

    return {
      departureDay: tashkentDateStr(now),
      balance: student.balance,
      mayChoosePolicy: await mayChooseDeparturePolicy(this.prisma, userId),
      defaultPolicy: DEFAULT_DEPARTURE_POLICY,
      enrollments: rows,
    };
  }
}
