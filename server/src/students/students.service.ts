import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { ChangeStudentStatusDto } from './dto/change-student-status.dto';

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
  deletedBy: { select: { id: true, name: true } },
  branches: {
    select: {
      branch: { select: { id: true, name: true } },
    },
  },
  enrollments: {
    where: { deletedAt: null },
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
              teacher: { select: { id: true, name: true } },
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
  ) {}

  async findAll(query: StudentQueryDto) {
    const { page = 1, per_page = 10, search, status, branch_id } = query;
    const skip = (page - 1) * per_page;

    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    if (status === 'active') {
      where.status = StudentStatus.ACTIVE;
      where.enrollments = { some: { deletedAt: null } };
    } else if (status === 'frozen') {
      where.status = StudentStatus.INACTIVE;
    } else if (status === 'ungrouped') {
      where.status = StudentStatus.ACTIVE;
      where.enrollments = { none: { deletedAt: null } };
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

  async create(dto: CreateStudentDto, companyId: number) {
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

    return formatStudent(student);
  }

  async update(id: number, dto: UpdateStudentDto) {
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
}
