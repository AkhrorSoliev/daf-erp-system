import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TEACHER_ROLE_ID = 4;

// Statuslar qaysiki guruh hali "jonli" — xona va o'qituvchi vaqtini band qiladi.
// COMPLETED / CANCELLED / ARCHIVED — jadvalda band qilmaydi.
const OCCUPYING_STATUSES = ['ACTIVE', 'FORMING'] as const;

@Injectable()
export class GroupScheduleService {
  constructor(private prisma: PrismaService) {}

  async getScheduleConflicts(params: {
    branchId: number;
    exactDays: string[];
    startTime: string;
    endTime: string;
    roomId?: string;
    teacherId?: number;
    excludeGroupId?: string;
  }) {
    const {
      branchId,
      exactDays,
      startTime,
      endTime,
      roomId,
      teacherId,
      excludeGroupId,
    } = params;
    if (!startTime || !endTime || !exactDays.length)
      return { room: [], teacher: [], availableRooms: [] };

    const baseWhere: any = {
      branchId,
      deletedAt: null,
      statusEnum: { in: [...OCCUPYING_STATUSES] },
      lessonStartTime: { not: null as any },
      lessonEndTime: { not: null as any },
    };

    if (excludeGroupId) {
      baseWhere.id = { not: excludeGroupId };
    }

    const select = {
      id: true,
      name: true,
      exactDays: true,
      lessonStartTime: true,
      lessonEndTime: true,
    };

    const isOverlapping = (g: {
      exactDays: string[];
      lessonStartTime: string | null;
      lessonEndTime: string | null;
    }) => {
      const sharedDays = exactDays.some((d) => g.exactDays.includes(d));
      if (!sharedDays) return false;
      return startTime < g.lessonEndTime! && endTime > g.lessonStartTime!;
    };

    const [roomGroups, teacherGroups] = await Promise.all([
      roomId
        ? this.prisma.group.findMany({
            where: { ...baseWhere, roomId },
            select,
          })
        : Promise.resolve([]),
      teacherId
        ? this.prisma.group.findMany({
            where: { ...baseWhere, teachers: { some: { teacherId } } },
            select,
          })
        : Promise.resolve([]),
    ]);

    const roomConflicts = roomGroups.filter(isOverlapping);

    const allRooms = await this.prisma.room.findMany({
      where: { branchId, deletedAt: null },
      select: { id: true, name: true, capacity: true },
      orderBy: { name: 'asc' },
    });

    const allRoomGroups = await this.prisma.group.findMany({
      where: { ...baseWhere, roomId: { not: null } },
      select: {
        roomId: true,
        exactDays: true,
        lessonStartTime: true,
        lessonEndTime: true,
      },
    });
    const busyRoomIds = new Set(
      allRoomGroups.filter(isOverlapping).map((g) => g.roomId),
    );

    const availableRooms = allRooms.filter((r) => !busyRoomIds.has(r.id));

    return {
      room: roomConflicts,
      teacher: teacherGroups.filter(isOverlapping),
      availableRooms,
    };
  }

  async getAvailableSlots(params: {
    branchId: number;
    roomId: string;
    exactDays: string[];
    excludeGroupId?: string;
  }) {
    const { branchId, roomId, exactDays, excludeGroupId } = params;
    if (!roomId || !exactDays.length) return { busySlots: [], freeSlots: [] };

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { startOfWorkingDay: true, endOfWorkingDay: true },
    });
    const dayStart = branch?.startOfWorkingDay ?? '08:00';
    const dayEnd = branch?.endOfWorkingDay ?? '20:00';

    const where: any = {
      branchId,
      roomId,
      deletedAt: null,
      statusEnum: { in: [...OCCUPYING_STATUSES] },
      lessonStartTime: { not: null },
      lessonEndTime: { not: null },
    };
    if (excludeGroupId) {
      where.id = { not: excludeGroupId };
    }

    const groups = await this.prisma.group.findMany({
      where,
      select: {
        name: true,
        exactDays: true,
        lessonStartTime: true,
        lessonEndTime: true,
      },
    });

    const busySlots = groups
      .filter((g) => exactDays.some((d) => g.exactDays.includes(d)))
      .map((g) => ({
        start: g.lessonStartTime!,
        end: g.lessonEndTime!,
        groupName: g.name,
      }))
      .sort((a, b) => a.start.localeCompare(b.start));

    const freeSlots: { start: string; end: string }[] = [];
    let cursor = dayStart;
    for (const slot of busySlots) {
      if (cursor < slot.start) {
        freeSlots.push({ start: cursor, end: slot.start });
      }
      if (slot.end > cursor) {
        cursor = slot.end;
      }
    }
    if (cursor < dayEnd) {
      freeSlots.push({ start: cursor, end: dayEnd });
    }

    return { busySlots, freeSlots };
  }

  async getAvailableRooms(params: {
    branchId: number;
    exactDays: string[];
    startTime: string;
    endTime: string;
    excludeGroupId?: string;
  }) {
    const { branchId, exactDays, startTime, endTime, excludeGroupId } = params;

    const allRooms = await this.prisma.room.findMany({
      where: { branchId, deletedAt: null },
      select: { id: true, name: true, capacity: true },
      orderBy: { name: 'asc' },
    });

    if (!exactDays.length || !startTime || !endTime) {
      return allRooms.map((r) => ({ ...r, available: true, busyGroup: null }));
    }

    const where: any = {
      branchId,
      deletedAt: null,
      statusEnum: { in: [...OCCUPYING_STATUSES] },
      roomId: { not: null },
      lessonStartTime: { not: null },
      lessonEndTime: { not: null },
    };
    if (excludeGroupId) where.id = { not: excludeGroupId };

    const groups = await this.prisma.group.findMany({
      where,
      select: {
        roomId: true,
        name: true,
        exactDays: true,
        lessonStartTime: true,
        lessonEndTime: true,
      },
    });

    const busyRoomMap = new Map<string, string>();
    for (const g of groups) {
      if (!g.roomId) continue;
      const sharedDays = exactDays.some((d) => g.exactDays.includes(d));
      if (!sharedDays) continue;
      if (startTime < g.lessonEndTime! && endTime > g.lessonStartTime!) {
        busyRoomMap.set(g.roomId, g.name);
      }
    }

    return allRooms.map((r) => ({
      ...r,
      available: !busyRoomMap.has(r.id),
      busyGroup: busyRoomMap.get(r.id) ?? null,
    }));
  }

  async getAvailableTeachers(params: {
    branchId: number;
    exactDays: string[];
    startTime: string;
    endTime: string;
    excludeGroupId?: string;
  }) {
    const { branchId, exactDays, startTime, endTime, excludeGroupId } = params;

    const allTeachers = await this.prisma.user.findMany({
      where: {
        roles: { some: { roleId: TEACHER_ROLE_ID } },
        branches: { some: { branchId } },
        deletedAt: null,
      },
      select: { id: true, firstName: true, lastName: true, photo: true },
      orderBy: { firstName: 'asc' },
    });

    if (!exactDays.length || !startTime || !endTime) {
      return allTeachers.map((t) => ({
        ...t,
        available: true,
        busyGroup: null,
      }));
    }

    const where: any = {
      branchId,
      deletedAt: null,
      statusEnum: { in: [...OCCUPYING_STATUSES] },
      lessonStartTime: { not: null },
      lessonEndTime: { not: null },
    };
    if (excludeGroupId) where.id = { not: excludeGroupId };

    const groups = await this.prisma.group.findMany({
      where,
      select: {
        name: true,
        exactDays: true,
        lessonStartTime: true,
        lessonEndTime: true,
        teachers: { select: { teacherId: true } },
      },
    });

    const busyTeacherMap = new Map<number, string>();
    for (const g of groups) {
      const sharedDays = exactDays.some((d) => g.exactDays.includes(d));
      if (!sharedDays) continue;
      if (startTime < g.lessonEndTime! && endTime > g.lessonStartTime!) {
        for (const gt of g.teachers) {
          busyTeacherMap.set(gt.teacherId, g.name);
        }
      }
    }

    return allTeachers.map((t) => ({
      ...t,
      available: !busyTeacherMap.has(t.id),
      busyGroup: busyTeacherMap.get(t.id) ?? null,
    }));
  }
}
