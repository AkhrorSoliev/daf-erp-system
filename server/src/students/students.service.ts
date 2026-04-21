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
import { generatePassword } from '../common/utils/password.util';

const STUDENT_ROLE_ID = 6;

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
            select: {
              teacher: {
                select: { id: true, firstName: true, lastName: true },
              },
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
    const { page = 1, pageSize = 10, search, status, branch_id } = query;
    const skip = (page - 1) * pageSize;

    // Base where: search + teacher + branch (without status filter)
    const baseWhere: Prisma.StudentWhereInput = {
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

      baseWhere.OR = searchConditions;
    }

    const enrollmentConditions: Prisma.EnrollmentWhereInput[] = [
      { deletedAt: null },
    ];

    if (query.teacher_id) {
      enrollmentConditions.push({
        group: {
          deletedAt: null,
          teachers: { some: { teacherId: query.teacher_id } },
        },
      });
    }

    if (query.group_id) {
      enrollmentConditions.push({ groupId: query.group_id });
    }

    if (enrollmentConditions.length > 1) {
      baseWhere.enrollments = { some: { AND: enrollmentConditions } };
    }

    if (branch_id) {
      baseWhere.branches = { some: { branchId: branch_id } };
    }

    // Full where: base + status filter (for main query)
    const where: Prisma.StudentWhereInput = { ...baseWhere };

    if (status === 'active') {
      where.status = StudentStatus.ACTIVE;
      const activeEnrollmentFilter = {
        enrollments: { some: { deletedAt: null } },
      };
      if (where.enrollments) {
        where.AND = [
          { enrollments: where.enrollments },
          activeEnrollmentFilter,
        ];
        delete where.enrollments;
      } else {
        where.enrollments = activeEnrollmentFilter.enrollments;
      }
    } else if (status === 'frozen') {
      where.status = StudentStatus.FROZEN;
    } else if (status === 'ungrouped') {
      where.status = StudentStatus.ACTIVE;
      const noEnrollmentFilter = { enrollments: { none: { deletedAt: null } } };
      if (where.enrollments) {
        where.AND = [{ enrollments: where.enrollments }, noEnrollmentFilter];
        delete where.enrollments;
      } else {
        where.enrollments = noEnrollmentFilter.enrollments;
      }
    } else if (status === 'graduated') {
      where.status = StudentStatus.GRADUATED;
    } else if (status === 'expelled') {
      where.status = StudentStatus.EXPELLED;
    }

    // Stats queries use baseWhere (no status filter) so they reflect the full filtered set
    const activeStatsWhere: Prisma.StudentWhereInput = {
      ...baseWhere,
      isActive: true,
    };
    if (baseWhere.enrollments) {
      activeStatsWhere.AND = [
        { enrollments: baseWhere.enrollments },
        { enrollments: { some: { deletedAt: null } } },
      ];
      delete activeStatsWhere.enrollments;
    } else {
      activeStatsWhere.enrollments = { some: { deletedAt: null } };
    }

    const [data, total, statsTotal, activeCount, frozenCount, debtorCount] =
      await Promise.all([
        this.prisma.student.findMany({
          where,
          skip,
          take: pageSize,
          select: studentSelect,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.student.count({ where }),
        this.prisma.student.count({ where: baseWhere }),
        this.prisma.student.count({ where: activeStatsWhere }),
        this.prisma.student.count({
          where: { ...baseWhere, status: StudentStatus.FROZEN },
        }),
        this.prisma.student.count({
          where: { ...baseWhere, balance: { lt: 0 } },
        }),
      ]);

    return {
      data: data.map(formatStudent),
      total,
      page,
      pageSize,
      stats: {
        total: statsTotal,
        active: activeCount,
        frozen: frozenCount,
        debtors: debtorCount,
      },
    };
  }

  async findById(id: number) {
    const student = await this.prisma.student.findFirst({
      where: { id },
      select: studentSelect,
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    const lastTxn = await this.prisma.transaction.findFirst({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      select: { type: true },
    });

    return {
      ...formatStudent(student),
      lastTransactionType: lastTxn?.type ?? null,
    };
  }

  async create(dto: CreateStudentDto, companyId: number, userId?: number) {
    const existing = await this.prisma.student.findFirst({
      where: { phone: dto.phone, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(
        'Bu telefon raqam allaqachon tizimda mavjud',
      );
    }

    const student = await this.prisma.$transaction(
      async (tx) => {
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
      },
      { maxWait: 10000, timeout: 15000 },
    );

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

    if (
      dto.photo !== undefined &&
      student.photo &&
      dto.photo !== student.photo
    ) {
      await this.uploadService.deleteFile(student.photo);
    }

    if (dto.phone && dto.phone !== student.phone) {
      const phoneTaken = await this.prisma.student.findFirst({
        where: { phone: dto.phone, deletedAt: null, id: { not: id } },
      });
      if (phoneTaken) {
        throw new BadRequestException(
          'Bu telefon raqam allaqachon tizimda mavjud',
        );
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
          ...(dto.parentPhone !== undefined && {
            parentPhone: dto.parentPhone,
          }),
          ...(dto.parentName !== undefined && { parentName: dto.parentName }),
          ...(dto.telegram !== undefined && { telegram: dto.telegram }),
          ...(dto.gender !== undefined && { gender: dto.gender }),
          ...(dto.dateOfBirth !== undefined && {
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          }),
          ...(dto.photo !== undefined && { photo: dto.photo }),
          ...(dto.comment !== undefined && { comment: dto.comment }),
          ...(dto.placeOfStudy !== undefined && {
            placeOfStudy: dto.placeOfStudy,
          }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.passportSeries !== undefined && {
            passportSeries: dto.passportSeries,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        select: studentSelect,
      });

      if (dto.branchIds !== undefined) {
        await tx.studentBranch.deleteMany({ where: { studentId: id } });
        if (dto.branchIds.length) {
          await tx.studentBranch.createMany({
            data: dto.branchIds.map((branchId) => ({
              studentId: id,
              branchId,
            })),
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

    // GRADUATED: faqat faol enrollment-i yo'q o'quvchiga ruxsat
    if (dto.status === StudentStatus.GRADUATED) {
      const activeCount = await this.prisma.enrollment.count({
        where: { studentId: id, deletedAt: null, status: 'ACTIVE' },
      });
      if (activeCount > 0) {
        throw new BadRequestException(
          "Faol guruhlari bor o'quvchini bitirgan deb belgilab bo'lmaydi",
        );
      }
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
        status: dto.status,
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
    await this.statusCascadeService.cascade(
      'Student',
      String(id),
      dto.status,
      userId,
    );

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

    // Cascade: ACTIVE + FROZEN enrollment → DROPPED
    await this.statusCascadeService.cascade(
      'Student',
      String(id),
      'ARCHIVED',
      deletedById,
    );

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
}
