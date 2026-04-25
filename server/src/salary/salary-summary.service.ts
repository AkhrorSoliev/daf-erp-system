import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryType } from '@prisma/client';
import { calculateTax } from './tax.helper';
import { getSalaryTaxRate } from './shared/get-salary-tax-rate';

@Injectable()
export class SalarySummaryService {
  constructor(private prisma: PrismaService) {}

  async getTeacherSalarySummary(teacherId: number, companyId: number) {
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
            expectedPerStudentPerLesson = groupConfig.value;
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

    const unpaidAccruals = await this.prisma.salaryAccrual.aggregate({
      where: { userId: teacherId, companyId, salaryPaymentId: null },
      _sum: { amount: true },
      _count: true,
    });

    const paidTotal = await this.prisma.salaryPayment.aggregate({
      where: { userId: teacherId, companyId, status: 'PAID' },
      _sum: { netAmount: true },
    });

    const fixedMonthlyConfig = configs.find(
      (c) => c.salaryType === SalaryType.FIXED_MONTHLY,
    );
    const expectedMonthlyTotal = fixedMonthlyConfig
      ? fixedMonthlyConfig.value
      : groupsBreakdown.reduce((sum, g) => sum + g.expectedMonthly, 0);

    // Show the teacher what they'd actually take home after tax, not just gross.
    const taxRate = await getSalaryTaxRate(this.prisma, companyId);
    const actualEarnedGross = unpaidAccruals._sum.amount ?? 0;
    const expectedTax = calculateTax(expectedMonthlyTotal, taxRate).taxAmount;
    const expectedNet = expectedMonthlyTotal - expectedTax;
    const actualEarnedTax = calculateTax(actualEarnedGross, taxRate).taxAmount;
    const actualEarnedNet = actualEarnedGross - actualEarnedTax;

    return {
      expectedMonthly: expectedMonthlyTotal,
      expectedTax,
      expectedNet,
      actualEarned: actualEarnedGross,
      actualEarnedTax,
      actualEarnedNet,
      accrualCount: unpaidAccruals._count,
      paidTotal: paidTotal._sum.netAmount ?? 0,
      taxRate,
      groups: groupsBreakdown,
      hasConfig: configs.length > 0,
      isFixedMonthly: !!fixedMonthlyConfig,
    };
  }
}
