import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryType } from '@prisma/client';

@Injectable()
export class SalarySummaryService {
  constructor(private prisma: PrismaService) {}

  async getTeacherSalarySummary(teacherId: number, companyId: number) {
    // Use the parent (mirror) values for "expected" since that's what's
    // currently in effect. For history-aware breakdowns, callers should
    // hit the per-payment breakdown endpoint instead.
    const configs = await this.prisma.employeeSalaryConfig.findMany({
      where: { userId: teacherId, isActive: true, companyId },
      select: {
        salaryType: true,
        value: true,
        groupId: true,
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { price: true, lessonPaymentCount: true } },
            _count: {
              select: {
                enrollments: {
                  where: { status: 'ACTIVE', deletedAt: null },
                },
              },
            },
          },
        },
      },
    });

    const teacherGroups = await this.prisma.groupTeacher.findMany({
      where: { teacherId },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            exactDays: true,
            statusEnum: true,
            course: { select: { price: true, lessonPaymentCount: true } },
            _count: {
              select: {
                enrollments: {
                  where: { status: 'ACTIVE', deletedAt: null },
                },
              },
            },
          },
        },
      },
    });

    const defaultConfig = configs.find((c) => !c.groupId);

    const groupsBreakdown = teacherGroups
      .filter((tg) => tg.group.statusEnum === 'ACTIVE')
      .map((tg) => {
        const groupConfig =
          configs.find((c) => c.groupId === tg.group.id) ?? defaultConfig;
        const activeStudents = tg.group._count.enrollments;
        const lessonPaymentCount = tg.group.course.lessonPaymentCount || 12;
        const perLessonCost = Math.round(
          tg.group.course.price / lessonPaymentCount,
        );
        const lessonsPerMonth = tg.group.exactDays.length * 4;

        let expectedPerStudentPerLesson = 0;
        if (
          groupConfig &&
          groupConfig.salaryType !== SalaryType.FIXED_MONTHLY
        ) {
          if (groupConfig.salaryType === SalaryType.PERCENTAGE) {
            expectedPerStudentPerLesson = Math.round(
              (perLessonCost * groupConfig.value) / 100,
            );
          } else {
            // FIXED_PER_STUDENT: `value` is per-student-per-cycle. Divide
            // by lessonPaymentCount to get per-lesson. This previously
            // returned the full value per lesson, inflating expectations.
            expectedPerStudentPerLesson = Math.round(
              groupConfig.value / lessonPaymentCount,
            );
          }
        }

        const expectedMonthly =
          expectedPerStudentPerLesson * activeStudents * lessonsPerMonth;

        return {
          groupId: tg.group.id,
          groupName: tg.group.name,
          activeStudents,
          lessonsPerMonth,
          salaryType: groupConfig?.salaryType ?? null,
          salaryValue: groupConfig?.value ?? 0,
          expectedPerLesson: expectedPerStudentPerLesson * activeStudents,
          expectedMonthly,
        };
      });

    // Filter out reversed accruals from "actually earned" — those rows
    // exist for audit but are not paid out by the salary cron.
    const unpaidAccruals = await this.prisma.salaryAccrual.aggregate({
      where: {
        userId: teacherId,
        companyId,
        salaryPaymentId: null,
        reversedAt: null,
      },
      _sum: { amount: true },
      _count: true,
    });

    const paidTotal = await this.prisma.salaryPayment.aggregate({
      where: { userId: teacherId, companyId, status: 'PAID' },
      _sum: { amount: true },
    });

    const fixedMonthlyConfig = configs.find(
      (c) => c.salaryType === SalaryType.FIXED_MONTHLY,
    );
    const expectedMonthlyTotal = fixedMonthlyConfig
      ? fixedMonthlyConfig.value
      : groupsBreakdown.reduce((sum, g) => sum + g.expectedMonthly, 0);

    return {
      expectedMonthly: expectedMonthlyTotal,
      actualEarned: unpaidAccruals._sum.amount ?? 0,
      accrualCount: unpaidAccruals._count,
      paidTotal: paidTotal._sum.amount ?? 0,
      groups: groupsBreakdown,
      hasConfig: configs.length > 0,
      isFixedMonthly: !!fixedMonthlyConfig,
    };
  }
}
