import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getTodaySchedule(branchId: number, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const dayName = DAY_NAMES[targetDate.getDay()];
    const dateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

    const [holiday, branch, rooms, groups] = await Promise.all([
      this.prisma.holiday.findFirst({
        where: {
          date: dateOnly,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { name: true },
      }),

      this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { startOfWorkingDay: true, endOfWorkingDay: true },
      }),

      this.prisma.room.findMany({
        where: {
          branchId,
          deletedAt: null,
          status: 'ACTIVE',
        },
        select: { id: true, name: true, capacity: true },
        orderBy: { name: 'asc' },
      }),

      this.prisma.group.findMany({
        where: {
          branchId,
          deletedAt: null,
          statusEnum: { in: ['ACTIVE', 'FORMING'] },
          exactDays: { has: dayName },
          lessonStartTime: { not: null },
          lessonEndTime: { not: null },
        },
        select: {
          id: true,
          name: true,
          lessonStartTime: true,
          lessonEndTime: true,
          roomId: true,
          room: { select: { id: true, name: true } },
          course: { select: { name: true } },
          teachers: {
            select: {
              teacher: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
          enrollments: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          },
        },
        orderBy: { lessonStartTime: 'asc' },
      }),
    ]);

    // Fetch today's attendance counts per group
    const groupIds = groups.map((g) => g.id);
    const attendanceCounts = groupIds.length
      ? await this.prisma.attendance.groupBy({
          by: ['groupId'],
          where: {
            groupId: { in: groupIds },
            date: dateOnly,
            status: 'PRESENT',
          },
          _count: { id: true },
        })
      : [];

    const attendanceMap = new Map(
      attendanceCounts.map((a) => [a.groupId, a._count.id]),
    );

    const lessons = groups.map((g) => ({
      groupId: g.id,
      groupName: g.name,
      courseName: g.course?.name ?? null,
      startTime: g.lessonStartTime!,
      endTime: g.lessonEndTime!,
      roomId: g.roomId,
      roomName: g.room?.name ?? null,
      teachers: g.teachers.map((gt) => ({
        id: gt.teacher.id,
        firstName: gt.teacher.firstName,
        lastName: gt.teacher.lastName,
      })),
      studentCount: g.enrollments.length,
      presentCount: attendanceMap.get(g.id) ?? 0,
    }));

    return {
      lessons,
      rooms,
      workingHours: {
        start: branch?.startOfWorkingDay ?? '08:00',
        end: branch?.endOfWorkingDay ?? '20:00',
      },
      isHoliday: !!holiday,
      holidayName: holiday?.name ?? null,
      date: targetDate.toISOString().split('T')[0],
    };
  }
}
