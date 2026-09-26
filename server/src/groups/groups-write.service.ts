import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerInBranch } from '../common/auth/branch-scope';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';

/**
 * Group CRUD is `@Roles('CEO', 'Branch Director', 'Administrator')` — a Teacher
 * cannot reach it at all, so the "pure teacher → check by assignment" half of
 * `assertCallerMayTouchGroup` is unreachable here. An empty roles list takes
 * the BRANCH path, which is the answer for every caller who can actually get
 * this far; naming the constant says that on purpose rather than leaving a
 * bare `[]` for the next reader to wonder about.
 */
const NO_TEACHER_PATH: string[] = [];
import { EntityHistoryService } from '../common/entity-history';
import { StatusCascadeService } from '../common/status';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupStatus, Prisma } from '@prisma/client';
import {
  TEACHER_ROLE_ID,
  groupInclude,
  formatGroup,
  INT_TO_GROUP_STATUS,
} from './shared/group-include';
import { GroupHolidayCascadeService } from './group-holiday-cascade.service';
import { computeNextGroupNumber } from './shared/next-group-number';
import { utcMidnightFromDateStr } from '../common/date/tashkent';

@Injectable()
export class GroupsWriteService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private eventEmitter: EventEmitter2,
    private groupHolidayCascadeService: GroupHolidayCascadeService,
    private statusCascadeService: StatusCascadeService,
  ) {}

  async create(dto: CreateGroupDto, companyId: number, userId?: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, companyId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Filial #${dto.branchId} topilmadi`);
    }
    // "The branch exists" and "you may create in it" are different questions.
    // A group's branch is fixed at creation and everything downstream — its
    // students, lesson deductions and salary accruals — is booked there, so
    // this is the only moment it can be got right.
    await assertCallerInBranch(
      this.prisma,
      userId,
      dto.branchId,
      "Bu filialda guruh yaratish huquqingiz yo'q",
    );

    const course = await this.assertCourseInGroupBranch(
      dto.courseId,
      companyId,
      dto.branchId,
    );

    if (dto.roomId) {
      await this.assertRoomInGroupBranch(dto.roomId, companyId, dto.branchId);
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
      await this.assertTeachersHaveRate(dto.teacherIds);
    }

    let endDate: Date | undefined;
    if (dto.startDate && course.courseDuration) {
      const start = utcMidnightFromDateStr(dto.startDate);
      endDate = new Date(start);
      endDate.setUTCMonth(endDate.getUTCMonth() + course.courseDuration);
    }

    const teacherData = dto.teacherIds?.length
      ? { create: dto.teacherIds.map((teacherId) => ({ teacherId })) }
      : undefined;

    // Derive the starting number from existing `#NNN` names (active + archived)
    // so the generated name can't collide with one still held by the unique
    // index. See computeNextGroupNumber for why the groupNumber column alone is
    // unreliable. On a P2002 collision (only a concurrent insert should reach
    // here now) we increment and retry instead of recomputing the same number.
    let groupNumber = await computeNextGroupNumber(this.prisma, dto.branchId);
    for (let attempt = 0; attempt < 25; attempt++, groupNumber++) {
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
            startDate: dto.startDate
              ? utcMidnightFromDateStr(dto.startDate)
              : undefined,
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

        // Apply any currently-active holiday ranges to the new group's
        // endDate so a group born into a holiday-laden window doesn't
        // silently lose lessons. Best-effort: failures log and don't
        // block group creation.
        if (group.startDate && group.endDate && userId) {
          try {
            await this.groupHolidayCascadeService.applyHolidayImpactOnNewGroup(
              group.id,
              userId,
            );
          } catch (err) {
            // Swallow — group is created; admin can re-trigger or fix
            // endDate manually if needed.
            void err;
          }
        }

        const refreshed = await this.prisma.group.findUnique({
          where: { id: group.id },
          include: groupInclude,
        });
        return formatGroup(refreshed ?? group);
      } catch (error: any) {
        if (error.code === 'P2002') {
          // A user-supplied name is fixed — incrementing won't help, so report
          // the real conflict instead of the cryptic generation error.
          if (dto.name) {
            throw new ConflictException(
              `"${dto.name}" nomli guruh bu filialda allaqachon mavjud`,
            );
          }
          // Auto-name collided (concurrent insert) — for-loop bumps the number.
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException(
      "Guruh nomini generatsiya qilib bo'lmadi, qayta urinib ko'ring",
    );
  }

  /**
   * A teacher must have a salary rate BEFORE they are put in front of a class.
   *
   * `createAccrual` silently returns null when no rate version covers the
   * lesson date, and a rate cannot be back-dated into a closed payroll period —
   * so lessons taught without a rate earn the teacher nothing, permanently.
   * That is exactly how ~20 mln so'm went missing in May 2026. Blocking the
   * assignment is the last point where this is still fixable.
   */
  private async assertTeachersHaveRate(teacherIds: number[]): Promise<void> {
    if (!teacherIds.length) return;
    const withRate = await this.prisma.employeeSalaryConfig.findMany({
      where: { userId: { in: teacherIds }, isActive: true },
      select: { userId: true },
      distinct: ['userId'],
    });
    const haveRate = new Set(withRate.map((c) => c.userId));
    const missing = teacherIds.filter((id) => !haveRate.has(id));
    if (!missing.length) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: missing } },
      select: { firstName: true, lastName: true },
    });
    const names = users
      .map((u) => `${u.firstName} ${u.lastName}`.trim())
      .join(', ');
    throw new BadRequestException(
      `Bu ustoz(lar)ga ish haqi stavkasi belgilanmagan: ${names}. ` +
        `Avval stavkani belgilang — aks holda ularning darslari uchun oylik ` +
        `yozilmaydi va buni keyin orqaga tuzatib bo'lmaydi.`,
    );
  }

  /**
   * A group's course must belong to the group's own branch.
   *
   * The course carries the price every student in the group pays
   * (`per-lesson-price.ts`), and it is repriced or archived by whoever holds
   * the COURSE's branch — archiving cancels every group on it
   * (`StatusCascadeService`). A Namangan group on a Farg'ona course would be
   * priced, and could be closed, from Farg'ona. This holds for a CEO too: it
   * is a rule about the group, not about the caller.
   *
   * A course with no branch fails closed. `Course.branchId` is nullable, but
   * `POST /courses` always sets it and no route clears it, so a branchless
   * course is stray data that belongs to no group's branch.
   *
   * Another company's course reads as not found (404) rather than as another
   * branch's (400): confirming that the id exists is already a leak.
   */
  private async assertCourseInGroupBranch(
    courseId: string,
    companyId: number,
    branchId: number,
  ) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, companyId, deletedAt: null },
    });
    if (!course) {
      throw new NotFoundException(`Kurs #${courseId} topilmadi`);
    }
    if (course.branchId !== branchId) {
      throw new BadRequestException(
        'Tanlangan kurs guruh filialiga tegishli emas — guruh filialidagi kursni tanlang',
      );
    }
    return course;
  }

  /**
   * A group's room must belong to the group's own branch — otherwise the group
   * shows up in the other branch's occupancy and utilisation reports. Same
   * 404-for-another-company rule as the course.
   */
  private async assertRoomInGroupBranch(
    roomId: string,
    companyId: number,
    branchId: number,
  ): Promise<void> {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, companyId, deletedAt: null },
      select: { branchId: true },
    });
    if (!room) {
      throw new NotFoundException(`Xona #${roomId} topilmadi`);
    }
    if (room.branchId !== branchId) {
      throw new BadRequestException(
        'Tanlangan xona guruh filialiga tegishli emas — guruh filialidagi xonani tanlang',
      );
    }
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
    // Renaming, re-rooming or re-teachering another branch's group changes
    // that branch's timetable and, through `assertTeachersHaveRate`, who gets
    // paid for it.
    await assertCallerMayTouchGroup(
      this.prisma,
      userId as number,
      NO_TEACHER_PATH,
      id,
    );

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

      // A teacher belongs to exactly one branch, and every lesson's pay is
      // booked to the branch of the group it was held in. Assigning a teacher
      // to another branch's group would therefore charge one branch's payroll
      // to the other. Only an explicit mismatch is blocked — a teacher with no
      // branch attached yet is left to the onboarding rules.
      const foreign = await this.prisma.user.findMany({
        where: {
          id: { in: dto.teacherIds },
          branches: { some: {}, none: { branchId: existing.branchId } },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      if (foreign.length) {
        const names = foreign
          .map((t) => `${t.firstName} ${t.lastName}`.trim())
          .join(', ');
        throw new BadRequestException(
          `Bu ustoz(lar) boshqa filialga tegishli: ${names}. ` +
            `Guruh filiali bilan mos ustoz tanlang.`,
        );
      }

      await this.assertTeachersHaveRate(dto.teacherIds);
    }

    // A changed course or room must belong to the group's own branch — the
    // group's, never `dto.branchId`, which is discarded below. An unchanged
    // one is not re-checked: the edit form sends both back on every save, and
    // deleting a room does not detach its groups, so re-checking would lock a
    // group whose room was deleted out of every edit.
    //
    // endDate is intentionally NOT recomputed on edit: groups now run
    // open-ended (endDate is stamped only when the group is manually set
    // COMPLETED), so an edit must leave the existing endDate untouched instead
    // of re-deriving startDate + duration.
    if (dto.courseId && dto.courseId !== existing.courseId) {
      await this.assertCourseInGroupBranch(
        dto.courseId,
        companyId,
        existing.branchId,
      );
    }
    if (dto.roomId && dto.roomId !== existing.roomId) {
      await this.assertRoomInGroupBranch(
        dto.roomId,
        companyId,
        existing.branchId,
      );
    }

    // `branchId` is deliberately discarded: the group's branch is fixed at
    // creation. The client used to send the header switcher's branch on EVERY
    // save, which silently moved a group (and its future lesson deductions and
    // salary accruals) into whichever branch the admin happened to be viewing.
    const {
      teacherIds,
      changeReasonId,
      branchId: _ignored,
      ...updateData
    } = dto;

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
          startDate: dto.startDate
            ? utcMidnightFromDateStr(dto.startDate)
            : undefined,
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

  /**
   * Deleting a group archives it and closes every live enrolment in it
   * (ACTIVE and FROZEN → DROPPED, unused money back to the balance) in ONE
   * transaction. Archiving the group alone used to leave its students
   * enrolled in a group that no longer existed.
   */
  async delete(id: string, userId: number, companyId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null, companyId },
    });
    if (!group) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }
    // Deleting a group closes every live enrolment in it and returns their
    // unused money to the balance — done to another branch's group, that is
    // their students and their ledger.
    await assertCallerMayTouchGroup(this.prisma, userId, NO_TEACHER_PATH, id);

    // One instant for the group's deletion and its students' departure, so
    // the enrolment state log closes exactly at `group.deletedAt`.
    const deletedAt = new Date();
    await this.prisma.$transaction(
      async (tx) => {
        await this.statusCascadeService.cascadeGroupDeletion(tx, {
          groupId: id,
          userId,
          at: deletedAt,
        });

        // Archive bypasses normal status transition validation
        await tx.statusHistory.create({
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
          tx,
        });

        await tx.group.update({
          where: { id },
          data: {
            statusEnum: GroupStatus.ARCHIVED,
            isActive: false,
            deletedAt,
            deletedById: userId,
            statusChangedAt: deletedAt,
            statusChangedById: userId,
            statusChangeReason: "O'chirildi",
          },
        });
      },
      {
        // Same budget as saving a full roster's attendance: per student a
        // balance lock, a refund and history rows, serially, on Neon.
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15_000,
        timeout: 60_000,
      },
    );

    return { message: "Guruh muvaffaqiyatli o'chirildi" };
  }
}
