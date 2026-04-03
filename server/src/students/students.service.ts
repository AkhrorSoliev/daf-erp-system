import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, StudentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { ChangeStudentStatusDto } from './dto/change-student-status.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

const STUDENT_ROLE_ID = 6;

function generatePassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  extraPhone: true,
  parentPhone: true,
  parentName: true,
  telegram: true,
  telegramChatId: true,
  gender: true,
  dateOfBirth: true,
  photo: true,
  comment: true,
  balance: true,
  placeOfStudy: true,
  address: true,
  passportSeries: true,
  isActive: true,
  status: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
  statusChangedAt: true,
  statusChangedById: true,
  statusChangeReason: true,
  deletedAt: true,
  deletedBy: { select: { id: true, firstName: true, lastName: true } },
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
          teachers: {
            include: {
              teacher: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StudentSelect;

function formatStudent(student: any) {
  const {
    enrollments,
    branches,
    deletedBy,
    deletedAt,
    dateOfBirth,
    companyId,
    ...rest
  } = student;

  return {
    ...rest,
    date_of_birth: dateOfBirth?.toISOString() ?? null,
    company_id: companyId ?? null,
    deleted_at: deletedAt ?? null,
    destroyer: deletedBy ?? null,
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
      teachers: (e.group.teachers ?? []).map((gt: any) => gt.teacher),
      enrolledAt: e.createdAt,
    })),
    balance_on_period: null,
  };
}

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
    private eventEmitter: EventEmitter2,
  ) {}

  async findAll(query: StudentQueryDto) {
    const { page = 1, per_page = 10, search, status, branch_id } = query;
    const skip = (page - 1) * per_page;

    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
    };

    if (search) {
      const searchConditions: Prisma.StudentWhereInput[] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];

      const searchAsNumber = Number(search);
      if (!isNaN(searchAsNumber) && Number.isInteger(searchAsNumber)) {
        searchConditions.push({ id: { equals: searchAsNumber } });
      }

      where.OR = searchConditions;
    }

    if (status === 'active') {
      where.status = StudentStatus.ACTIVE;
      where.enrollments = { some: { deletedAt: null } };
    } else if (status === 'frozen') {
      where.status = StudentStatus.INACTIVE;
    } else if (status === 'ungrouped') {
      where.status = StudentStatus.ACTIVE;
      where.enrollments = { none: { deletedAt: null } };
    } else if (status === 'graduated') {
      where.status = StudentStatus.GRADUATED;
    } else if (status === 'expelled') {
      where.status = StudentStatus.EXPELLED;
    }

    if (query.teacher_id) {
      const teacherEnrollmentFilter: Prisma.StudentWhereInput = {
        enrollments: {
          some: {
            deletedAt: null,
            group: {
              deletedAt: null,
              teachers: { some: { teacherId: query.teacher_id } },
            },
          },
        },
      };

      if (where.enrollments) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          { enrollments: where.enrollments },
          teacherEnrollmentFilter,
        ];
        delete where.enrollments;
      } else {
        Object.assign(where, teacherEnrollmentFilter);
      }
    }

    if (branch_id) {
      where.branches = { some: { branchId: branch_id } };
    }

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip,
        take: per_page,
        select: studentSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.student.count({ where }),
    ]);

    return {
      data: data.map(formatStudent),
      total,
      page,
      per_page,
    };
  }

  async findById(id: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: studentSelect,
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    return formatStudent(student);
  }

  async create(dto: CreateStudentDto, companyId: number, userId?: number) {
    const existing = await this.prisma.student.findFirst({
      where: { phone: dto.phone, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException('Bu telefon raqam allaqachon tizimda mavjud');
    }

    const student = await this.prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          extraPhone: dto.extraPhone,
          parentPhone: dto.parentPhone,
          parentName: dto.parentName,
          telegram: dto.telegram,
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          photo: dto.photo,
          comment: dto.comment,
          placeOfStudy: dto.placeOfStudy,
          address: dto.address,
          passportSeries: dto.passportSeries,
          companyId,
        },
        select: studentSelect,
      });

      if (dto.branchIds?.length) {
        await tx.studentBranch.createMany({
          data: dto.branchIds.map((branchId) => ({
            studentId: created.id,
            branchId,
          })),
        });
      }

      // Re-fetch to include branches
      if (dto.branchIds?.length) {
        return tx.student.findUniqueOrThrow({
          where: { id: created.id },
          select: studentSelect,
        });
      }

      return created;
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Student',
      entityId: student.id,
      newValues: student,
      changedById: userId,
      companyId,
    });

    // Avtomatik User yaratish (login/parol)
    const { plainPassword } = await this.createStudentUser(
      student.id,
      dto.phone,
      dto.firstName,
      dto.lastName,
      companyId,
    );

    const formatted = formatStudent(student);
    return { ...formatted, generatedPassword: plainPassword };
  }

  async update(id: number, dto: UpdateStudentDto, userId?: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    if (dto.photo !== undefined && student.photo && dto.photo !== student.photo) {
      await this.uploadService.deleteFile(student.photo);
    }

    if (dto.phone && dto.phone !== student.phone) {
      const phoneTaken = await this.prisma.student.findFirst({
        where: { phone: dto.phone, deletedAt: null, id: { not: id } },
      });
      if (phoneTaken) {
        throw new BadRequestException('Bu telefon raqam allaqachon tizimda mavjud');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.student.update({
        where: { id },
        data: {
          ...(dto.firstName !== undefined && { firstName: dto.firstName }),
          ...(dto.lastName !== undefined && { lastName: dto.lastName }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.extraPhone !== undefined && { extraPhone: dto.extraPhone }),
          ...(dto.parentPhone !== undefined && { parentPhone: dto.parentPhone }),
          ...(dto.parentName !== undefined && { parentName: dto.parentName }),
          ...(dto.telegram !== undefined && { telegram: dto.telegram }),
          ...(dto.gender !== undefined && { gender: dto.gender }),
          ...(dto.dateOfBirth !== undefined && { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }),
          ...(dto.photo !== undefined && { photo: dto.photo }),
          ...(dto.comment !== undefined && { comment: dto.comment }),
          ...(dto.placeOfStudy !== undefined && { placeOfStudy: dto.placeOfStudy }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.passportSeries !== undefined && { passportSeries: dto.passportSeries }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        select: studentSelect,
      });

      if (dto.branchIds !== undefined) {
        await tx.studentBranch.deleteMany({ where: { studentId: id } });
        if (dto.branchIds.length) {
          await tx.studentBranch.createMany({
            data: dto.branchIds.map((branchId) => ({ studentId: id, branchId })),
          });
        }
        return tx.student.findUniqueOrThrow({
          where: { id },
          select: studentSelect,
        });
      }

      return result;
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Student',
      entityId: id,
      oldValues: student,
      newValues: updated,
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    return formatStudent(updated);
  }

  async changeStatus(id: number, dto: ChangeStudentStatusDto, userId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'Student',
      entityId: String(id),
      fromStatus: student.status,
      toStatus: dto.status,
      reason: dto.reason,
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    const isActive = dto.status === StudentStatus.ACTIVE;

    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        status: dto.status as StudentStatus,
        isActive,
        ...auditData,
      },
      select: studentSelect,
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Student',
      entityId: id,
      oldValues: { status: student.status },
      newValues: { status: dto.status, reason: dto.reason },
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    // Cascade: ARCHIVED/EXPELLED → enrollment larni yangilash
    await this.statusCascadeService.cascade('Student', String(id), dto.status, userId);

    return formatStudent(updated);
  }

  async getStatusHistory(id: number) {
    const student = await this.prisma.student.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    return this.statusHistoryService.getHistory('Student', String(id));
  }

  async delete(id: number, deletedById: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    await this.statusHistoryService.changeStatus({
      entityType: 'Student',
      entityId: String(id),
      fromStatus: student.status,
      toStatus: StudentStatus.ARCHIVED,
      reason: "O'chirildi",
      changedById: deletedById,
      companyId: student.companyId ?? undefined,
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'Student',
      entityId: id,
      oldValues: student,
      changedById: deletedById,
      companyId: student.companyId ?? undefined,
    });

    await this.prisma.student.update({
      where: { id },
      data: {
        status: StudentStatus.ARCHIVED,
        isActive: false,
        deletedAt: new Date(),
        deletedById,
        statusChangedAt: new Date(),
        statusChangedById: deletedById,
        statusChangeReason: "O'chirildi",
      },
    });

    return { message: "O'quvchi muvaffaqiyatli o'chirildi" };
  }

  /**
   * Student uchun User yaratadi (login = telefon, parol = random).
   * Telegram bot va admin create dan chaqiriladi.
   */
  async createStudentUser(
    studentId: number,
    phone: string,
    firstName: string,
    lastName: string,
    companyId: number,
  ): Promise<{ userId: number; plainPassword: string }> {
    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        login: phone,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        companyId,
        roles: { create: [{ roleId: STUDENT_ROLE_ID }] },
      },
    });

    await this.prisma.student.update({
      where: { id: studentId },
      data: { userId: user.id },
    });

    return { userId: user.id, plainPassword };
  }

  async enrollToGroup(studentId: number, groupId: string, userId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!student) {
      throw new NotFoundException(`O'quvchi #${studentId} topilmadi`);
    }

    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      include: { course: { select: { name: true } } },
    });
    if (!group) {
      throw new NotFoundException(`Guruh topilmadi`);
    }

    // Already in this exact group?
    const sameGroup = await this.prisma.enrollment.findFirst({
      where: { studentId, groupId, deletedAt: null, status: 'ACTIVE' },
    });
    if (sameGroup) {
      throw new BadRequestException("O'quvchi allaqachon bu guruhda");
    }

    // Deactivate any existing active enrollment (1 student = 1 group)
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

    // History: Enrollment entity
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

    // History: Student entity — tarix tab da ko'rinadi
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

    // History: Group entity — guruh tarix tabida ko'rinadi
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

    // History: Student entity — tarix tab da ko'rinadi
    const removedGroup = await this.prisma.group.findUnique({ where: { id: enrollment.groupId }, select: { name: true } });
    const student = await this.prisma.student.findUnique({ where: { id: enrollment.studentId }, select: { firstName: true, lastName: true, companyId: true } });
    await this.entityHistoryService.recordDelete({
      entityType: 'Student',
      entityId: enrollment.studentId,
      oldValues: { guruh: removedGroup?.name ?? enrollment.groupId, guruhId: enrollment.groupId, action: 'GURUHDAN_CHIQARILDI', sabab: reason },
      changedById: userId,
    });

    // History: Group entity — guruh tarix tabida ko'rinadi
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
