import { Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, PaymentModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyChargeService } from '../billing/monthly-charge.service';
import { assertCallerInBranch } from '../common/auth/branch-scope';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';

export interface EnrollPreview {
  paymentModel: PaymentModel;
  /** `Course.price`: the monthly price for MONTHLY, the pack price otherwise. */
  coursePrice: number;
  /** Lessons in one pack; null for a monthly course. */
  lessonPaymentCount: number | null;
  /** `Student.discountPercent` (0–100). */
  discountPercent: number;
  /**
   * MONTHLY only: the first charge this enrollment would get. Null when none
   * would be written (group not ACTIVE, no lessons left in that month).
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
   * max(0, due − balance); due = firstMonth.amount (MONTHLY, 0 when null) or
   * coursePrice (pack — today's dialog rule).
   */
  payable: number;
}

/**
 * What adding a student to a group now would charge (A3.4). The enroll dialog
 * shows it before anything is confirmed. A monthly course's first month comes
 * from `previewChargeForNewEnrollment`, which runs the computation the charge
 * itself runs, so the dialog cannot quote a sum the write does not charge. A
 * transfer's release of the old group's month is not in it. Writes nothing.
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
    let firstMonth: EnrollPreview['firstMonth'] = null;
    if (monthly) {
      // A start in a later month is charged by that month's run; any other,
      // by the enroll call itself, in the current month (`chargeMidMonthJoin`).
      const now = new Date();
      const today = tashkentDateStr(now);
      const start = startDate ?? today;
      const month = (start > today ? start : today).slice(0, 7);
      const planned =
        await this.monthlyChargeService.previewChargeForNewEnrollment(
          this.prisma,
          {
            // The enrollment `enrollToGroup` would create: its start day read
            // the way it reads it, created now, never frozen.
            enrollment: {
              id: '',
              studentId,
              groupId: group.id,
              status: EnrollmentStatus.ACTIVE,
              startDate: startDate ? utcMidnightFromDateStr(startDate) : null,
              createdAt: now,
              returnedAt: null,
              group,
            },
            periodYear: Number(month.slice(0, 4)),
            periodMonth: Number(month.slice(5, 7)),
            discountPercent: student.discountPercent,
          },
        );
      firstMonth = planned ? { period: month, ...planned } : null;
    }

    const due = monthly ? (firstMonth?.amount ?? 0) : group.course.price;
    return {
      paymentModel: group.course.paymentModel,
      coursePrice: group.course.price,
      lessonPaymentCount: monthly ? null : group.course.lessonPaymentCount,
      discountPercent: student.discountPercent,
      firstMonth,
      balance: student.balance,
      payable: Math.max(0, due - student.balance),
    };
  }
}
