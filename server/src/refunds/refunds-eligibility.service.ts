import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentBillingService } from '../billing/enrollment-billing.service';
import {
  ReportBranchIds,
  studentBranchWhere,
} from '../common/finance/report-branch-scope';
import {
  AttendanceStatus,
  EnrollmentStatus,
  PaymentStatus,
  RefundStatus,
} from '@prisma/client';

@Injectable()
export class RefundsEligibilityService {
  constructor(
    private prisma: PrismaService,
    private enrollmentBilling: EnrollmentBillingService,
  ) {}

  /**
   * Compute the refund breakdown for a student without creating anything.
   * Powers the "Pulni qaytarish" dialog — refund is scoped to the student's
   * active Enrollment (not Contract). Contract is no longer required because
   * most students never have one in this system; the ledger has all the
   * information needed to compute a refund.
   *
   * If `enrollmentId` is provided, that enrollment is used. Otherwise the
   * student must have exactly one ACTIVE enrollment, which is auto-selected.
   * Multiple ACTIVE enrollments without an explicit `enrollmentId` returns
   * 400 — the caller must pick which group the refund applies to.
   */
  async previewRefund(
    studentId: number,
    companyId: number,
    enrollmentId?: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) {
      throw new NotFoundException("O'quvchi topilmadi");
    }

    const enrollment = await this.resolveEnrollment(
      studentId,
      companyId,
      enrollmentId,
    );

    let lessonsCompleted = 0;
    if (enrollment.groupId) {
      lessonsCompleted = await this.prisma.attendance.count({
        where: {
          groupId: enrollment.groupId,
          studentId,
          status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
        },
      });
    }

    const totalLessons = enrollment.group.course.lessonPaymentCount;
    const coursePrice = enrollment.group.course.price;
    const perLessonCost =
      totalLessons > 0 ? Math.round(coursePrice / totalLessons) : 0;

    // Money that has come in for this student. Without per-enrollment payment
    // tagging, all completed non-reversed payments are summed at the student
    // level — fine while a student has at most one active enrollment.
    const paymentsAgg = await this.prisma.payment.aggregate({
      where: {
        studentId,
        companyId,
        status: PaymentStatus.COMPLETED,
      },
      _sum: { amount: true },
    });
    const paidAmount = paymentsAgg._sum.amount ?? 0;

    // The operator refunds out of the money that most recently came in, so the
    // dialog shows which payment that was. Same filter as `paidAmount` above —
    // reading a different set would let the two lines contradict each other.
    const lastPaymentRow = await this.prisma.payment.findFirst({
      where: {
        studentId,
        companyId,
        status: PaymentStatus.COMPLETED,
      },
      orderBy: { createdAt: 'desc' },
      select: { amount: true, method: true, createdAt: true },
    });
    const lastPayment = lastPaymentRow
      ? {
          amount: lastPaymentRow.amount,
          method: lastPaymentRow.method,
          paidAt: lastPaymentRow.createdAt,
        }
      : null;

    const priorRefunds = await this.prisma.refund.aggregate({
      where: {
        enrollmentId: enrollment.id,
        status: {
          in: [
            RefundStatus.APPROVED,
            RefundStatus.PROCESSING,
            RefundStatus.COMPLETED,
          ],
        },
      },
      _sum: { approvedAmount: true },
    });
    const previousRefundsTotal = priorRefunds._sum.approvedAmount ?? 0;

    // What a refund may draw on, from the two things that actually hold money:
    // the free balance, and the lessons already paid for but not yet taken.
    //
    // It used to be derived as `lesson deductions − PRESENT/LATE attendance`.
    // That difference is never "money over-deducted": the ledger deducts
    // exactly `attendance + prepaidLessonsRemaining`, so the gap is precisely
    // the ABSENT lessons — which ARE billable here — plus lessons already
    // reserved for future dates. Handing it back credited students money
    // nobody had paid, and because `prepaidLessonsRemaining` went untouched the
    // same lessons stayed covered, so one payment was counted twice. #10393 was
    // credited 266 664 so'm that way on 2026-08-18, #10655 233 331 before that.
    const prepaidLessons = enrollment.prepaidLessonsRemaining;
    const prepaidValue = await this.enrollmentBilling.prepaidRefundValue(
      this.prisma,
      enrollment.id,
      enrollment.group.course,
      prepaidLessons,
    );

    const maxRefundable = Math.max(0, student.balance + prepaidValue);
    const suggestedAmount = maxRefundable;

    // The old warning claimed a percentage of the course was done, dividing by
    // `lessonPaymentCount` — the size of a BILLING CYCLE, not the course. A
    // student 19 lessons into a 12-lesson cycle read as "158% attended", so the
    // warning fired for nearly everyone and told nobody anything. There is no
    // total-lessons figure anywhere in the schema to divide by, so the honest
    // move is to say something true instead.
    const warning =
      prepaidLessons === 0 && student.balance > 0
        ? "Oldindan to'langan darsi yo'q — faqat balansdagi puldan qaytariladi"
        : null;

    return {
      enrollmentId: enrollment.id,
      groupId: enrollment.groupId,
      groupName: enrollment.group.name,
      courseName: enrollment.group.course.name,
      paidAmount,
      lastPayment,
      studentBalance: student.balance,
      lessonsAttended: lessonsCompleted,
      prepaidLessons,
      prepaidValue,
      perLessonCost,
      previousRefunds: previousRefundsTotal,
      maxRefundable,
      suggestedAmount,
      warning,
    };
  }

  /**
   * Pick the enrollment a refund applies to. Explicit `enrollmentId` wins.
   * Otherwise we require exactly one ACTIVE enrollment — multiple ACTIVE
   * enrollments are ambiguous and the caller must disambiguate.
   */
  private async resolveEnrollment(
    studentId: number,
    companyId: number,
    enrollmentId?: string,
  ) {
    if (enrollmentId) {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          id: enrollmentId,
          studentId,
          deletedAt: null,
          group: { companyId },
        },
        select: {
          id: true,
          groupId: true,
          status: true,
          prepaidLessonsRemaining: true,
          group: {
            select: {
              name: true,
              course: {
                select: {
                  name: true,
                  price: true,
                  lessonPaymentCount: true,
                },
              },
            },
          },
        },
      });
      if (!enrollment) {
        throw new NotFoundException("Bu o'quvchining bunday guruhi topilmadi");
      }
      // Same gate `quickRefund`'s loadEnrollment applies. Quoting a refund for
      // a group the payout would reject sends the operator to a 400 on the
      // button they have just filled in.
      if (enrollment.status !== EnrollmentStatus.ACTIVE) {
        throw new BadRequestException(
          'Faqat faol guruhdan pul qaytarish mumkin',
        );
      }
      return enrollment;
    }

    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        group: { companyId },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        groupId: true,
        status: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            name: true,
            course: {
              select: {
                name: true,
                price: true,
                lessonPaymentCount: true,
              },
            },
          },
        },
      },
    });

    if (activeEnrollments.length === 0) {
      throw new NotFoundException(
        "O'quvchining faol guruhi yo'q — pul qaytarish uchun guruh kerak",
      );
    }
    if (activeEnrollments.length > 1) {
      throw new BadRequestException(
        "O'quvchi bir nechta faol guruhda — qaysi guruhdan qaytarayotganingizni tanlang",
      );
    }
    return activeEnrollments[0];
  }

  /**
   * The refund list, confined to the caller's branches.
   *
   * It was `where: { companyId }` alone — every refund in the company, with the
   * student's name, the amount and the group. A Namangan director opening
   * /payments read Fargona's refunds in full.
   *
   * `Refund` carries no `branchId` of its own, so the scope goes through the
   * STUDENT's branch — the same `StudentBranch` join every student list filters
   * on, so this page slices the same way the rest of the app does. Scoping via
   * the enrollment's group would disagree for a student who transferred
   * branches after the refund was raised.
   */
  async findAll(companyId: number, branchIds: ReportBranchIds) {
    return this.prisma.refund.findMany({
      where: { companyId, student: studentBranchWhere(branchIds) },
      select: {
        id: true,
        requestedAmount: true,
        approvedAmount: true,
        lessonsCompleted: true,
        totalLessons: true,
        status: true,
        reason: true,
        createdAt: true,
        student: { select: { id: true, firstName: true, lastName: true } },
        enrollment: {
          select: {
            id: true,
            group: { select: { id: true, name: true } },
          },
        },
        contract: { select: { id: true, contractNumber: true } },
        processedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
