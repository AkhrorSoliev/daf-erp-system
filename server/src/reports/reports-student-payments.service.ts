import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsStudentPaymentsService {
  constructor(private prisma: PrismaService) {}

  async getStudentPaymentsReport(
    companyId: number,
    params: {
      branchId?: number;
      groupIds?: string[];
      teacherIds?: number[];
      methods?: ('CASH' | 'PAYME' | 'CLICK' | 'UZUM' | 'TRANSFER')[];
      courseId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));

    const where: any = {
      companyId,
      status: 'COMPLETED' as const,
    };

    if (params.branchId !== undefined) {
      where.branchId = params.branchId;
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) {
        const end = new Date(params.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (params.methods && params.methods.length > 0) {
      where.method = { in: params.methods };
    }

    // Each of groupIds / teacherIds / courseId is a "match via contract OR via
    // the student's active enrollment". We AND these groups together so all
    // selected filters apply at once.
    const matchGroups: any[] = [];

    if (params.groupIds && params.groupIds.length > 0) {
      matchGroups.push({
        OR: [
          { contract: { groupId: { in: params.groupIds } } },
          {
            student: {
              enrollments: {
                some: {
                  groupId: { in: params.groupIds },
                  status: 'ACTIVE',
                  deletedAt: null,
                },
              },
            },
          },
        ],
      });
    }

    if (params.teacherIds && params.teacherIds.length > 0) {
      matchGroups.push({
        OR: [
          {
            contract: {
              group: {
                teachers: { some: { teacherId: { in: params.teacherIds } } },
              },
            },
          },
          {
            student: {
              enrollments: {
                some: {
                  status: 'ACTIVE',
                  deletedAt: null,
                  group: {
                    teachers: {
                      some: { teacherId: { in: params.teacherIds } },
                    },
                  },
                },
              },
            },
          },
        ],
      });
    }

    if (params.courseId) {
      matchGroups.push({
        OR: [
          { contract: { courseId: params.courseId } },
          {
            student: {
              enrollments: {
                some: {
                  status: 'ACTIVE',
                  deletedAt: null,
                  group: { courseId: params.courseId },
                },
              },
            },
          },
        ],
      });
    }

    if (matchGroups.length === 1) {
      where.OR = matchGroups[0].OR;
    } else if (matchGroups.length > 1) {
      where.AND = matchGroups;
    }

    const [payments, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          amount: true,
          method: true,
          note: true,
          createdAt: true,
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          receivedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          contract: {
            select: {
              group: {
                select: {
                  id: true,
                  name: true,
                  teachers: {
                    select: {
                      teacher: {
                        select: {
                          id: true,
                          firstName: true,
                          lastName: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    // Fallback: for payments without a contract group, derive group/teachers
    // from the student's active enrollment. Batched to avoid N+1.
    const studentIdsNeedingFallback = payments
      .filter((p) => !p.contract?.group)
      .map((p) => p.student.id);

    const fallbackByStudentId: Map<
      number,
      {
        group: { id: string; name: string };
        teachers: { id: number; firstName: string; lastName: string }[];
      } | null
    > = new Map();

    if (studentIdsNeedingFallback.length > 0) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          studentId: { in: studentIdsNeedingFallback },
          status: 'ACTIVE',
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          studentId: true,
          group: {
            select: {
              id: true,
              name: true,
              teachers: {
                select: {
                  teacher: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
      });
      for (const e of enrollments) {
        if (!fallbackByStudentId.has(e.studentId)) {
          fallbackByStudentId.set(e.studentId, {
            group: { id: e.group.id, name: e.group.name },
            teachers: e.group.teachers.map((t) => t.teacher),
          });
        }
      }
    }

    const data = payments.map((p) => {
      const contractGroup = p.contract?.group;
      const fallback = fallbackByStudentId.get(p.student.id) ?? null;
      const group = contractGroup
        ? { id: contractGroup.id, name: contractGroup.name }
        : (fallback?.group ?? null);
      const teachers = contractGroup
        ? contractGroup.teachers.map((t) => ({
            id: t.teacher.id,
            fullName: `${t.teacher.firstName} ${t.teacher.lastName}`,
          }))
        : (fallback?.teachers.map((t) => ({
            id: t.id,
            fullName: `${t.firstName} ${t.lastName}`,
          })) ?? []);

      return {
        id: p.id,
        student: {
          id: p.student.id,
          fullName: `${p.student.firstName} ${p.student.lastName}`,
        },
        group,
        teachers,
        amount: p.amount,
        bonus: null,
        paymentDate: p.createdAt.toISOString(),
        note: p.note,
        receivedBy: p.receivedBy
          ? {
              id: p.receivedBy.id,
              fullName: `${p.receivedBy.firstName} ${p.receivedBy.lastName}`,
            }
          : null,
        method: p.method,
      };
    });

    return { data, total, page, pageSize };
  }

  async getStudentPaymentsFilterOptions(companyId: number) {
    const [groups, teachers, courses] = await Promise.all([
      this.prisma.group.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, branchId: true },
      }),
      this.prisma.user.findMany({
        where: {
          companyId,
          deletedAt: null,
          roles: { some: { role: { name: 'Teacher' } } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.course.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    return {
      groups,
      teachers: teachers.map((t) => ({
        id: t.id,
        fullName: `${t.firstName} ${t.lastName}`,
      })),
      courses,
    };
  }
}
