import { Injectable } from '@nestjs/common';
import {
  GroupStatus, EnrollmentStatus, RoomStatus, BranchStatus, CourseStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface CascadeResult {
  entity: string;
  count: number;
  toStatus: string;
}

@Injectable()
export class StatusCascadeService {
  constructor(private prisma: PrismaService) {}

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

      if (newStatus === BranchStatus.CLOSED || newStatus === BranchStatus.ARCHIVED) {
        // Guruhlar → CANCELLED
        const groupResult = await this.prisma.group.updateMany({
          where: { branchId, deletedAt: null, statusEnum: { not: GroupStatus.ARCHIVED } },
          data: { statusEnum: GroupStatus.CANCELLED, isActive: false, ...auditFields },
        });
        results.push({ entity: 'Group', count: groupResult.count, toStatus: 'CANCELLED' });

        // Enrollmentlar → DROPPED
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: { group: { branchId }, deletedAt: null, status: EnrollmentStatus.ACTIVE },
          data: { status: EnrollmentStatus.DROPPED, ...auditFields },
        });
        results.push({ entity: 'Enrollment', count: enrollResult.count, toStatus: 'DROPPED' });

        // Xonalar → ARCHIVED
        const roomResult = await this.prisma.room.updateMany({
          where: { branchId, deletedAt: null, status: { not: RoomStatus.ARCHIVED } },
          data: { status: RoomStatus.ARCHIVED, ...auditFields },
        });
        results.push({ entity: 'Room', count: roomResult.count, toStatus: 'ARCHIVED' });
      } else if (newStatus === BranchStatus.INACTIVE) {
        // Guruhlar → PAUSED
        const groupResult = await this.prisma.group.updateMany({
          where: { branchId, deletedAt: null, statusEnum: GroupStatus.ACTIVE },
          data: { statusEnum: GroupStatus.PAUSED, ...auditFields },
        });
        results.push({ entity: 'Group', count: groupResult.count, toStatus: 'PAUSED' });
      }
    }

    if (entityType === 'Course') {
      if (newStatus === CourseStatus.ARCHIVED) {
        // Guruhlar → CANCELLED
        const groupResult = await this.prisma.group.updateMany({
          where: { courseId: entityId, deletedAt: null, statusEnum: { not: GroupStatus.ARCHIVED } },
          data: { statusEnum: GroupStatus.CANCELLED, isActive: false, ...auditFields },
        });
        results.push({ entity: 'Group', count: groupResult.count, toStatus: 'CANCELLED' });

        // Enrollmentlar → DROPPED
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: { group: { courseId: entityId }, deletedAt: null, status: EnrollmentStatus.ACTIVE },
          data: { status: EnrollmentStatus.DROPPED, ...auditFields },
        });
        results.push({ entity: 'Enrollment', count: enrollResult.count, toStatus: 'DROPPED' });
      }
    }

    if (entityType === 'Group') {
      if (newStatus === GroupStatus.CANCELLED || newStatus === GroupStatus.ARCHIVED) {
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: { groupId: entityId, deletedAt: null, status: EnrollmentStatus.ACTIVE },
          data: { status: EnrollmentStatus.DROPPED, ...auditFields },
        });
        results.push({ entity: 'Enrollment', count: enrollResult.count, toStatus: 'DROPPED' });
      } else if (newStatus === GroupStatus.COMPLETED) {
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: { groupId: entityId, deletedAt: null, status: EnrollmentStatus.ACTIVE },
          data: { status: EnrollmentStatus.COMPLETED, ...auditFields },
        });
        results.push({ entity: 'Enrollment', count: enrollResult.count, toStatus: 'COMPLETED' });
      }
    }

    if (entityType === 'Student') {
      if (newStatus === 'ARCHIVED' || newStatus === 'EXPELLED') {
        const enrollResult = await this.prisma.enrollment.updateMany({
          where: { studentId: Number(entityId), deletedAt: null, status: EnrollmentStatus.ACTIVE },
          data: { status: EnrollmentStatus.DROPPED, ...auditFields },
        });
        results.push({ entity: 'Enrollment', count: enrollResult.count, toStatus: 'DROPPED' });
      }
    }

    return results.filter((r) => r.count > 0);
  }
}
