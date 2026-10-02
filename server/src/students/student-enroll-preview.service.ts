import { Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, GroupStatus, PaymentModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MonthlyChargeService,
  type ChargeableEnrollment,
} from '../billing/monthly-charge.service';
import { chargeStartDate } from '../billing/charge-start-date';
import { applyDiscount, clampDiscount } from '../billing/monthly-price';
import { assertCallerInBranch } from '../common/auth/branch-scope';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import {
  addMonthsToMonthKey,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';

export interface EnrollPreview {
  paymentModel: PaymentModel;
  /**
   * `Course.price` before any discount: the monthly price for MONTHLY, the
   * pack price otherwise.
   */
  coursePrice: number;
  /** Lessons in one pack; null for a monthly course. */
  lessonPaymentCount: number | null;
  /** `Student.discountPercent` (0–100). */
  discountPercent: number;
  /**
   * MONTHLY only: the first charge the student will actually get — the month
   * of the charge's first day (this month at the earliest), or the next one
   * when that month leaves nothing to charge. Null when the group is not
   * ACTIVE, or neither month has anything to charge.
   */
  firstMonth: {
    /** 'YYYY-MM'. */
    period: string;
    plannedLessons: number;
    coveredLessons: number;
    amount: number;
  } | null;
  /** The student's balance now; negative is a debt. */
  balance: number;
  /**
   * A transfer (the student is active in another group): what the old
   * group's month gives back before the new group is charged. 0 otherwise.
   */
  transferRelease: number;
  /**
   * max(0, due − (balance + transferRelease)); due = firstMonth.amount
   * (MONTHLY, 0 when null) or the pack price at the student's discount — what
   * pack billing deducts for a full cycle.
   */
  payable: number;
}

/**
 * What adding a student to a group now would charge (A3.4). The enroll dialog
 * shows it before anything is confirmed. A monthly course's first month comes
 * from `previewChargeForNewEnrollment`, which runs the computation the charge
 * itself runs, and a transfer's release from `previewReleaseForDeparture`,
 * the twin of the transfer's own call, so the dialog cannot quote a sum the
 * write does not charge or credit. Writes nothing.
 */
@Injectable()
export class StudentEnrollPreviewService {
  constructor(
    private prisma: PrismaService,
    private monthlyChargeService: MonthlyChargeService,
  ) {}

  async preview(
    studentId: number,
    companyId: number,
    userId: number,
    groupId: string,
    startDate?: string,
  ): Promise<EnrollPreview> {
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { balance: true, discountPercent: true },
    });
    if (!student) throw new NotFoundException(`O'quvchi topilmadi`);

    const group = await this.prisma.group.findFirst({
      where: { id: groupId, companyId, deletedAt: null },
      select: {
        id: true,
        branchId: true,
        companyId: true,
        statusEnum: true,
        startDate: true,
        exactDays: true,
        course: {
          select: { price: true, paymentModel: true, lessonPaymentCount: true },
        },
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    await assertCallerInBranch(this.prisma, userId, group.branchId);

    const monthly = group.course.paymentModel === PaymentModel.MONTHLY;
    // The instant an enroll call confirmed now would use.
    const now = new Date();
    let firstMonth: EnrollPreview['firstMonth'] = null;
    // This gate MUST mirror the refusals of `previewChargeForNewEnrollment`
    // (not MONTHLY, group not ACTIVE): past it, that method's null can only
    // mean the month leaves nothing to charge, and only that may roll forward
    // below. A refusal added there must be added here too.
    if (monthly && group.statusEnum === GroupStatus.ACTIVE) {
      // The enrollment `enrollToGroup` would create: its start day read the
      // way it reads it, created now, never frozen.
      const enrollment: ChargeableEnrollment = {
        id: '',
        studentId,
        groupId: group.id,
        status: EnrollmentStatus.ACTIVE,
        startDate: startDate ? utcMidnightFromDateStr(startDate) : null,
        createdAt: now,
        returnedAt: null,
        group,
      };
      // The charge's first day, the group's own start applied. One in a later
      // month is charged by that month's run; any other, by the enroll call
      // itself, in the current month (`chargeMidMonthJoin`).
      const today = tashkentDateStr(now);
      const firstDay = chargeStartDate(enrollment);
      const month = (firstDay > today ? firstDay : today).slice(0, 7);
      // Nothing left to charge in that month (no lesson from the first day
      // on, or every one already paid by an earlier charge in the group): the
      // next month's run charges the student. One month on, never further.
      firstMonth =
        (await this.quoteMonth(enrollment, month, student.discountPercent)) ??
        (await this.quoteMonth(
          enrollment,
          addMonthsToMonthKey(month, 1),
          student.discountPercent,
        ));
    }

    // A pack is due as a full cycle at the student's discount, the amount pack
    // billing deducts (`LessonBillingService`, FULL_CYCLE). A monthly first
    // month already carries the discount.
    const due = monthly
      ? (firstMonth?.amount ?? 0)
      : applyDiscount(
          group.course.price,
          clampDiscount(student.discountPercent),
        );
    const transferRelease = await this.transferRelease(
      studentId,
      group.id,
      now,
    );
    return {
      paymentModel: group.course.paymentModel,
      coursePrice: group.course.price,
      lessonPaymentCount: monthly ? null : group.course.lessonPaymentCount,
      discountPercent: student.discountPercent,
      firstMonth,
      balance: student.balance,
      transferRelease,
      payable: Math.max(0, due - (student.balance + transferRelease)),
    };
  }

  /**
   * What `enrollToGroup`'s transfer gives back from the old group's month
   * before it charges the new one. It closes the student's live ACTIVE
   * enrollment (one per student, by a unique index) and calls
   * `reverseChargeForDeparture` with no policy: CENTER_INITIATIVE, and never
   * contract 3.5, which is for a student leaving. `previewReleaseForDeparture`
   * is that call's read-only twin; `previewDepartureOutcomes` is not, as it
   * weighs the trial lesson under every policy and would quote a first-timer's
   * whole month. 0 when not a transfer, or when the old month has no standing
   * charge or nothing left to give back. A pack enrollment's prepaid refund
   * is left out (no pack courses remain), which is why the dialog's figure
   * says «taxminan».
   */
  private async transferRelease(
    studentId: number,
    groupId: string,
    now: Date,
  ): Promise<number> {
    const current = await this.prisma.enrollment.findFirst({
      where: { studentId, deletedAt: null, status: EnrollmentStatus.ACTIVE },
      select: { id: true, groupId: true },
    });
    // The enroll call refuses a student already active in this group.
    if (!current || current.groupId === groupId) return 0;
    const release = await this.monthlyChargeService.previewReleaseForDeparture(
      this.prisma,
      { enrollmentId: current.id, departureDate: now },
    );
    return release?.amount ?? 0;
  }

  /** One month's charge for the enrollment, with the month it is for. */
  private async quoteMonth(
    enrollment: ChargeableEnrollment,
    month: string,
    discountPercent: number,
  ): Promise<EnrollPreview['firstMonth']> {
    const planned =
      await this.monthlyChargeService.previewChargeForNewEnrollment(
        this.prisma,
        {
          enrollment,
          periodYear: Number(month.slice(0, 4)),
          periodMonth: Number(month.slice(5, 7)),
          discountPercent,
        },
      );
    return planned ? { period: month, ...planned } : null;
  }
}
