import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class StudentEnrollmentService {
  private readonly logger = new Logger(StudentEnrollmentService.name);

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private transactionsService: TransactionsService,
    private eventEmitter: EventEmitter2,
  ) {}

  async enrollToGroup(
    studentId: number,
    groupId: string,
    userId: number,
    companyId: number,
    options: { transferReasonId?: string } = {},
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null, companyId },
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
      where: { id: groupId, deletedAt: null, companyId },
      include: {
        course: { select: { name: true } },
        teachers: { select: { teacherId: true } },
      },
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
      include: {
        group: {
          select: { teachers: { select: { teacherId: true } } },
        },
      },
    });

    // Transfer reason validation — only applies when this is a transfer
    // (i.e. there's an existing active enrollment being moved).
    let transferReasonId: string | null = null;
    if (currentEnrollment) {
      const oldTeachers = new Set(
        currentEnrollment.group.teachers.map((t) => t.teacherId),
      );
      const newTeachers = new Set(group.teachers.map((t) => t.teacherId));
      const teachersDiffer =
        oldTeachers.size !== newTeachers.size ||
        [...oldTeachers].some((t) => !newTeachers.has(t));

      if (teachersDiffer) {
        if (!options.transferReasonId) {
          throw new BadRequestException(
            "Ustoz farqli guruhga o'tkazilayotgan o'quvchi uchun sabab tanlash majburiy",
          );
        }
        const reason = await this.prisma.enrollmentTransferReason.findFirst({
          where: {
            id: options.transferReasonId,
            companyId: student.companyId,
            deletedAt: null,
          },
        });
        if (!reason) {
          throw new NotFoundException('Tanlangan transfer sababi topilmadi');
        }
        transferReasonId = reason.id;
      } else if (options.transferReasonId) {
        // Same teachers — reason is optional but if provided, validate it.
        const reason = await this.prisma.enrollmentTransferReason.findFirst({
          where: {
            id: options.transferReasonId,
            companyId: student.companyId,
            deletedAt: null,
          },
        });
        if (!reason) {
          throw new NotFoundException('Tanlangan transfer sababi topilmadi');
        }
        transferReasonId = reason.id;
      }

      await this.prisma.enrollment.update({
        where: { id: currentEnrollment.id },
        data: {
          status: 'TRANSFERRED',
          statusChangedAt: new Date(),
          statusChangedById: userId,
          statusChangeReason: `Guruh o'zgartirildi`,
          transferredToId: groupId,
          transferReasonId,
        },
      });
    }

    const enrollment = await this.prisma.enrollment.create({
      data: {
        studentId,
        groupId,
      },
    });

    // Prepaid model (post-audit): do NOT deduct a cycle at enrollment.
    // Deduction only happens in attendance when the student actually has
    // the balance to cover the cycle. This prevents fake coverage entries
    // that made teachers accrue salary for students who never paid.

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
      const oldGroup = await this.prisma.group.findUnique({
        where: { id: currentEnrollment.groupId },
        select: { name: true },
      });
      const newGroup = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true },
      });
      await this.entityHistoryService.recordUpdate({
        entityType: 'Student',
        entityId: studentId,
        oldValues: {
          guruh: oldGroup?.name ?? currentEnrollment.groupId,
          guruhId: currentEnrollment.groupId,
        },
        newValues: { guruh: newGroup?.name ?? groupId, guruhId: groupId },
        changedById: userId,
        companyId: student.companyId ?? undefined,
      });
    } else {
      const newGroup = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true },
      });
      await this.entityHistoryService.recordCreate({
        entityType: 'Student',
        entityId: studentId,
        newValues: {
          guruh: newGroup?.name ?? groupId,
          guruhId: groupId,
          action: 'GURUHGA_QOSHILDI',
        },
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

  async removeFromGroup(
    _studentId: number,
    enrollmentId: string,
    userId: number,
    companyId: number,
    input: { departureReasonId?: string; reason?: string },
  ) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        deletedAt: null,
        student: { companyId },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Faol yozuv topilmadi');
    }

    // Load the student — already scoped by the enrollment query above.
    const student = await this.prisma.student.findUnique({
      where: { id: enrollment.studentId },
      select: { firstName: true, lastName: true, companyId: true },
    });
    if (!student) {
      throw new NotFoundException("O'quvchi topilmadi");
    }

    // Resolve the reason: prefer the configured DepartureReason (id + name),
    // fall back to free-text, and finally to the default label.
    let departureReasonId: string | null = null;
    let reasonText: string;
    if (input.departureReasonId) {
      if (student.companyId == null) {
        throw new NotFoundException('Kompaniya aniqlanmadi');
      }
      const reason = await this.prisma.departureReason.findFirst({
        where: {
          id: input.departureReasonId,
          companyId: student.companyId,
          deletedAt: null,
        },
      });
      if (!reason) {
        throw new NotFoundException('Ketish sababi topilmadi');
      }
      departureReasonId = reason.id;
      reasonText = reason.name;
    } else {
      reasonText = input.reason?.trim() || 'Guruhdan chiqarildi';
    }

    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'DROPPED',
        statusChangedAt: new Date(),
        statusChangedById: userId,
        statusChangeReason: reasonText,
        departureReasonId,
      },
    });

    // Mirror the latest departure reason onto the student so it's visible
    // on the student record without joining enrollments.
    await this.prisma.student.update({
      where: { id: enrollment.studentId },
      data: {
        statusChangeReason: reasonText,
        statusChangedAt: new Date(),
        statusChangedById: userId,
      },
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'Enrollment',
      entityId: enrollmentId,
      oldValues: {
        studentId: enrollment.studentId,
        groupId: enrollment.groupId,
        status: enrollment.status,
      },
      changedById: userId,
    });

    const removedGroup = await this.prisma.group.findUnique({
      where: { id: enrollment.groupId },
      select: { name: true },
    });
    await this.entityHistoryService.recordDelete({
      entityType: 'Student',
      entityId: enrollment.studentId,
      oldValues: {
        guruh: removedGroup?.name ?? enrollment.groupId,
        guruhId: enrollment.groupId,
        action: 'GURUHDAN_CHIQARILDI',
        sabab: reasonText,
      },
      changedById: userId,
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'Group',
      entityId: enrollment.groupId,
      oldValues: {
        action: 'OQUVCHI_CHIQARILDI',
        oquvchi:
          `${student?.firstName ?? ''} ${student?.lastName ?? ''}`.trim(),
        oquvchiId: enrollment.studentId,
        sabab: reasonText,
      },
      changedById: userId,
      companyId: student?.companyId ?? undefined,
    });

    this.eventEmitter.emit('student.removed_from_group', {
      studentId: enrollment.studentId,
      groupName: removedGroup?.name ?? '',
      reason: reasonText,
      departureReasonId,
      companyId: student?.companyId ?? null,
    });

    return { message: "O'quvchi guruhdan chiqarildi" };
  }
}
