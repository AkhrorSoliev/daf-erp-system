import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class StudentEnrollmentService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private eventEmitter: EventEmitter2,
  ) {}

  async enrollToGroup(studentId: number, groupId: string, userId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!student) {
      throw new NotFoundException(`O'quvchi #${studentId} topilmadi`);
    }

    if (student.status !== StudentStatus.ACTIVE) {
      throw new BadRequestException(
        "Faqat faol o'quvchilarni guruhga qo'shish mumkin",
      );
    }

    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      include: { course: { select: { name: true } } },
    });
    if (!group) {
      throw new NotFoundException(`Guruh topilmadi`);
    }

    const ENROLLABLE_STATUSES = ['ACTIVE', 'FORMING', 'PAUSED'];
    if (!ENROLLABLE_STATUSES.includes(group.statusEnum)) {
      throw new BadRequestException(
        "Tugallangan yoki bekor qilingan guruhga o'quvchi qo'shib bo'lmaydi",
      );
    }

    const sameGroup = await this.prisma.enrollment.findFirst({
      where: { studentId, groupId, deletedAt: null, status: 'ACTIVE' },
    });
    if (sameGroup) {
      throw new BadRequestException("O'quvchi allaqachon bu guruhda");
    }

    const currentEnrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, deletedAt: null, status: 'ACTIVE' },
    });
    if (currentEnrollment) {
      await this.prisma.enrollment.update({
        where: { id: currentEnrollment.id },
        data: {
          status: 'TRANSFERRED',
          statusChangedAt: new Date(),
          statusChangedById: userId,
          statusChangeReason: `Guruh o'zgartirildi`,
          transferredToId: groupId,
        },
      });
    }

    const enrollment = await this.prisma.enrollment.create({
      data: {
        studentId,
        groupId,
      },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Enrollment',
      entityId: enrollment.id,
      newValues: {
        studentId,
        groupId,
        status: 'ACTIVE',
        previousGroupId: currentEnrollment?.groupId ?? null,
      },
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    if (currentEnrollment) {
      const oldGroup = await this.prisma.group.findUnique({ where: { id: currentEnrollment.groupId }, select: { name: true } });
      const newGroup = await this.prisma.group.findUnique({ where: { id: groupId }, select: { name: true } });
      await this.entityHistoryService.recordUpdate({
        entityType: 'Student',
        entityId: studentId,
        oldValues: { guruh: oldGroup?.name ?? currentEnrollment.groupId, guruhId: currentEnrollment.groupId },
        newValues: { guruh: newGroup?.name ?? groupId, guruhId: groupId },
        changedById: userId,
        companyId: student.companyId ?? undefined,
      });
    } else {
      const newGroup = await this.prisma.group.findUnique({ where: { id: groupId }, select: { name: true } });
      await this.entityHistoryService.recordCreate({
        entityType: 'Student',
        entityId: studentId,
        newValues: { guruh: newGroup?.name ?? groupId, guruhId: groupId, action: 'GURUHGA_QOSHILDI' },
        changedById: userId,
        companyId: student.companyId ?? undefined,
      });
    }

    await this.entityHistoryService.recordCreate({
      entityType: 'Group',
      entityId: groupId,
      newValues: {
        action: 'OQUVCHI_QOSHILDI',
        oquvchi: `${student.firstName} ${student.lastName}`,
        oquvchiId: studentId,
      },
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    this.eventEmitter.emit('student.enrolled', {
      studentId,
      groupName: group.name,
      courseName: group.course.name,
      days: group.days,
      exactDays: group.exactDays,
      lessonStartTime: group.lessonStartTime,
      lessonEndTime: group.lessonEndTime,
      companyId: student.companyId,
    });

    return enrollment;
  }

  async removeFromGroup(_studentId: number, enrollmentId: string, userId: number, reason: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, deletedAt: null },
    });
    if (!enrollment) {
      throw new NotFoundException('Faol yozuv topilmadi');
    }

    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'DROPPED',
        statusChangedAt: new Date(),
        statusChangedById: userId,
        statusChangeReason: reason,
      },
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'Enrollment',
      entityId: enrollmentId,
      oldValues: { studentId: enrollment.studentId, groupId: enrollment.groupId, status: enrollment.status },
      changedById: userId,
    });

    const removedGroup = await this.prisma.group.findUnique({ where: { id: enrollment.groupId }, select: { name: true } });
    const student = await this.prisma.student.findUnique({ where: { id: enrollment.studentId }, select: { firstName: true, lastName: true, companyId: true } });
    await this.entityHistoryService.recordDelete({
      entityType: 'Student',
      entityId: enrollment.studentId,
      oldValues: { guruh: removedGroup?.name ?? enrollment.groupId, guruhId: enrollment.groupId, action: 'GURUHDAN_CHIQARILDI', sabab: reason },
      changedById: userId,
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'Group',
      entityId: enrollment.groupId,
      oldValues: {
        action: 'OQUVCHI_CHIQARILDI',
        oquvchi: `${student?.firstName ?? ''} ${student?.lastName ?? ''}`.trim(),
        oquvchiId: enrollment.studentId,
        sabab: reason,
      },
      changedById: userId,
      companyId: student?.companyId ?? undefined,
    });

    this.eventEmitter.emit('student.removed_from_group', {
      studentId: enrollment.studentId,
      groupName: removedGroup?.name ?? '',
      reason,
      companyId: student?.companyId ?? null,
    });

    return { message: "O'quvchi guruhdan chiqarildi" };
  }
}
