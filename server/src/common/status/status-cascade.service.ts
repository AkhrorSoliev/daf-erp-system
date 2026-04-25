import { Injectable } from '@nestjs/common';
import {
  GroupStatus,
  EnrollmentStatus,
  RoomStatus,
  BranchStatus,
  CourseStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../entity-history';

interface CascadeResult {
  entity: string;
  count: number;
  toStatus: string;
}

@Injectable()
export class StatusCascadeService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * Cascade enrollment o'zgarishlarini guruh tarixiga yozadi.
   * updateMany dan OLDIN chaqirilishi kerak (chunki updateMany individual record qaytarmaydi).
   */
  private async recordGroupHistoryForStudentCascade(
    studentId: number,
    enrollmentFilter: Prisma.EnrollmentWhereInput,
    action: string,
    userId: number,
    type: 'add' | 'remove' = 'remove',
  ): Promise<void> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: enrollmentFilter,
      select: {
        groupId: true,
        group: { select: { companyId: true } },
        student: { select: { firstName: true, lastName: true } },
      },
    });

    const values = (e: (typeof enrollments)[0]) => ({
      action,
      oquvchi: `${e.student.firstName} ${e.student.lastName}`,
      oquvchiId: studentId,
    });

    for (const enrollment of enrollments) {
      const common = {
        entityType: 'Group' as const,
        entityId: enrollment.groupId,
        changedById: userId,
        companyId: (enrollment.group as any)?.companyId ?? undefined,
      };

      if (type === 'add') {
        await this.entityHistoryService.recordCreate({
          ...common,
          newValues: values(enrollment),
        });
      } else {
        await this.entityHistoryService.recordDelete({
          ...common,
          oldValues: values(enrollment),
        });
      }
    }
  }

  /**
   * Per-Group statusChange tarixini yozadi (Branch/Course cascade'larida).
   * updateMany dan OLDIN chaqirilishi kerak — eski statuslar yo'qolmasligi uchun.
   */
  private async recordGroupBatchStatusChange(
    filter: Prisma.GroupWhereInput,
    toStatus: string,
    reason: string,
    userId: number,
  ): Promise<void> {
    const groups = await this.prisma.group.findMany({
      where: filter,
      select: { id: true, statusEnum: true, companyId: true },
    });
    for (const group of groups) {
      await this.entityHistoryService.recordStatusChange({
        entityType: 'Group',
        entityId: group.id,
        oldValues: { statusEnum: group.statusEnum, reason },
        newValues: { statusEnum: toStatus, reason },
        changedById: userId,
        companyId: group.companyId ?? undefined,
      });
    }
  }

  /**
   * Per-Room statusChange tarixini yozadi (Branch cascade'larida).
   * updateMany dan OLDIN chaqirilishi kerak.
   */
  private async recordRoomBatchStatusChange(
    filter: Prisma.RoomWhereInput,
    toStatus: string,
    reason: string,
    userId: number,
  ): Promise<void> {
    const rooms = await this.prisma.room.findMany({
      where: filter,
      select: { id: true, status: true, companyId: true },
    });
    for (const room of rooms) {
      await this.entityHistoryService.recordStatusChange({
        entityType: 'Room',
        entityId: room.id,
        oldValues: { status: room.status, reason },
        newValues: { status: toStatus, reason },
        changedById: userId,
        companyId: room.companyId ?? undefined,
      });
    }
  }

  async cascade(
    entityType: string,
    entityId: string,
    newStatus: string,
    userId: number,
  ): Promise<CascadeResult[]> {
    const results: CascadeResult[] = [];
    const now = new Date();
    const reason = `Cascade: ${entityType} #${entityId} → ${newStatus}`;

    const auditFields = {
      statusChangedAt: now,
      statusChangedById: userId,
      statusChangeReason: reason,
    };

    if (entityType === 'Branch') {
      const branchId = Number(entityId);

      if (
        newStatus === BranchStatus.CLOSED ||
        newStatus === BranchStatus.ARCHIVED
      ) {
        // Guruhlar → CANCELLED
        const groupFilter = {
          branchId,
          deletedAt: null,
          statusEnum: { not: GroupStatus.ARCHIVED },
        };
        await this.recordGroupBatchStatusChange(
          groupFilter,
          GroupStatus.CANCELLED,
          reason,
          userId,
        );
        const groupResult = await this.prisma.group.updateMany({
          where: groupFilter,
          data: {
            statusEnum: GroupStatus.CANCELLED,
            isActive: false,
            ...auditFields,
          },
        });
        results.push({
          entity: 'Group',
          count: groupResult.count,
          toStatus: 'CANCELLED',
        });

        // Enrollmentlar → DROPPED
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: {
            group: { branchId },
            deletedAt: null,
            status: EnrollmentStatus.ACTIVE,
          },
          data: { status: EnrollmentStatus.DROPPED, ...auditFields },
        });
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'DROPPED',
        });

        // Xonalar → ARCHIVED
        const roomFilter = {
          branchId,
          deletedAt: null,
          status: { not: RoomStatus.ARCHIVED },
        };
        await this.recordRoomBatchStatusChange(
          roomFilter,
          RoomStatus.ARCHIVED,
          reason,
          userId,
        );
        const roomResult = await this.prisma.room.updateMany({
          where: roomFilter,
          data: { status: RoomStatus.ARCHIVED, ...auditFields },
        });
        results.push({
          entity: 'Room',
          count: roomResult.count,
          toStatus: 'ARCHIVED',
        });
      } else if (newStatus === BranchStatus.INACTIVE) {
        // Guruhlar → PAUSED
        const groupFilter = {
          branchId,
          deletedAt: null,
          statusEnum: GroupStatus.ACTIVE,
        };
        await this.recordGroupBatchStatusChange(
          groupFilter,
          GroupStatus.PAUSED,
          reason,
          userId,
        );
        const groupResult = await this.prisma.group.updateMany({
          where: groupFilter,
          data: { statusEnum: GroupStatus.PAUSED, ...auditFields },
        });
        results.push({
          entity: 'Group',
          count: groupResult.count,
          toStatus: 'PAUSED',
        });
      }
    }

    if (entityType === 'Course') {
      if (newStatus === CourseStatus.ARCHIVED) {
        // Guruhlar → CANCELLED
        const groupFilter = {
          courseId: entityId,
          deletedAt: null,
          statusEnum: { not: GroupStatus.ARCHIVED },
        };
        await this.recordGroupBatchStatusChange(
          groupFilter,
          GroupStatus.CANCELLED,
          reason,
          userId,
        );
        const groupResult = await this.prisma.group.updateMany({
          where: groupFilter,
          data: {
            statusEnum: GroupStatus.CANCELLED,
            isActive: false,
            ...auditFields,
          },
        });
        results.push({
          entity: 'Group',
          count: groupResult.count,
          toStatus: 'CANCELLED',
        });

        // Enrollmentlar → DROPPED
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: {
            group: { courseId: entityId },
            deletedAt: null,
            status: EnrollmentStatus.ACTIVE,
          },
          data: { status: EnrollmentStatus.DROPPED, ...auditFields },
        });
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'DROPPED',
        });
      }
    }

    if (entityType === 'Group') {
      if (
        newStatus === GroupStatus.CANCELLED ||
        newStatus === GroupStatus.ARCHIVED
      ) {
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: {
            groupId: entityId,
            deletedAt: null,
            status: EnrollmentStatus.ACTIVE,
          },
          data: { status: EnrollmentStatus.DROPPED, ...auditFields },
        });
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'DROPPED',
        });
      } else if (newStatus === GroupStatus.COMPLETED) {
        // 1) ACTIVE enrollment → COMPLETED
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: {
            groupId: entityId,
            deletedAt: null,
            status: EnrollmentStatus.ACTIVE,
          },
          data: { status: EnrollmentStatus.COMPLETED, ...auditFields },
        });
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'COMPLETED',
        });

        // 2) Avtomatik graduation: boshqa faol enrollment-i yo'q o'quvchilarni GRADUATED qilish
        const completedEnrollments = await this.prisma.enrollment.findMany({
          where: {
            groupId: entityId,
            deletedAt: null,
            status: EnrollmentStatus.COMPLETED,
          },
          select: { studentId: true },
        });
        const studentIds = [
          ...new Set(completedEnrollments.map((e) => e.studentId)),
        ];

        for (const studentId of studentIds) {
          const activeEnrollmentCount = await this.prisma.enrollment.count({
            where: {
              studentId,
              deletedAt: null,
              status: EnrollmentStatus.ACTIVE,
            },
          });
          if (activeEnrollmentCount > 0) continue;

          const student = await this.prisma.student.findFirst({
            where: { id: studentId, deletedAt: null, status: 'ACTIVE' },
          });
          if (!student) continue;

          await this.prisma.statusHistory.create({
            data: {
              entityType: 'Student',
              entityId: String(studentId),
              fromStatus: 'ACTIVE',
              toStatus: 'GRADUATED',
              reason: 'Avtomatik: guruh tugallanganligi sababli',
              changedById: userId,
              companyId: student.companyId ?? undefined,
            },
          });

          await this.entityHistoryService.recordStatusChange({
            entityType: 'Student',
            entityId: studentId,
            oldValues: { status: 'ACTIVE' },
            newValues: {
              status: 'GRADUATED',
              reason: 'Avtomatik: guruh tugallanganligi sababli',
            },
            changedById: userId,
            companyId: student.companyId ?? undefined,
          });

          await this.prisma.student.update({
            where: { id: studentId },
            data: {
              status: 'GRADUATED',
              isActive: false,
              ...auditFields,
              statusChangeReason: 'Avtomatik: guruh tugallanganligi sababli',
            },
          });
          results.push({ entity: 'Student', count: 1, toStatus: 'GRADUATED' });
        }
      }
    }

    if (entityType === 'Student') {
      const studentId = Number(entityId);

      if (newStatus === 'FROZEN') {
        const filter = {
          studentId,
          deletedAt: null,
          status: EnrollmentStatus.ACTIVE,
        };
        await this.recordGroupHistoryForStudentCascade(
          studentId,
          filter,
          'OQUVCHI_MUZLATILDI',
          userId,
        );
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: filter,
          data: { status: EnrollmentStatus.FROZEN, ...auditFields },
        });
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'FROZEN',
        });
      }

      if (newStatus === 'ACTIVE') {
        const filter = {
          studentId,
          deletedAt: null,
          status: EnrollmentStatus.FROZEN,
          group: { deletedAt: null, statusEnum: GroupStatus.ACTIVE },
        };
        await this.recordGroupHistoryForStudentCascade(
          studentId,
          filter,
          'OQUVCHI_QAYTDI',
          userId,
          'add',
        );
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: filter,
          data: { status: EnrollmentStatus.ACTIVE, ...auditFields },
        });
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'ACTIVE',
        });
      }

      if (newStatus === 'ARCHIVED' || newStatus === 'EXPELLED') {
        const action =
          newStatus === 'EXPELLED'
            ? 'OQUVCHI_CHETLATILDI'
            : 'OQUVCHI_OCHIRILDI';
        const filter = {
          studentId,
          deletedAt: null,
          status: {
            in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.FROZEN],
          } as any,
        };
        await this.recordGroupHistoryForStudentCascade(
          studentId,
          filter,
          action,
          userId,
        );
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: filter,
          data: { status: EnrollmentStatus.DROPPED, ...auditFields },
        });
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'DROPPED',
        });
      }
    }

    return results.filter((r) => r.count > 0);
  }
}
