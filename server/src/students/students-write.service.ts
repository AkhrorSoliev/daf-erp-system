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
import {
  StudentLeadOriginService,
  type StudentOrigin,
} from '../common/student-origin';
import { generatePassword } from '../common/utils/password.util';
import {
  loginForPhone,
  planPhoneChange,
} from '../common/auth/phone-account-rules';
import {
  STUDENT_ROLE_ID,
  studentSelect,
  formatStudent,
} from './shared/student-select';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { assertCallerInBranch } from '../common/auth/branch-scope';

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
    private leadOrigin: StudentLeadOriginService,
  ) {}

  /**
   * A student belongs to exactly one branch, and that branch must be real,
   * belong to the caller's company, and be one the caller holds.
   *
   * Why it is enforced here rather than in the DTO: `branchIds` used to be a
   * free-form array that nothing validated, so `[]`, a foreign company's
   * branch, or a non-existent id all sailed through. A branch-less student is
   * then absent from every branch-filtered list and their first payment cannot
   * be booked to any branch at all.
   *
   * The caller check lives here, not beside it, because both `create` and a
   * branch change on `update` pass through: checking only one of them would
   * let a director create a student in their own branch and then move it into
   * another, which ends exactly where creating it there would.
   */
  private async assertSingleValidBranch(
    branchIds: number[] | undefined,
    companyId: number,
    userId: number | undefined,
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
    await assertCallerInBranch(
      this.prisma,
      userId,
      branchIds[0],
      "Bu filialga o'quvchi qo'shish huquqingiz yo'q",
    );
  }

  async create(
    dto: CreateStudentDto,
    companyId: number,
    userId: number | undefined,
    origin: StudentOrigin,
  ) {
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

    await this.assertSingleValidBranch(dto.branchIds, companyId, userId);

    // Manba tranzaksiyadan OLDIN tekshiriladi: `Lead.sourceId` tashqi kalit,
    // ya'ni yolg'on id tranzaksiya ichida Prisma P2003 beradi va admin
    // tushunarsiz 500 oladi — o'quvchisi ham yaratilmagan holda.
    if (origin.kind === 'DIRECT') {
      await this.leadOrigin.assertSourceUsable(origin.sourceId, companyId);
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

        // Har bir o'quvchi lid sifatida tug'iladi. Shu tranzaksiya ichida:
        // lid yozilmasa, o'quvchi ham yozilmaydi.
        if (origin.kind === 'DIRECT') {
          await this.leadOrigin.recordDirectOrigin(tx, {
            studentId: created.id,
            firstName: created.firstName,
            lastName: created.lastName,
            phone: dto.phone,
            branchId: dto.branchIds?.[0] ?? null,
            companyId,
            sourceId: origin.sourceId,
            userId,
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

    // `assertSingleValidBranch` below checks the TARGET branch (real, in this
    // company, held by the caller); this asks whether the CALLER may act on
    // this student at all, i.e. on the branch they are in now. Without it a
    // director could edit another branch's student — and, because `branchIds`
    // is editable here, move them into their own branch along with their
    // balance, their enrolments and their teacher's future accruals.
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);

    // Editing branches is allowed, but only to another single valid branch —
    // clearing them would strand the student outside every branch view.
    if (dto.branchIds !== undefined) {
      await this.assertSingleValidBranch(dto.branchIds, companyId, userId);
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

    const signIn = await this.planSignInNumber(student.userId, dto.phone);

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

        // Same transaction as the card: a card saved without its account is
        // exactly the drift ADR-0032 closes.
        const accountData = {
          ...signIn?.write,
          ...(hashedPassword && { password: hashedPassword }),
        };
        if (student.userId && Object.keys(accountData).length > 0) {
          await tx.user.update({
            where: { id: student.userId },
            data: accountData,
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

    // The account's login rides along so the card's history shows the sign-in
    // number moving (the history tab labels the field "Login").
    await this.entityHistoryService.recordUpdate({
      entityType: 'Student',
      entityId: id,
      oldValues: signIn ? { ...student, login: signIn.account.login } : student,
      newValues: signIn
        ? {
            ...updated,
            login:
              'login' in signIn.write
                ? signIn.write.login
                : signIn.account.login,
          }
        : updated,
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    return formatStudent(updated);
  }

  /**
   * What the student's sign-in account must write to keep the number on the
   * card (ADR-0032), or `null` when it already does.
   *
   * Every way in — password, Telegram, SMS reset — looks the number up on the
   * account, never on the card. An account left behind kept the old number as
   * its sign-in number while the card's number reached nothing (production,
   * 2026-09-24: 115 students, each after a staff phone edit). The comparison
   * is against the ACCOUNT, not the card's previous value, so the next save
   * of a card edited before this rule brings its account back in line.
   */
  private async planSignInNumber(
    userId: number | null,
    nextPhone: string | undefined,
  ) {
    if (nextPhone === undefined || userId === null) return null;

    const account = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, phone: true, login: true },
    });
    if (!account || account.phone === nextPhone) return null;

    // `staff: false`: a student account and the same person's staff account
    // may share a phone (ADR-0022), so the one-staff-account-per-phone refusal
    // must not fire here.
    const write = await planPhoneChange(this.prisma, account, nextPhone, {
      staff: false,
    });
    return { account, write };
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
    // Kirish nomi — telefon, agar u boshqa tirik hisobning nomi bo'lmasa
    // (masalan, xodim yoki aka-uka hisobi). Aks holda bo'sh — ilgari bu
    // holatda `create` bazada yiqilib, o'quvchi kirish hisobisiz qolardi.
    const login = await loginForPhone(this.prisma, phone);
    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        login,
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
