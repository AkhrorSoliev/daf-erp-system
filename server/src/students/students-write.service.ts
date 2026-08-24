import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

import { UploadService } from '../upload/upload.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { generatePassword } from '../common/utils/password.util';
import {
  STUDENT_ROLE_ID,
  studentSelect,
  formatStudent,
} from './shared/student-select';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';

@Injectable()
export class StudentsWriteService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
    private eventEmitter: EventEmitter2,
    private transactionsService: TransactionsService,
  ) {}

  /**
   * A student belongs to exactly one branch, and that branch must be real and
   * belong to the caller's company.
   *
   * Why it is enforced here rather than in the DTO: `branchIds` used to be a
   * free-form array that nothing validated, so `[]`, a foreign company's
   * branch, or a non-existent id all sailed through. A branch-less student is
   * then absent from every branch-filtered list and their first payment cannot
   * be booked to any branch at all.
   */
  private async assertSingleValidBranch(
    branchIds: number[] | undefined,
    companyId: number,
  ): Promise<void> {
    if (!branchIds?.length) {
      throw new BadRequestException("O'quvchi uchun filial tanlanishi shart");
    }
    if (branchIds.length > 1) {
      throw new BadRequestException(
        "O'quvchi bir vaqtda faqat bitta filialga tegishli bo'lishi mumkin",
      );
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchIds[0], companyId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException(`Filial #${branchIds[0]} topilmadi`);
    }
  }

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

    await this.assertSingleValidBranch(dto.branchIds, companyId);

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

    // Notify approved Telegram admin groups (best-effort)
    const branchName = formatted.branches?.[0]?.name ?? null;
    const branchId = formatted.branches?.[0]?.id ?? null;
    this.eventEmitter.emit('student.created', {
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      branchId,
      branchName,
      companyId,
    });

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

    // `assertSingleValidBranch` below asks whether the TARGET branch is real;
    // this asks whether the CALLER may act on this student at all. Without it a
    // director could edit another branch's student — and, because `branchIds`
    // is editable here, move them into their own branch along with their
    // balance, their enrolments and their teacher's future accruals.
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);

    // Editing branches is allowed, but only to another single valid branch —
    // clearing them would strand the student outside every branch view.
    if (dto.branchIds !== undefined) {
      await this.assertSingleValidBranch(dto.branchIds, companyId);
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

    if (dto.password !== undefined && !student.userId) {
      throw new BadRequestException(
        "O'quvchining portal hisobi mavjud emas — parolni o'zgartirib bo'lmaydi",
      );
    }

    const hashedPassword =
      dto.password !== undefined
        ? await bcrypt.hash(dto.password, 10)
        : undefined;

    // NOTE: changing `discountPercent` writes NOTHING to the ledger.
    //
    // It used to. `applyRetroactiveDiscountAdjustment` recomputed every past
    // lesson charge at the new rate and booked the difference — in production
    // that credited 1 473 807 so'm across 7 students, one of them 449 995
    // reaching back 41 lessons. The form meanwhile said "eski darslar qayta
    // hisoblanmaydi", so the operator was told the opposite of what happened.
    //
    // CEO decision (2026-08-24): a discount applies from the moment it is set,
    // never backwards. `perLessonPrice` reads `Student.discountPercent` at
    // billing time, so future lessons pick it up automatically and there is
    // nothing else to do here.
    //
    // The "we forgot to record the discount they were promised" case has not
    // disappeared — it moved to `POST /transactions/adjustment` (CEO / Branch
    // Director, requires a description, lands in the audit log). That is the
    // right shape for it: a correction someone deliberately makes and explains,
    // rather than a side effect of editing a percentage.

    const updated = await this.prisma.$transaction(
      async (tx) => {
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
            ...(dto.discountPercent !== undefined && {
              discountPercent: dto.discountPercent,
            }),
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
        }

        if (hashedPassword && student.userId) {
          await tx.user.update({
            where: { id: student.userId },
            data: { password: hashedPassword },
          });
        }

        if (dto.branchIds !== undefined) {
          return tx.student.findUniqueOrThrow({
            where: { id },
            select: studentSelect,
          });
        }

        return result;
      },
      // Plain transaction: the Serializable level here existed only to make the
      // read-then-write of the retroactive adjustment atomic. Nothing in this
      // update touches the balance any more.
      undefined,
    );

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
    await assertCallerMayTouchStudent(this.prisma, deletedById, id, companyId);

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
