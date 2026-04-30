import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceStatus,
  EnrollmentStatus,
  PaymentStatus,
  RefundStatus,
} from '@prisma/client';

@Injectable()
export class RefundsEligibilityService {
  constructor(private prisma: PrismaService) {}

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
    const attendanceConsumed = lessonsCompleted * perLessonCost;

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

    // Lesson-deduction ledger scoped to this enrollment. Both reversal entries
    // (`reversedTransactionId: null`) AND reversed originals (`reversedAt: null`)
    // are excluded so the consumed total isn't double-counted.
    const ledgerAgg = await this.prisma.transaction.aggregate({
      where: {
        enrollmentId: enrollment.id,
        type: 'LESSON_DEDUCTION',
        reversedTransactionId: null,
        reversedAt: null,
      },
      _sum: { amount: true },
    });
    const ledgerConsumed = Math.abs(ledgerAgg._sum.amount ?? 0);

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

    // Cycle-deduction at enrollment can leave the ledger showing more
    // "consumed" than the student actually attended. The unused portion
    // is still money we owe back — add it to the max alongside the
    // current balance to compute what a full close-out looks like.
    const overDeducted = Math.max(0, ledgerConsumed - attendanceConsumed);
    const maxRefundable = Math.max(0, student.balance + overDeducted);
    const suggestedAmount = maxRefundable;

    const halfCourseAttended =
      totalLessons > 0 && lessonsCompleted / totalLessons >= 0.5;
    const warning = halfCourseAttended
      ? "Diqqat: kursning 50% dan ortig'i o'tilgan"
      : null;

    return {
      enrollmentId: enrollment.id,
      groupId: enrollment.groupId,
      groupName: enrollment.group.name,
      courseName: enrollment.group.course.name,
      paidAmount,
      studentBalance: student.balance,
      lessonsCompleted,
      totalLessons,
      perLessonCost,
      attendanceConsumed,
      ledgerConsumed,
      overDeducted,
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

  async findAll(companyId: number) {
    return this.prisma.refund.findMany({
      where: { companyId },
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
