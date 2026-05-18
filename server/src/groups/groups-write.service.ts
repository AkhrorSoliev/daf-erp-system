import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupStatus } from '@prisma/client';
import {
  TEACHER_ROLE_ID,
  groupInclude,
  formatGroup,
  INT_TO_GROUP_STATUS,
} from './shared/group-include';

@Injectable()
export class GroupsWriteService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private eventEmitter: EventEmitter2,
  ) {}

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

    const teacherData = dto.teacherIds?.length
      ? { create: dto.teacherIds.map((teacherId) => ({ teacherId })) }
      : undefined;

    // Retry loop to handle race conditions on unique name
    for (let attempt = 0; attempt < 5; attempt++) {
      const nameWhere = {
        branchId: dto.branchId,
        name: { startsWith: '#' },
        deletedAt: null,
        companyId,
      };
      const maxGroupNumber = await this.prisma.group.aggregate({
        where: nameWhere,
        _max: { groupNumber: true },
      });
      const groupNumber = (maxGroupNumber._max?.groupNumber ?? 0) + 1;
      const autoName = dto.name || `#${String(groupNumber).padStart(3, '0')}`;

      try {
        const group = await this.prisma.group.create({
          data: {
            name: autoName,
            level: dto.level,
            courseId: dto.courseId,
            branchId: dto.branchId,
            roomId: dto.roomId,
            companyId: companyId,
            groupNumber,
            days: dto.days,
            exactDays: dto.exactDays ?? [],
            lessonStartTime: dto.lessonStartTime,
            lessonEndTime: dto.lessonEndTime,
            lessonMinutes: dto.lessonMinutes,
            status: dto.status ?? 2,
            statusEnum:
              INT_TO_GROUP_STATUS[dto.status ?? 2] ?? GroupStatus.FORMING,
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
          newValues: {
            nomi: group.name,
            kunlar: (group.exactDays ?? []).join(', '),
            vaqt:
              group.lessonStartTime && group.lessonEndTime
                ? `${group.lessonStartTime}–${group.lessonEndTime}`
                : null,
            boshlanish: group.startDate,
          },
          changedById: userId,
          companyId,
        });

        // Activity report — initial schedule snapshot
        await this.prisma.groupScheduleSnapshot.create({
          data: {
            groupId: group.id,
            exactDays: group.exactDays,
            lessonStartTime: group.lessonStartTime,
            lessonEndTime: group.lessonEndTime,
            courseId: group.courseId,
            validFrom: group.createdAt,
            changedById: userId,
          },
        });

        // Notify approved Telegram admin groups (best-effort)
        this.eventEmitter.emit('group.created', {
          groupId: group.id,
          name: group.name,
          branchId: group.branchId,
          branchName: branch.name,
          startDate: group.startDate,
          companyId,
        });

        return formatGroup(group);
      } catch (error: any) {
        // Unique constraint violation — retry with next number
        if (error.code === 'P2002') continue;
        throw error;
      }
    }

    throw new NotFoundException(
      "Guruh nomini generatsiya qilib bo'lmadi, qayta urinib ko'ring",
    );
  }

  async update(
    id: string,
    dto: UpdateGroupDto,
    userId: number | undefined,
    companyId: number,
  ) {
    const existing = await this.prisma.group.findFirst({
      where: { id, deletedAt: null, companyId },
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

    const { teacherIds, changeReasonId, ...updateData } = dto;

    // Validate changeReasonId if provided — must belong to the same company.
    if (changeReasonId) {
      const reason = await this.prisma.groupTeacherChangeReason.findFirst({
        where: {
          id: changeReasonId,
          companyId: existing.companyId ?? undefined,
          deletedAt: null,
        },
      });
      if (!reason) {
        throw new NotFoundException('Tanlangan sabab topilmadi');
      }
    }

    // Eski ustozlar ro'yxatini olish (teacher tracking uchun)
    let oldTeacherIds: number[] = [];
    let oldTeacherNames: string | null = null;
    let triggeredByDismissal = false;
    if (teacherIds) {
      const oldTeachers = await this.prisma.groupTeacher.findMany({
        where: { groupId: id },
        include: {
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              status: true,
              isActive: true,
              deletedAt: true,
            },
          },
        },
      });
      oldTeacherIds = oldTeachers.map((t) => t.teacher.id);
      oldTeacherNames = oldTeachers
        .map((t) => `${t.teacher.firstName} ${t.teacher.lastName}`)
        .sort()
        .join(', ');

      // Removed ustozlardan birortasi inactive/terminated/archived/deleted bo'lsa,
      // bu o'zgarish "ishdan ketish" sababli ekanligini bildiradi
      triggeredByDismissal = oldTeachers.some((t) => {
        const notInNew = !teacherIds.includes(t.teacher.id);
        const isDismissed =
          t.teacher.deletedAt !== null ||
          !t.teacher.isActive ||
          t.teacher.status !== 'ACTIVE';
        return notInNew && isDismissed;
      });
    }

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

    // Activity report — schedule snapshot if any schedule field changed
    const arrayEq = (a: string[], b: string[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    const scheduleChanged =
      (dto.exactDays !== undefined &&
        !arrayEq(dto.exactDays, existing.exactDays)) ||
      (dto.lessonStartTime !== undefined &&
        dto.lessonStartTime !== existing.lessonStartTime) ||
      (dto.lessonEndTime !== undefined &&
        dto.lessonEndTime !== existing.lessonEndTime) ||
      (dto.courseId !== undefined && dto.courseId !== existing.courseId);

    if (scheduleChanged) {
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.groupScheduleSnapshot.updateMany({
          where: { groupId: id, validTo: null },
          data: { validTo: now },
        }),
        this.prisma.groupScheduleSnapshot.create({
          data: {
            groupId: id,
            exactDays: group.exactDays,
            lessonStartTime: group.lessonStartTime,
            lessonEndTime: group.lessonEndTime,
            courseId: group.courseId,
            validFrom: now,
            changedById: userId,
          },
        }),
      ]);
    }

    // Ustoz o'zgarishini alohida track qilish
    if (teacherIds && oldTeacherNames !== null) {
      const newTeacherNames = group.teachers
        .map((t: any) => `${t.teacher.firstName} ${t.teacher.lastName}`)
        .sort()
        .join(', ');

      if (oldTeacherNames !== newTeacherNames) {
        await this.entityHistoryService.recordUpdate({
          entityType: 'Group',
          entityId: id,
          oldValues: { ustozlar: oldTeacherNames || '—' },
          newValues: { ustozlar: newTeacherNames || '—' },
          changedById: userId,
          companyId: existing.companyId ?? undefined,
        });

        const newTeacherIds = teacherIds;
        const added = newTeacherIds.filter(
          (tid) => !oldTeacherIds.includes(tid),
        );
        const removed = oldTeacherIds.filter(
          (tid) => !newTeacherIds.includes(tid),
        );

        let changeType: 'ADDED' | 'REMOVED' | 'REPLACED';
        if (added.length > 0 && removed.length === 0) {
          changeType = 'ADDED';
        } else if (removed.length > 0 && added.length === 0) {
          changeType = 'REMOVED';
        } else {
          changeType = 'REPLACED';
        }

        await this.prisma.groupTeacherHistory.create({
          data: {
            groupId: id,
            previousTeacherIds: oldTeacherIds,
            newTeacherIds,
            changeType,
            triggeredByDismissal,
            changedById: userId ?? null,
            changeReasonId: changeReasonId ?? null,
          },
        });
      }
    }

    return formatGroup(group);
  }

  async delete(id: string, userId: number, companyId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null, companyId },
    });
    if (!group) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    // Archive bypasses normal status transition validation
    await this.prisma.statusHistory.create({
      data: {
        entityType: 'Group',
        entityId: id,
        fromStatus: group.statusEnum,
        toStatus: GroupStatus.ARCHIVED,
        reason: "O'chirildi",
        changedById: userId,
        companyId: group.companyId ?? undefined,
      },
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
