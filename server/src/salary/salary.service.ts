import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryPaymentStatus, SalaryType, Prisma } from '@prisma/client';
import { CreateSalaryConfigDto, GlobalSalaryConfigDto, UpdateSalaryConfigDto } from './dto/salary-config.dto';
import { SalaryPaymentQueryDto } from './dto/salary-query.dto';

@Injectable()
export class SalaryService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
  ) {}

  // ===== SALARY CONFIG =====

  async getConfig(teacherId: number) {
    return this.prisma.teacherSalaryConfig.findMany({
      where: { teacherId, isActive: true },
      select: {
        id: true,
        salaryType: true,
        value: true,
        isActive: true,
        groupId: true,
        group: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createConfig(dto: CreateSalaryConfigDto, companyId: number) {
    // Prisma unique constraint with nullable field needs findFirst + create/update
    const existing = await this.prisma.teacherSalaryConfig.findFirst({
      where: {
        teacherId: dto.teacherId,
        groupId: dto.groupId ?? null,
        companyId,
      },
    });

    if (existing) {
      return this.prisma.teacherSalaryConfig.update({
        where: { id: existing.id },
        data: {
          salaryType: dto.salaryType,
          value: dto.value,
          isActive: true,
        },
      });
    }

    return this.prisma.teacherSalaryConfig.create({
      data: {
        teacherId: dto.teacherId,
        groupId: dto.groupId ?? null,
        salaryType: dto.salaryType,
        value: dto.value,
        companyId,
      },
    });
  }

  async applyGlobalConfig(dto: GlobalSalaryConfigDto, companyId: number) {
    // Get all active teachers
    const teachers = await this.prisma.groupTeacher.findMany({
      where: {
        group: { deletedAt: null, companyId },
      },
      select: { teacherId: true },
      distinct: ['teacherId'],
    });

    const results = await Promise.all(
      teachers.map(async (t) => {
        const existing = await this.prisma.teacherSalaryConfig.findFirst({
          where: { teacherId: t.teacherId, groupId: null, companyId },
        });
        if (existing) {
          return this.prisma.teacherSalaryConfig.update({
            where: { id: existing.id },
            data: { salaryType: dto.salaryType, value: dto.value, isActive: true },
          });
        }
        return this.prisma.teacherSalaryConfig.create({
          data: {
            teacherId: t.teacherId,
            groupId: null,
            salaryType: dto.salaryType,
            value: dto.value,
            companyId,
          },
        });
      }),
    );

    return { updated: results.length };
  }

  async updateConfig(id: string, dto: UpdateSalaryConfigDto) {
    const existing = await this.prisma.teacherSalaryConfig.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Salary config topilmadi');

    return this.prisma.teacherSalaryConfig.update({
      where: { id },
      data: {
        ...(dto.salaryType && { salaryType: dto.salaryType }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  // ===== SALARY ACCRUAL (called from attendance) =====

  async createAccrual(params: {
    teacherId: number;
    studentId: number;
    groupId: string;
    attendanceId: string;
    lessonDate: Date;
    perLessonCost: number;
    companyId: number;
  }) {
    // Get salary config for this teacher (group-specific or default)
    const config = await this.prisma.teacherSalaryConfig.findFirst({
      where: {
        teacherId: params.teacherId,
        isActive: true,
        OR: [
          { groupId: params.groupId },
          { groupId: null },
        ],
      },
      orderBy: { groupId: 'desc' }, // group-specific takes priority (non-null first)
    });

    if (!config) return null; // No salary config = no accrual

    let amount: number;
    if (config.salaryType === SalaryType.PERCENTAGE) {
      amount = Math.round(params.perLessonCost * config.value / 100);
    } else {
      amount = config.value;
    }

    // Upsert to handle idempotency
    return this.prisma.salaryAccrual.upsert({
      where: {
        teacherId_studentId_groupId_lessonDate: {
          teacherId: params.teacherId,
          studentId: params.studentId,
          groupId: params.groupId,
          lessonDate: params.lessonDate,
        },
      },
      create: {
        teacherId: params.teacherId,
        studentId: params.studentId,
        groupId: params.groupId,
        attendanceId: params.attendanceId,
        lessonDate: params.lessonDate,
        amount,
        companyId: params.companyId,
      },
      update: {
        amount,
        attendanceId: params.attendanceId,
      },
    });
  }

  // ===== TEACHER SALARY SUMMARY =====

  /**
   * Get teacher salary summary for profile page:
   * - expectedSalary: based on active students × config (max possible per month)
   * - actualEarned: sum of unpaid accruals (real earnings so far)
   * - paidTotal: sum of all paid salary payments
   * - studentsBreakdown: per-group student counts and expected earnings
   */
  async getTeacherSalarySummary(teacherId: number, companyId: number) {
    // Get salary configs
    const configs = await this.prisma.teacherSalaryConfig.findMany({
      where: { teacherId, isActive: true, companyId },
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

    // Get all groups this teacher is assigned to
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

    // Default config (groupId = null)
    const defaultConfig = configs.find((c) => !c.groupId);

    // Calculate expected salary per group
    const groupsBreakdown = teacherGroups
      .filter((tg) => tg.group.statusEnum === 'ACTIVE')
      .map((tg) => {
        const groupConfig = configs.find((c) => c.groupId === tg.group.id) ?? defaultConfig;
        const activeStudents = tg.group._count.enrollments;
        const lessonPaymentCount = tg.group.course.lessonPaymentCount || 12;
        const perLessonCost = Math.round(tg.group.course.price / lessonPaymentCount);

        // Lessons per month (approximate: exactDays.length * 4 weeks)
        const lessonsPerMonth = tg.group.exactDays.length * 4;

        let expectedPerStudentPerLesson = 0;
        if (groupConfig) {
          if (groupConfig.salaryType === SalaryType.PERCENTAGE) {
            expectedPerStudentPerLesson = Math.round(perLessonCost * groupConfig.value / 100);
          } else {
            expectedPerStudentPerLesson = groupConfig.value;
          }
        }

        const expectedMonthly = expectedPerStudentPerLesson * activeStudents * lessonsPerMonth;

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

    // Actual earned (unpaid accruals)
    const unpaidAccruals = await this.prisma.salaryAccrual.aggregate({
      where: { teacherId, companyId, salaryPaymentId: null },
      _sum: { amount: true },
      _count: true,
    });

    // Total paid
    const paidTotal = await this.prisma.salaryPayment.aggregate({
      where: { teacherId, companyId, status: 'PAID' },
      _sum: { netAmount: true },
    });

    const expectedMonthlyTotal = groupsBreakdown.reduce((sum, g) => sum + g.expectedMonthly, 0);

    return {
      expectedMonthly: expectedMonthlyTotal,
      actualEarned: unpaidAccruals._sum.amount ?? 0,
      accrualCount: unpaidAccruals._count,
      paidTotal: paidTotal._sum.netAmount ?? 0,
      groups: groupsBreakdown,
      hasConfig: configs.length > 0,
    };
  }

  // ===== SALARY ACCRUALS QUERY =====

  async getAccruals(teacherId: number, companyId: number) {
    return this.prisma.salaryAccrual.findMany({
      where: {
        teacherId,
        companyId,
        salaryPaymentId: null, // only unpaid accruals
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        lessonDate: true,
        amount: true,
        createdAt: true,
      },
      orderBy: { lessonDate: 'desc' },
    });
  }

  // ===== SALARY CALCULATION (manual trigger or cron) =====

  async calculateMonthlySalaries(companyId: number) {
    const now = new Date();
    // Cutoff: 7th of current month
    const cutoffDate = new Date(now.getFullYear(), now.getMonth(), 7, 23, 59, 59);
    // Period start: 8th of previous month
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 8);

    // Get all unpaid accruals up to cutoff
    const accruals = await this.prisma.salaryAccrual.findMany({
      where: {
        companyId,
        salaryPaymentId: null,
        lessonDate: { lte: cutoffDate },
      },
      select: {
        id: true,
        teacherId: true,
        amount: true,
      },
    });

    // Group by teacher
    const byTeacher = new Map<number, { ids: string[]; total: number }>();
    for (const a of accruals) {
      const entry = byTeacher.get(a.teacherId) ?? { ids: [], total: 0 };
      entry.ids.push(a.id);
      entry.total += a.amount;
      byTeacher.set(a.teacherId, entry);
    }

    const results: { teacherId: number; grossAmount: number; netAmount: number }[] = [];

    for (const [teacherId, { ids, total }] of byTeacher) {
      const grossAmount = total;
      const taxAmount = 0; // Tax config TBD
      const netAmount = grossAmount - taxAmount;

      const salaryPayment = await this.prisma.salaryPayment.create({
        data: {
          teacherId,
          periodStart,
          periodEnd: cutoffDate,
          grossAmount,
          taxAmount,
          netAmount,
          status: SalaryPaymentStatus.CALCULATED,
          companyId,
        },
      });

      // Link accruals to this payment
      await this.prisma.salaryAccrual.updateMany({
        where: { id: { in: ids } },
        data: { salaryPaymentId: salaryPayment.id },
      });

      results.push({ teacherId, grossAmount, netAmount });
    }

    return { calculated: results.length, details: results };
  }

  // ===== SALARY PAYMENTS =====

  async findPayments(query: SalaryPaymentQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.SalaryPaymentWhereInput = {
      companyId,
      ...(query.teacherId && { teacherId: query.teacherId }),
      ...(query.status && { status: query.status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.salaryPayment.findMany({
        where,
        select: {
          id: true,
          grossAmount: true,
          taxAmount: true,
          netAmount: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          paidAt: true,
          createdAt: true,
          teacher: { select: { id: true, firstName: true, lastName: true } },
          paidBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.salaryPayment.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async approvePayment(id: string) {
    const payment = await this.prisma.salaryPayment.findUnique({
      where: { id },
    });
    if (!payment) throw new NotFoundException('Oylik topilmadi');
    if (payment.status !== SalaryPaymentStatus.CALCULATED) {
      throw new BadRequestException('Faqat CALCULATED statusdagi oylikni tasdiqlash mumkin');
    }

    return this.prisma.salaryPayment.update({
      where: { id },
      data: { status: SalaryPaymentStatus.APPROVED },
    });
  }

  async payPayment(id: string, userId: number) {
    const payment = await this.prisma.salaryPayment.findUnique({
      where: { id },
    });
    if (!payment) throw new NotFoundException('Oylik topilmadi');
    if (payment.status !== SalaryPaymentStatus.APPROVED) {
      throw new BadRequestException("Faqat APPROVED statusdagi oylikni to'lash mumkin");
    }

    // Record transaction
    await this.transactionsService.recordSalaryPayment({
      teacherId: payment.teacherId,
      amount: payment.netAmount,
      salaryPaymentId: payment.id,
      companyId: payment.companyId,
      performedById: userId,
    });

    return this.prisma.salaryPayment.update({
      where: { id },
      data: {
        status: SalaryPaymentStatus.PAID,
        paidAt: new Date(),
        paidById: userId,
      },
    });
  }
}
