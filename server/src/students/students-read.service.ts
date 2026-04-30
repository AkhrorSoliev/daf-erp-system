import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { StudentQueryDto } from './dto/student-query.dto';
import { studentSelect, formatStudent } from './shared/student-select';

@Injectable()
export class StudentsReadService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
  ) {}

  async findAll(query: StudentQueryDto, companyId: number) {
    const { page = 1, pageSize = 10, search, status, branch_id } = query;
    const skip = (page - 1) * pageSize;

    // Base where: company scope + search + teacher + branch (without status filter)
    const baseWhere: Prisma.StudentWhereInput = {
      deletedAt: null,
      companyId,
    };

    if (search) {
      const searchConditions: Prisma.StudentWhereInput[] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];

      const searchAsNumber = Number(search);
      if (!isNaN(searchAsNumber) && Number.isInteger(searchAsNumber)) {
        searchConditions.push({ id: { equals: searchAsNumber } });
      }

      baseWhere.OR = searchConditions;
    }

    const enrollmentConditions: Prisma.EnrollmentWhereInput[] = [
      { deletedAt: null },
    ];

    if (query.teacher_id) {
      enrollmentConditions.push({
        group: {
          deletedAt: null,
          teachers: { some: { teacherId: query.teacher_id } },
        },
      });
    }

    if (query.group_id) {
      enrollmentConditions.push({ groupId: query.group_id });
    }

    if (query.level) {
      enrollmentConditions.push({
        group: { deletedAt: null, level: query.level },
      });
    }

    if (enrollmentConditions.length > 1) {
      baseWhere.enrollments = { some: { AND: enrollmentConditions } };
    }

    if (branch_id) {
      baseWhere.branches = { some: { branchId: branch_id } };
    }

    // Full where: base + status filter (for main query)
    const where: Prisma.StudentWhereInput = { ...baseWhere };

    if (status === 'active') {
      where.status = StudentStatus.ACTIVE;
      const activeEnrollmentFilter = {
        enrollments: { some: { deletedAt: null } },
      };
      if (where.enrollments) {
        where.AND = [
          { enrollments: where.enrollments },
          activeEnrollmentFilter,
        ];
        delete where.enrollments;
      } else {
        where.enrollments = activeEnrollmentFilter.enrollments;
      }
    } else if (status === 'frozen') {
      where.status = StudentStatus.FROZEN;
    } else if (status === 'ungrouped') {
      where.status = StudentStatus.ACTIVE;
      const noEnrollmentFilter = { enrollments: { none: { deletedAt: null } } };
      if (where.enrollments) {
        where.AND = [{ enrollments: where.enrollments }, noEnrollmentFilter];
        delete where.enrollments;
      } else {
        where.enrollments = noEnrollmentFilter.enrollments;
      }
    } else if (status === 'graduated') {
      where.status = StudentStatus.GRADUATED;
    } else if (status === 'expelled') {
      where.status = StudentStatus.EXPELLED;
    }

    // Stats queries use baseWhere (no status filter) so they reflect the full filtered set
    const activeStatsWhere: Prisma.StudentWhereInput = {
      ...baseWhere,
      isActive: true,
    };
    if (baseWhere.enrollments) {
      activeStatsWhere.AND = [
        { enrollments: baseWhere.enrollments },
        { enrollments: { some: { deletedAt: null } } },
      ];
      delete activeStatsWhere.enrollments;
    } else {
      activeStatsWhere.enrollments = { some: { deletedAt: null } };
    }

    const [data, total, statsTotal, activeCount, frozenCount, debtorCount] =
      await Promise.all([
        this.prisma.student.findMany({
          where,
          skip,
          take: pageSize,
          select: studentSelect,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.student.count({ where }),
        this.prisma.student.count({ where: baseWhere }),
        this.prisma.student.count({ where: activeStatsWhere }),
        this.prisma.student.count({
          where: { ...baseWhere, status: StudentStatus.FROZEN },
        }),
        this.prisma.student.count({
          where: { ...baseWhere, balance: { lt: 0 } },
        }),
      ]);

    return {
      data: data.map(formatStudent),
      total,
      page,
      pageSize,
      stats: {
        total: statsTotal,
        active: activeCount,
        frozen: frozenCount,
        debtors: debtorCount,
      },
    };
  }

  async findById(id: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, companyId },
      select: studentSelect,
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    const lastTxn = await this.prisma.transaction.findFirst({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      select: { type: true },
    });

    return {
      ...formatStudent(student),
      lastTransactionType: lastTxn?.type ?? null,
    };
  }

  async getStatusHistory(id: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, companyId },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    return this.statusHistoryService.getHistory('Student', String(id));
  }

  /**
   * Active enrollments enriched with prepaid + per-lesson cost + already-
   * consumed lesson count. Used by the FROZEN status dialog so the admin
   * can preview "X dars × Y so'm = Z so'm balansga qaytariladi" before
   * confirming, and adjust the per-enrollment refund count if needed.
   *
   * Cap on the override input is `prepaidLessonsRemaining + consumedLessons` —
   * the admin can roll back as far as the very first paid lesson but no
   * further (we have no money to refund beyond what was actually deducted).
   */
  async getActiveEnrollmentsWithPrepaid(id: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new NotFoundException(`O'quvchi topilmadi`);

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: id,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { price: true, lessonPaymentCount: true } },
          },
        },
      },
    });

    if (enrollments.length === 0) return [];

    // perLessonCost: prefer the most recent unreversed LESSON_DEDUCTION
    // metadata so course price changes after the deduction don't inflate
    // the displayed refund. Falls back to current course price.
    const enrollmentIds = enrollments.map((e) => e.id);
    const recentDeductions = await this.prisma.transaction.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        type: 'LESSON_DEDUCTION',
        reversedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { enrollmentId: true, metadata: true },
    });
    const perLessonByEnrollment = new Map<string, number>();
    for (const d of recentDeductions) {
      if (perLessonByEnrollment.has(d.enrollmentId!)) continue; // first wins (most recent)
      const meta = d.metadata as { perLessonCost?: number } | null | undefined;
      if (
        meta &&
        typeof meta.perLessonCost === 'number' &&
        meta.perLessonCost > 0
      ) {
        perLessonByEnrollment.set(d.enrollmentId!, meta.perLessonCost);
      }
    }

    // Consumption count per enrollment — matches what refundPrepaidWithOverride
    // can actually reverse if the admin asks for more than current prepaid.
    const consumptionGroups = await this.prisma.transaction.groupBy({
      by: ['enrollmentId'],
      where: {
        enrollmentId: { in: enrollmentIds },
        type: 'LESSON_CONSUMPTION',
        reversedAt: null,
      },
      _count: true,
    });
    const consumedByEnrollment = new Map<string, number>();
    for (const g of consumptionGroups) {
      consumedByEnrollment.set(g.enrollmentId!, g._count);
    }

    return enrollments.map((e) => {
      const fallback = Math.round(
        e.group.course.price / (e.group.course.lessonPaymentCount || 12),
      );
      const perLessonCost = perLessonByEnrollment.get(e.id) ?? fallback;
      const consumedLessons = consumedByEnrollment.get(e.id) ?? 0;
      return {
        enrollmentId: e.id,
        groupId: e.group.id,
        groupName: e.group.name,
        prepaidLessonsRemaining: e.prepaidLessonsRemaining,
        perLessonCost,
        consumedLessons,
        maxRefundable: e.prepaidLessonsRemaining + consumedLessons,
        suggestedRefundAmount: e.prepaidLessonsRemaining * perLessonCost,
      };
    });
  }
}
