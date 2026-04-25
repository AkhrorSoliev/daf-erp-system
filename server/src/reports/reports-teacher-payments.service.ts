import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsTeacherPaymentsService {
  constructor(private prisma: PrismaService) {}

  async getTeacherPaymentReports(
    companyId: number,
    options: { branchId?: number; startDate?: string; endDate?: string },
  ) {
    const range = this.resolveRange(options.startDate, options.endDate);
    const branchFilter = options.branchId ? { branchId: options.branchId } : {};

    const teachers = await this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        roles: { some: { roleId: 4 } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        groupTeachers: {
          where: {
            group: { deletedAt: null, ...branchFilter },
          },
          select: {
            group: {
              select: {
                id: true,
                course: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const allGroupIds = Array.from(
      new Set(
        teachers.flatMap((t) => t.groupTeachers.map((gt) => gt.group.id)),
      ),
    );

    if (allGroupIds.length === 0) {
      return { teachers: [] };
    }

    const [enrollmentsByGroup, payments, debtorStudents] = await Promise.all([
      this.prisma.enrollment.groupBy({
        by: ['groupId'],
        where: {
          groupId: { in: allGroupIds },
          deletedAt: null,
          status: { in: ['ACTIVE', 'FROZEN'] },
        },
        _count: { _all: true },
      }),
      this.prisma.payment.findMany({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: range.start, lte: range.end },
          contract: { groupId: { in: allGroupIds } },
        },
        select: {
          amount: true,
          contract: { select: { groupId: true } },
        },
      }),
      this.prisma.student.findMany({
        where: {
          companyId,
          deletedAt: null,
          balance: { lt: 0 },
          enrollments: {
            some: {
              groupId: { in: allGroupIds },
              deletedAt: null,
              status: { in: ['ACTIVE', 'FROZEN'] },
            },
          },
        },
        select: {
          balance: true,
          enrollments: {
            where: {
              groupId: { in: allGroupIds },
              deletedAt: null,
              status: { in: ['ACTIVE', 'FROZEN'] },
            },
            select: { groupId: true },
          },
        },
      }),
    ]);

    const studentCountByGroup = new Map<string, number>(
      enrollmentsByGroup.map((e) => [e.groupId, e._count._all]),
    );

    const paymentsByGroup = new Map<string, number>();
    for (const p of payments) {
      const gid = p.contract?.groupId;
      if (gid) {
        paymentsByGroup.set(gid, (paymentsByGroup.get(gid) ?? 0) + p.amount);
      }
    }

    const debtByGroup = new Map<string, number>();
    for (const s of debtorStudents) {
      for (const e of s.enrollments) {
        debtByGroup.set(
          e.groupId,
          (debtByGroup.get(e.groupId) ?? 0) + Math.abs(s.balance),
        );
      }
    }

    const result = teachers
      .map((t) => {
        const groupIds = t.groupTeachers.map((gt) => gt.group.id);
        const courses = Array.from(
          new Set(t.groupTeachers.map((gt) => gt.group.course.name)),
        );
        const studentCount = groupIds.reduce(
          (acc, gid) => acc + (studentCountByGroup.get(gid) ?? 0),
          0,
        );
        const totalPayments = groupIds.reduce(
          (acc, gid) => acc + (paymentsByGroup.get(gid) ?? 0),
          0,
        );
        const debtAmount = groupIds.reduce(
          (acc, gid) => acc + (debtByGroup.get(gid) ?? 0),
          0,
        );
        return {
          id: t.id,
          name: `${t.firstName} ${t.lastName}`,
          groupCount: groupIds.length,
          courses,
          studentCount,
          totalPayments,
          debtAmount,
        };
      })
      .filter((t) => t.groupCount > 0)
      .sort((a, b) => b.totalPayments - a.totalPayments);

    return { teachers: result };
  }

  async getTeacherGroupsReport(
    companyId: number,
    teacherId: number,
    options: { branchId?: number; startDate?: string; endDate?: string },
  ) {
    const range = this.resolveRange(options.startDate, options.endDate);
    const branchFilter = options.branchId ? { branchId: options.branchId } : {};

    const teacher = await this.prisma.user.findFirst({
      where: { id: teacherId, companyId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) {
      throw new NotFoundException("O'qituvchi topilmadi");
    }

    const groupTeachers = await this.prisma.groupTeacher.findMany({
      where: {
        teacherId,
        group: { deletedAt: null, ...branchFilter },
      },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { price: true } },
          },
        },
      },
    });

    const groups = groupTeachers.map((gt) => gt.group);
    const groupIds = groups.map((g) => g.id);

    if (groupIds.length === 0) {
      return {
        teacher: {
          id: teacher.id,
          name: `${teacher.firstName} ${teacher.lastName}`,
        },
        groups: [],
      };
    }

    const [enrollments, payments, debtorStudents] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: {
          groupId: { in: groupIds },
          deletedAt: null,
          status: { in: ['ACTIVE', 'FROZEN'] },
        },
        select: { groupId: true, studentId: true },
      }),
      this.prisma.payment.findMany({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: range.start, lte: range.end },
          contract: { groupId: { in: groupIds } },
        },
        select: {
          amount: true,
          studentId: true,
          contract: { select: { groupId: true } },
        },
      }),
      this.prisma.student.findMany({
        where: {
          companyId,
          deletedAt: null,
          balance: { lt: 0 },
          enrollments: {
            some: {
              groupId: { in: groupIds },
              deletedAt: null,
              status: { in: ['ACTIVE', 'FROZEN'] },
            },
          },
        },
        select: {
          balance: true,
          enrollments: {
            where: {
              groupId: { in: groupIds },
              deletedAt: null,
              status: { in: ['ACTIVE', 'FROZEN'] },
            },
            select: { groupId: true },
          },
        },
      }),
    ]);

    const studentsByGroup = new Map<string, Set<number>>();
    for (const e of enrollments) {
      if (!studentsByGroup.has(e.groupId)) {
        studentsByGroup.set(e.groupId, new Set());
      }
      studentsByGroup.get(e.groupId)!.add(e.studentId);
    }

    const paymentSumByGroup = new Map<string, number>();
    const paidStudentsByGroup = new Map<string, Set<number>>();
    for (const p of payments) {
      const gid = p.contract?.groupId;
      if (!gid) continue;
      paymentSumByGroup.set(
        gid,
        (paymentSumByGroup.get(gid) ?? 0) + p.amount,
      );
      if (!paidStudentsByGroup.has(gid)) {
        paidStudentsByGroup.set(gid, new Set());
      }
      paidStudentsByGroup.get(gid)!.add(p.studentId);
    }

    const debtByGroup = new Map<string, { count: number; sum: number }>();
    for (const s of debtorStudents) {
      for (const e of s.enrollments) {
        const cur = debtByGroup.get(e.groupId) ?? { count: 0, sum: 0 };
        cur.count += 1;
        cur.sum += Math.abs(s.balance);
        debtByGroup.set(e.groupId, cur);
      }
    }

    const result = groups
      .map((g) => {
        const totalStudents = studentsByGroup.get(g.id)?.size ?? 0;
        const paidCount = paidStudentsByGroup.get(g.id)?.size ?? 0;
        const debt = debtByGroup.get(g.id) ?? { count: 0, sum: 0 };
        const totalPayments = paymentSumByGroup.get(g.id) ?? 0;
        return {
          id: g.id,
          name: g.name,
          coursePrice: g.course.price,
          totalStudents,
          paidCount,
          debtorCount: debt.count,
          totalPayments,
          debtAmount: debt.sum,
          expectedAmount: totalStudents * g.course.price,
        };
      })
      .sort((a, b) => b.totalPayments - a.totalPayments);

    return {
      teacher: {
        id: teacher.id,
        name: `${teacher.firstName} ${teacher.lastName}`,
      },
      groups: result,
    };
  }

  private resolveRange(startDate?: string, endDate?: string) {
    const now = new Date();
    const start = startDate
      ? new Date(startDate + 'T00:00:00.000Z')
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate
      ? new Date(endDate + 'T23:59:59.999Z')
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
}
