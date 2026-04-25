import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StudentPortalReadService {
  constructor(private prisma: PrismaService) {}

  async getProfile(studentId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        extraPhone: true,
        parentPhone: true,
        parentName: true,
        telegram: true,
        gender: true,
        dateOfBirth: true,
        photo: true,
        comment: true,
        balance: true,
        placeOfStudy: true,
        address: true,
        passportSeries: true,
        status: true,
        isActive: true,
        createdAt: true,
        userId: true,
        branches: {
          select: {
            branch: { select: { id: true, name: true } },
          },
        },
        enrollments: {
          where: { deletedAt: null, status: 'ACTIVE' },
          select: {
            id: true,
            createdAt: true,
            group: {
              select: {
                id: true,
                name: true,
                status: true,
                days: true,
                exactDays: true,
                lessonStartTime: true,
                lessonEndTime: true,
                startDate: true,
                endDate: true,
                course: { select: { id: true, name: true } },
                room: { select: { id: true, name: true } },
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
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Talaba topilmadi');
    }

    const { enrollments, branches, dateOfBirth, userId, ...rest } = student;

    let login: string | null = null;
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { login: true, photo: true, firstName: true, lastName: true },
      });
      login = user?.login ?? null;

      // Sync Student → User so history avatar/name renders correctly
      if (
        user?.photo !== rest.photo ||
        user?.firstName !== rest.firstName ||
        user?.lastName !== rest.lastName
      ) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            photo: rest.photo,
            firstName: rest.firstName,
            lastName: rest.lastName,
          },
        });
      }
    }

    return {
      ...rest,
      login,
      date_of_birth: dateOfBirth?.toISOString() ?? null,
      branches: branches.map((sb: any) => ({
        id: sb.branch.id,
        name: sb.branch.name,
      })),
      groups: enrollments.map((e: any) => ({
        id: e.group.id,
        enrollmentId: e.id,
        name: e.group.name,
        status: e.group.status,
        course_name: e.group.course?.name ?? null,
        days: e.group.days,
        exactDays: e.group.exactDays ?? [],
        lessonStartTime: e.group.lessonStartTime,
        lessonEndTime: e.group.lessonEndTime,
        startDate: e.group.startDate,
        endDate: e.group.endDate,
        room: e.group.room ?? null,
        teachers: (e.group.teachers ?? []).map((gt: any) => gt.teacher),
        enrolledAt: e.createdAt,
      })),
    };
  }

  async getSchedule(studentId: number) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        deletedAt: null,
        status: 'ACTIVE',
        group: {
          deletedAt: null,
          statusEnum: { in: ['ACTIVE', 'FORMING'] },
        },
      },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            days: true,
            exactDays: true,
            lessonStartTime: true,
            lessonEndTime: true,
            startDate: true,
            endDate: true,
            course: { select: { id: true, name: true } },
            room: { select: { id: true, name: true } },
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

    return enrollments.map((e) => ({
      groupId: e.group.id,
      groupName: e.group.name,
      courseName: e.group.course?.name ?? null,
      days: e.group.days,
      exactDays: e.group.exactDays ?? [],
      lessonStartTime: e.group.lessonStartTime,
      lessonEndTime: e.group.lessonEndTime,
      startDate: e.group.startDate,
      endDate: e.group.endDate,
      teachers: (e.group.teachers ?? []).map((gt: any) => gt.teacher),
      room: e.group.room ?? null,
    }));
  }

  async getAttendanceHistory(studentId: number) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, deletedAt: null },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            exactDays: true,
            lessonStartTime: true,
            lessonEndTime: true,
            course: { select: { name: true } },
          },
        },
      },
    });

    const groups = enrollments.map((e) => e.group);

    const result: any[] = [];
    for (const group of groups) {
      const records = await this.prisma.attendance.findMany({
        where: { studentId, groupId: group.id },
        orderBy: { date: 'desc' },
        select: {
          date: true,
          status: true,
          note: true,
        },
      });

      let present = 0,
        absent = 0,
        late = 0,
        excused = 0;
      for (const r of records) {
        if (r.status === 'PRESENT') present++;
        else if (r.status === 'ABSENT') absent++;
        else if (r.status === 'LATE') late++;
        else if (r.status === 'EXCUSED') excused++;
      }
      const total = records.length;
      const percentage =
        total > 0 ? Math.round(((present + late) / total) * 100) : 0;

      result.push({
        groupId: group.id,
        groupName: group.name,
        courseName: group.course?.name ?? null,
        lessonTime:
          group.lessonStartTime && group.lessonEndTime
            ? `${group.lessonStartTime} – ${group.lessonEndTime}`
            : null,
        stats: { total, present, absent, late, excused, percentage },
        records: records.map((r) => ({
          date: r.date.toISOString().split('T')[0],
          status: r.status,
          note: r.note,
        })),
      });
    }

    return result;
  }

  async getAttendanceStats(studentId: number) {
    const grouped = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { studentId },
      _count: true,
    });

    let total = 0;
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    for (const row of grouped) {
      total += row._count;
      switch (row.status) {
        case 'PRESENT':
          present = row._count;
          break;
        case 'ABSENT':
          absent = row._count;
          break;
        case 'LATE':
          late = row._count;
          break;
        case 'EXCUSED':
          excused = row._count;
          break;
      }
    }

    const percentage =
      total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return { total, present, absent, late, excused, percentage };
  }

  async getPaymentHistory(studentId: number) {
    const [payments, transactions] = await Promise.all([
      this.prisma.payment.findMany({
        where: { studentId },
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.transaction.findMany({
        where: { studentId },
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          description: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return { payments, transactions };
  }
}
