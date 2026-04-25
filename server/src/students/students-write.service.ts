import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { generatePassword } from '../common/utils/password.util';
import {
  STUDENT_ROLE_ID,
  studentSelect,
  formatStudent,
} from './shared/student-select';

@Injectable()
export class StudentsWriteService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async create(dto: CreateStudentDto, companyId: number, userId?: number) {
    // Phone is the student-portal login identifier → must be globally unique,
    // not scoped to companyId (otherwise two students in different companies
    // could share a login and auth lookup would be ambiguous).
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
            dateOfBirth: dto.dateOfBirth
              ? new Date(dto.dateOfBirth)
              : undefined,
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

  async update(
    id: number,
    dto: UpdateStudentDto,
    userId: number | undefined,
    companyId: number,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null, companyId },
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
      // Phone uniqueness is global (student-portal login identifier).
      const phoneTaken = await this.prisma.student.findFirst({
        where: {
          phone: dto.phone,
          deletedAt: null,
          id: { not: id },
        },
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

  async delete(
    id: number,
    deletedById: number,
    reason: string,
    companyId: number,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null, companyId },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    await this.statusHistoryService.changeStatus({
      entityType: 'Student',
      entityId: String(id),
      fromStatus: student.status,
      toStatus: StudentStatus.ARCHIVED,
      reason,
      changedById: deletedById,
      companyId: student.companyId ?? undefined,
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'Student',
      entityId: id,
      oldValues: { ...student, deletionReason: reason },
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
        statusChangeReason: reason,
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
