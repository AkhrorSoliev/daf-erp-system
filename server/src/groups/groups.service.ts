import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { GroupQueryDto } from './dto/group-query.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ChangeGroupStatusDto } from './dto/change-group-status.dto';
import { Prisma, GroupStatus } from '@prisma/client';

const TEACHER_ROLE_ID = 4;

const groupInclude = {
  course: {
    select: {
      id: true,
      name: true,
      description: true,
      lessonDuration: true,
      lessonMinutes: true,
      courseDuration: true,
      price: true,
      isActive: true,
    },
  },
  room: {
    select: { id: true, name: true, capacity: true },
  },
  branch: {
    select: { id: true, name: true },
  },
  teachers: {
    include: {
      teacher: {
        select: { id: true, name: true, phone: true, photo: true },
      },
    },
  },
  _count: {
    select: {
      enrollments: { where: { deletedAt: null } },
    },
  },
};

function formatGroup(group: any) {
  const { _count, teachers, ...rest } = group;
  return {
    ...rest,
    teachers: teachers.map((gt: any) => gt.teacher),
    studentCount: _count?.enrollments ?? 0,
  };
}

// Map integer status to GroupStatus enum
const INT_TO_GROUP_STATUS: Record<number, GroupStatus> = {
  1: GroupStatus.ACTIVE,
  2: GroupStatus.FORMING,
  3: GroupStatus.PAUSED,
  4: GroupStatus.CANCELLED,
};

const GROUP_STATUS_TO_INT: Record<string, number> = {
  ACTIVE: 1,
  FORMING: 2,
  PAUSED: 3,
  CANCELLED: 4,
  COMPLETED: 4,
  ARCHIVED: 4,
};

@Injectable()
export class GroupsService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async findAll(query: GroupQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.GroupWhereInput = {
      branchId: query.branch_id,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.group.findMany({
        where,
        include: groupInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.group.count({ where }),
    ]);

    return {
      data: data.map(formatGroup),
      total,
      page,
      pageSize,
    };
  }

  async getScheduleConflicts(params: {
    branchId: number;
    exactDays: string[];
    startTime: string;
    endTime: string;
    roomId?: string;
    teacherId?: number;
  }) {
    const { branchId, exactDays, startTime, endTime, roomId, teacherId } = params;
    if (!startTime || !endTime || !exactDays.length) return { room: [], teacher: [] };

    const baseWhere = {
      branchId,
      deletedAt: null,
      lessonStartTime: { not: null as any },
      lessonEndTime: { not: null as any },
    };

    const select = {
      id: true,
      name: true,
      exactDays: true,
      lessonStartTime: true,
      lessonEndTime: true,
    };

    const isOverlapping = (g: { exactDays: string[]; lessonStartTime: string | null; lessonEndTime: string | null }) => {
      const sharedDays = exactDays.some((d) => g.exactDays.includes(d));
      if (!sharedDays) return false;
      return startTime < g.lessonEndTime! && endTime > g.lessonStartTime!;
    };

    const [roomGroups, teacherGroups] = await Promise.all([
      roomId
        ? this.prisma.group.findMany({ where: { ...baseWhere, roomId }, select })
        : Promise.resolve([]),
      teacherId
        ? this.prisma.group.findMany({
            where: { ...baseWhere, teachers: { some: { teacherId } } },
            select,
          })
        : Promise.resolve([]),
    ]);

    return {
      room: roomGroups.filter(isOverlapping),
      teacher: teacherGroups.filter(isOverlapping),
    };
  }

  async getNextName(level: string, branchId: number) {
    const count = await this.prisma.group.count({
      where: { branchId, name: { startsWith: `${level}-` }, deletedAt: null },
    });
    const nextNumber = count + 1;
    return { nextName: `${level}-${String(nextNumber).padStart(3, '0')}` };
  }

  async findStudentsByGroupId(groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException(`Guruh #${groupId} topilmadi`);
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        deletedAt: null,
        student: { deletedAt: null },
      },
      select: {
        id: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photo: true,
            balance: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return enrollments.map((e) => ({
      enrollmentId: e.id,
      enrolledAt: e.createdAt,
      ...e.student,
    }));
  }

  async findOne(id: string) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null },
      include: groupInclude,
    });

    if (!group) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    return formatGroup(group);
  }

  async create(dto: CreateGroupDto, companyId: number, userId?: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Filial #${dto.branchId} topilmadi`);
    }

    const course = await this.prisma.course.findFirst({
      where: { id: dto.courseId, deletedAt: null },
    });
    if (!course) {
      throw new NotFoundException(`Kurs #${dto.courseId} topilmadi`);
    }

    if (dto.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: dto.roomId, branchId: dto.branchId, deletedAt: null },
      });
      if (!room) {
        throw new NotFoundException(`Xona #${dto.roomId} topilmadi`);
      }
    }

    if (dto.teacherIds?.length) {
      const teacherCount = await this.prisma.user.count({
        where: {
          id: { in: dto.teacherIds },
          roles: { some: { roleId: TEACHER_ROLE_ID } },
          deletedAt: null,
        },
      });
      if (teacherCount !== dto.teacherIds.length) {
        throw new NotFoundException(
          "Ba'zi o'qituvchilar topilmadi yoki o'qituvchi emas",
        );
      }
    }

    let endDate: Date | undefined;
    if (dto.startDate && course.courseDuration) {
      const start = new Date(dto.startDate);
      endDate = new Date(start);
      endDate.setMonth(endDate.getMonth() + course.courseDuration);
    }

    const prefix = dto.level || course.name;
    const teacherData = dto.teacherIds?.length
      ? { create: dto.teacherIds.map((teacherId) => ({ teacherId })) }
      : undefined;

    // Retry loop to handle race conditions on unique name
    for (let attempt = 0; attempt < 5; attempt++) {
      const nameWhere = { branchId: dto.branchId, name: { startsWith: `${prefix}-` }, deletedAt: null };
      const maxGroupNumber = await this.prisma.group.aggregate({
        where: nameWhere,
        _max: { groupNumber: true },
      });
      const groupNumber = (maxGroupNumber._max?.groupNumber ?? 0) + 1;
      const autoName = dto.name || `${prefix}-${String(groupNumber).padStart(3, '0')}`;

      try {
        const group = await this.prisma.group.create({
          data: {
            name: autoName,
            courseId: dto.courseId,
            branchId: dto.branchId,
            roomId: dto.roomId,
            companyId: companyId,
            groupNumber,
            days: dto.days,
            exactDays: dto.exactDays ?? [],
            lessonStartTime: dto.lessonStartTime,
            lessonEndTime: dto.lessonEndTime,
            status: dto.status ?? 2,
            statusEnum: INT_TO_GROUP_STATUS[dto.status ?? 2] ?? GroupStatus.FORMING,
            comment: dto.comment,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            endDate,
            teachers: teacherData,
          },
          include: groupInclude,
        });

        await this.entityHistoryService.recordCreate({
          entityType: 'Group',
          entityId: group.id,
          newValues: group,
          changedById: userId,
          companyId,
        });

        return formatGroup(group);
      } catch (error: any) {
        // Unique constraint violation — retry with next number
        if (error.code === 'P2002') continue;
        throw error;
      }
    }

    throw new NotFoundException('Guruh nomini generatsiya qilib bo\'lmadi, qayta urinib ko\'ring');
  }

  async update(id: string, dto: UpdateGroupDto, userId?: number) {
    const existing = await this.prisma.group.findFirst({
      where: { id, deletedAt: null },
      include: { course: { select: { courseDuration: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    if (dto.teacherIds) {
      const teacherCount = await this.prisma.user.count({
        where: {
          id: { in: dto.teacherIds },
          roles: { some: { roleId: TEACHER_ROLE_ID } },
          deletedAt: null,
        },
      });
      if (teacherCount !== dto.teacherIds.length) {
        throw new NotFoundException(
          "Ba'zi o'qituvchilar topilmadi yoki o'qituvchi emas",
        );
      }
    }

    let endDate: Date | undefined;
    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : existing.startDate;
    let courseDuration = existing.course.courseDuration;

    if (dto.courseId && dto.courseId !== existing.courseId) {
      const course = await this.prisma.course.findFirst({
        where: { id: dto.courseId, deletedAt: null },
      });
      if (!course) {
        throw new NotFoundException(`Kurs #${dto.courseId} topilmadi`);
      }
      courseDuration = course.courseDuration;
    }

    if (startDate && courseDuration) {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + courseDuration);
    }

    const { teacherIds, ...updateData } = dto;

    const group = await this.prisma.$transaction(async (tx) => {
      if (teacherIds) {
        await tx.groupTeacher.deleteMany({ where: { groupId: id } });
        await tx.groupTeacher.createMany({
          data: teacherIds.map((teacherId) => ({ groupId: id, teacherId })),
        });
      }

      return tx.group.update({
        where: { id },
        data: {
          ...updateData,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate,
          exactDays: dto.exactDays ?? undefined,
        },
        include: groupInclude,
      });
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Group',
      entityId: id,
      oldValues: existing,
      newValues: group,
      changedById: userId,
      companyId: existing.companyId ?? undefined,
    });

    return formatGroup(group);
  }

  async changeStatus(id: string, dto: ChangeGroupStatusDto, userId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null },
    });

    if (!group) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'Group',
      entityId: id,
      fromStatus: group.statusEnum,
      toStatus: dto.status,
      reason: dto.reason,
      changedById: userId,
      companyId: group.companyId ?? undefined,
    });

    const updated = await this.prisma.group.update({
      where: { id },
      data: {
        statusEnum: dto.status as GroupStatus,
        status: GROUP_STATUS_TO_INT[dto.status] ?? group.status,
        isActive: dto.status === GroupStatus.ACTIVE || dto.status === GroupStatus.FORMING,
        ...auditData,
      },
      include: groupInclude,
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Group',
      entityId: id,
      oldValues: { status: group.statusEnum },
      newValues: { status: dto.status, reason: dto.reason },
      changedById: userId,
      companyId: group.companyId ?? undefined,
    });

    // Cascade: COMPLETED/CANCELLED → enrollment larni yangilash
    await this.statusCascadeService.cascade('Group', id, dto.status, userId);

    return formatGroup(updated);
  }

  async getStatusHistory(id: string) {
    const group = await this.prisma.group.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    return this.statusHistoryService.getHistory('Group', id);
  }

  async delete(id: string, userId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null },
    });
    if (!group) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    await this.statusHistoryService.changeStatus({
      entityType: 'Group',
      entityId: id,
      fromStatus: group.statusEnum,
      toStatus: GroupStatus.ARCHIVED,
      reason: "O'chirildi",
      changedById: userId,
      companyId: group.companyId ?? undefined,
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'Group',
      entityId: id,
      oldValues: group,
      changedById: userId,
      companyId: group.companyId ?? undefined,
    });

    await this.prisma.group.update({
      where: { id },
      data: {
        statusEnum: GroupStatus.ARCHIVED,
        isActive: false,
        deletedAt: new Date(),
        deletedById: userId,
        statusChangedAt: new Date(),
        statusChangedById: userId,
        statusChangeReason: "O'chirildi",
      },
    });

    return { message: "Guruh muvaffaqiyatli o'chirildi" };
  }
}
