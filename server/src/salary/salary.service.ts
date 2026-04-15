import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryPaymentStatus, SalaryType, TransactionType, Prisma } from '@prisma/client';
import { CreateSalaryConfigDto, GlobalSalaryConfigDto, UpdateSalaryConfigDto } from './dto/salary-config.dto';
import { SalaryPaymentQueryDto } from './dto/salary-query.dto';
import { calculateTax, DEFAULT_SALARY_TAX_RATE } from './tax.helper';
import {
  assertValidTransition,
  SALARY_PAYMENT_TRANSITIONS,
} from '../common/finance/status-transitions';

@Injectable()
export class SalaryService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
  ) {}

  // ===== SALARY CONFIG =====

  async getConfig(userId: number) {
    return this.prisma.employeeSalaryConfig.findMany({
      where: { userId, isActive: true },
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
    if (dto.salaryType === SalaryType.FIXED_MONTHLY && dto.groupId) {
      throw new BadRequestException(
        "FIXED_MONTHLY oylik turi guruh bilan bog'lab bo'lmaydi",
      );
    }

    const existing = await this.prisma.employeeSalaryConfig.findFirst({
      where: {
        userId: dto.userId,
        groupId: dto.groupId ?? null,
        companyId,
      },
    });

    if (existing) {
      return this.prisma.employeeSalaryConfig.update({
        where: { id: existing.id },
        data: {
          salaryType: dto.salaryType,
          value: dto.value,
          isActive: true,
        },
      });
    }

    return this.prisma.employeeSalaryConfig.create({
      data: {
        userId: dto.userId,
        groupId: dto.groupId ?? null,
        salaryType: dto.salaryType,
        value: dto.value,
        companyId,
      },
    });
  }

  async applyGlobalConfig(dto: GlobalSalaryConfigDto, companyId: number) {
    if (dto.salaryType === SalaryType.FIXED_MONTHLY) {
      throw new BadRequestException(
        "FIXED_MONTHLY oylik turini global qo'llab bo'lmaydi — har xodim uchun alohida belgilang",
      );
    }

    const teachers = await this.prisma.groupTeacher.findMany({
      where: {
        group: { deletedAt: null, companyId },
      },
      select: { teacherId: true },
      distinct: ['teacherId'],
    });

    const results = await Promise.all(
      teachers.map(async (t) => {
        const existing = await this.prisma.employeeSalaryConfig.findFirst({
          where: { userId: t.teacherId, groupId: null, companyId },
        });
        if (existing) {
          return this.prisma.employeeSalaryConfig.update({
            where: { id: existing.id },
            data: { salaryType: dto.salaryType, value: dto.value, isActive: true },
          });
        }
        return this.prisma.employeeSalaryConfig.create({
          data: {
            userId: t.teacherId,
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

  async updateConfig(id: string, dto: UpdateSalaryConfigDto, companyId: number) {
    const existing = await this.prisma.employeeSalaryConfig.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Salary config topilmadi');

    if (dto.salaryType === SalaryType.FIXED_MONTHLY && existing.groupId) {
      throw new BadRequestException(
        "FIXED_MONTHLY oylik turi guruh bilan bog'lab bo'lmaydi",
      );
    }

    return this.prisma.employeeSalaryConfig.update({
      where: { id },
      data: {
        ...(dto.salaryType && { salaryType: dto.salaryType }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  // ===== SALARY ACCRUAL (called from attendance — teacher-only) =====

  /**
   * Write a salary accrual for one teacher on one lesson for one student.
   *
   * Coverage rule (Phase B.1): the lesson must be backed by a paid
   * LESSON_DEDUCTION transaction. Callers pass `deductionTransactionId` of the
   * cycle deduction the student is currently consuming. Without it, no accrual
   * is written — teachers don't earn for unpaid lessons.
   */
  async createAccrual(params: {
    teacherId: number;
    studentId: number;
    groupId: string;
    attendanceId: string;
    lessonDate: Date;
    perLessonCost: number;
    companyId: number;
    deductionTransactionId?: string | null;
  }) {
    if (!params.deductionTransactionId) {
      // Student has no active payment cycle — teacher does not earn for this lesson.
      return null;
    }

    const config = await this.prisma.employeeSalaryConfig.findFirst({
      where: {
        userId: params.teacherId,
        isActive: true,
        salaryType: { in: [SalaryType.PERCENTAGE, SalaryType.FIXED_PER_STUDENT] },
        OR: [
          { groupId: params.groupId },
          { groupId: null },
        ],
      },
      orderBy: { groupId: 'desc' }, // group-specific takes priority (non-null first)
    });

    if (!config) return null;

    let amount: number;
    if (config.salaryType === SalaryType.PERCENTAGE) {
      amount = Math.round(params.perLessonCost * config.value / 100);
    } else {
      amount = config.value;
    }

    return this.prisma.salaryAccrual.upsert({
      where: {
        userId_studentId_groupId_lessonDate: {
          userId: params.teacherId,
          studentId: params.studentId,
          groupId: params.groupId,
          lessonDate: params.lessonDate,
        },
      },
      create: {
        userId: params.teacherId,
        studentId: params.studentId,
        groupId: params.groupId,
        attendanceId: params.attendanceId,
        lessonDate: params.lessonDate,
        amount,
        companyId: params.companyId,
        deductionTransactionId: params.deductionTransactionId,
      },
      update: {
        amount,
        attendanceId: params.attendanceId,
        deductionTransactionId: params.deductionTransactionId,
      },
    });
  }

  // ===== TEACHER SALARY SUMMARY (profile page) =====

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
        const groupConfig = configs.find((c) => c.groupId === tg.group.id) ?? defaultConfig;
        const activeStudents = tg.group._count.enrollments;
        const lessonPaymentCount = tg.group.course.lessonPaymentCount || 12;
        const perLessonCost = Math.round(tg.group.course.price / lessonPaymentCount);
        const lessonsPerMonth = tg.group.exactDays.length * 4;

        let expectedPerStudentPerLesson = 0;
        if (groupConfig && groupConfig.salaryType !== SalaryType.FIXED_MONTHLY) {
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

    const unpaidAccruals = await this.prisma.salaryAccrual.aggregate({
      where: { userId: teacherId, companyId, salaryPaymentId: null },
      _sum: { amount: true },
      _count: true,
    });

    const paidTotal = await this.prisma.salaryPayment.aggregate({
      where: { userId: teacherId, companyId, status: 'PAID' },
      _sum: { netAmount: true },
    });

    const fixedMonthlyConfig = configs.find((c) => c.salaryType === SalaryType.FIXED_MONTHLY);
    const expectedMonthlyTotal = fixedMonthlyConfig
      ? fixedMonthlyConfig.value
      : groupsBreakdown.reduce((sum, g) => sum + g.expectedMonthly, 0);

    // Show the teacher what they'd actually take home after tax, not just gross.
    const taxRate = await this.getSalaryTaxRate(companyId);
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

  // ===== SALARY ACCRUALS QUERY =====

  async getAccruals(userId: number, companyId: number) {
    return this.prisma.salaryAccrual.findMany({
      where: {
        userId,
        companyId,
        salaryPaymentId: null,
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
    // Cutoff: 7th of current month.
    const cutoffDate = new Date(now.getFullYear(), now.getMonth(), 7, 23, 59, 59);
    // Period start: 8th of previous month.
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 8);

    // Per-company tax rate (default 12% ASOT if not configured).
    const taxRate = await this.getSalaryTaxRate(companyId);

    const results: { userId: number; grossAmount: number; taxAmount: number; netAmount: number; kind: 'ACCRUAL' | 'FIXED_MONTHLY' }[] = [];

    // === ACCRUAL-BASED (teachers) ===
    const accruals = await this.prisma.salaryAccrual.findMany({
      where: {
        companyId,
        salaryPaymentId: null,
        lessonDate: { lte: cutoffDate },
      },
      select: {
        id: true,
        userId: true,
        amount: true,
      },
    });

    const byUser = new Map<number, { ids: string[]; total: number }>();
    for (const a of accruals) {
      const entry = byUser.get(a.userId) ?? { ids: [], total: 0 };
      entry.ids.push(a.id);
      entry.total += a.amount;
      byUser.set(a.userId, entry);
    }

    for (const [userId, { ids, total }] of byUser) {
      const grossAmount = total;
      const { taxAmount, netAmount } = calculateTax(grossAmount, taxRate);

      const salaryPayment = await this.prisma.salaryPayment.create({
        data: {
          userId,
          periodStart,
          periodEnd: cutoffDate,
          grossAmount,
          taxAmount,
          netAmount,
          status: SalaryPaymentStatus.CALCULATED,
          companyId,
        },
      });

      await this.prisma.salaryAccrual.updateMany({
        where: { id: { in: ids } },
        data: { salaryPaymentId: salaryPayment.id },
      });

      if (taxAmount > 0) {
        await this.writeTaxLedgerEntry(userId, taxAmount, salaryPayment.id, companyId);
      }

      results.push({ userId, grossAmount, taxAmount, netAmount, kind: 'ACCRUAL' });
    }

    // === FIXED MONTHLY (admins, cashiers, branch directors, or teachers on fixed salary) ===
    const fixedMonthlyConfigs = await this.prisma.employeeSalaryConfig.findMany({
      where: {
        companyId,
        salaryType: SalaryType.FIXED_MONTHLY,
        isActive: true,
        groupId: null,
      },
      select: { userId: true, value: true },
    });

    for (const config of fixedMonthlyConfigs) {
      // Skip if a payment already exists for this exact period (idempotent cron).
      const existing = await this.prisma.salaryPayment.findFirst({
        where: {
          userId: config.userId,
          companyId,
          periodStart,
          periodEnd: cutoffDate,
        },
        select: { id: true },
      });
      if (existing) continue;

      const grossAmount = config.value;
      const { taxAmount, netAmount } = calculateTax(grossAmount, taxRate);

      const salaryPayment = await this.prisma.salaryPayment.create({
        data: {
          userId: config.userId,
          periodStart,
          periodEnd: cutoffDate,
          grossAmount,
          taxAmount,
          netAmount,
          status: SalaryPaymentStatus.CALCULATED,
          companyId,
        },
      });

      if (taxAmount > 0) {
        await this.writeTaxLedgerEntry(config.userId, taxAmount, salaryPayment.id, companyId);
      }

      results.push({ userId: config.userId, grossAmount, taxAmount, netAmount, kind: 'FIXED_MONTHLY' });
    }

    return { calculated: results.length, details: results };
  }

  /**
   * Fetch per-company salary tax rate, falling back to the Uzbekistan default
   * (12% ASOT) when no config row exists.
   */
  private async getSalaryTaxRate(companyId: number): Promise<number> {
    const config = await this.prisma.companyTaxConfig.findUnique({
      where: { companyId },
      select: { salaryTaxRate: true, isActive: true },
    });
    if (!config || !config.isActive) return DEFAULT_SALARY_TAX_RATE;
    return config.salaryTaxRate;
  }

  /**
   * Write a TAX ledger entry alongside the SalaryPayment so cash-flow reports
   * can sum company tax liability directly from Transaction.
   */
  private async writeTaxLedgerEntry(
    userId: number,
    taxAmount: number,
    salaryPaymentId: string,
    companyId: number,
  ) {
    await this.prisma.transaction.create({
      data: {
        type: TransactionType.TAX,
        amount: -taxAmount,
        balanceBefore: 0,
        balanceAfter: 0,
        teacherId: userId,
        salaryPaymentId,
        companyId,
        description: 'Oylik soliqi',
      },
    });
  }

  // ===== SALARY PAYMENTS =====

  async findPayments(query: SalaryPaymentQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.SalaryPaymentWhereInput = {
      companyId,
      ...(query.userId && { userId: query.userId }),
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
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              roles: { select: { role: { select: { id: true, name: true } } } },
            },
          },
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

  async approvePayment(id: string, companyId: number) {
    const payment = await this.prisma.salaryPayment.findFirst({
      where: { id, companyId },
    });
    if (!payment) throw new NotFoundException('Oylik topilmadi');
    assertValidTransition(
      'SalaryPayment',
      SALARY_PAYMENT_TRANSITIONS,
      payment.status,
      SalaryPaymentStatus.APPROVED,
    );

    return this.prisma.salaryPayment.update({
      where: { id },
      data: { status: SalaryPaymentStatus.APPROVED },
    });
  }

  async payPayment(id: string, performedById: number, companyId: number) {
    const payment = await this.prisma.salaryPayment.findFirst({
      where: { id, companyId },
    });
    if (!payment) throw new NotFoundException('Oylik topilmadi');
    assertValidTransition(
      'SalaryPayment',
      SALARY_PAYMENT_TRANSITIONS,
      payment.status,
      SalaryPaymentStatus.PAID,
    );

    await this.transactionsService.recordSalaryPayment({
      userId: payment.userId,
      amount: payment.netAmount,
      salaryPaymentId: payment.id,
      companyId: payment.companyId,
      performedById,
    });

    return this.prisma.salaryPayment.update({
      where: { id },
      data: {
        status: SalaryPaymentStatus.PAID,
        paidAt: new Date(),
        paidById: performedById,
      },
    });
  }

  /**
   * Pay out a batch of salary payments in one click — intended for the 10th of
   * the month, after cron has calculated and CEO has approved the current
   * period. Accepts an optional filter so a branch director or cashier can
   * pay only their scope.
   *
   * Only APPROVED payments are processed; CALCULATED ones are skipped (they
   * need to be approved first). Each payment is wrapped in its own transaction
   * so a failure on one doesn't roll back the others — the caller sees per-
   * payment success/error.
   */
  async batchPay(
    params: {
      companyId: number;
      branchId?: number;
      userIds?: number[];
      statuses?: SalaryPaymentStatus[];
    },
    performedById: number,
  ) {
    const statuses = params.statuses ?? [SalaryPaymentStatus.APPROVED];

    const eligible = await this.prisma.salaryPayment.findMany({
      where: {
        companyId: params.companyId,
        status: { in: statuses },
        ...(params.userIds && params.userIds.length > 0 && { userId: { in: params.userIds } }),
      },
      select: { id: true, userId: true, netAmount: true },
    });

    const results: { id: string; userId: number; status: 'PAID' | 'FAILED'; error?: string }[] = [];

    for (const payment of eligible) {
      try {
        await this.payPayment(payment.id, performedById, params.companyId);
        results.push({ id: payment.id, userId: payment.userId, status: 'PAID' });
      } catch (err) {
        results.push({
          id: payment.id,
          userId: payment.userId,
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      total: eligible.length,
      paid: results.filter((r) => r.status === 'PAID').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      results,
    };
  }
}
