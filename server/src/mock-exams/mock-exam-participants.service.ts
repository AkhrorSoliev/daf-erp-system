import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MockExamStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { MockExamBillingService } from './mock-exam-billing.service';
import { AddManualParticipantDto } from './dto/add-manual-participant.dto';
import { ConvertMockParticipantDto } from './dto/convert-mock-participant.dto';
import { ParticipantsQueryDto } from './dto/participants-query.dto';
import { MarkMockPaidDto } from './dto/mark-mock-paid.dto';

const DEFAULT_PAGE_SIZE = 10;

/**
 * Participants of a mock exam. The primary registration path is the
 * Telegram bot (Faza 4 scene); this service also supports admin-driven
 * manual registration for walk-ins or admins importing participants from
 * outside the bot flow.
 *
 * Manual adds work in any pre-grading status — once GRADING has begun,
 * adding new participants is blocked (would skew rank/percentage tables).
 */
@Injectable()
export class MockExamParticipantsService {
  private readonly logger = new Logger(MockExamParticipantsService.name);

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private mockExamBilling: MockExamBillingService,
  ) {}

  async list(examId: string, query: ParticipantsQueryDto) {
    await this.ensureExam(examId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const search = query.search?.trim();

    const where: Prisma.MockExamParticipantWhereInput = {
      examId,
      deletedAt: null,
    };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { telegramUsername: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.mockExamParticipant.findMany({
        where,
        orderBy: { registeredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          publicId: true,
          firstName: true,
          lastName: true,
          phone: true,
          telegramChatId: true,
          telegramUsername: true,
          registeredAt: true,
          studentId: true,
          paid: true,
          paidAt: true,
          totalScore: true,
          percentage: true,
          passed: true,
          rank: true,
        },
      }),
      this.prisma.mockExamParticipant.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async addManual(
    examId: string,
    dto: AddManualParticipantDto,
    companyId: number,
    userId: number,
  ) {
    const exam = await this.ensureExam(examId);
    if (
      exam.status === MockExamStatus.GRADING ||
      exam.status === MockExamStatus.ANNOUNCED ||
      exam.status === MockExamStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        "Imtihon bahalanish boshlanganidan keyin yangi ishtirokchi qo'sha olmaysiz",
      );
    }

    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException(
        "Ism va familya bo'sh bo'lishi mumkin emas",
      );
    }

    try {
      // 1. Is this person already a real DaF student? Match by phone — the
      //    most reliable signal for admin manual entries. If yes, we reuse
      //    their Student.id as the publicId so mock results show up on the
      //    student profile and payments route via the normal balance flow.
      let publicId: number;
      let studentId: number | null = null;
      const existingStudent = await this.prisma.student.findFirst({
        where: { phone: dto.phone, deletedAt: null },
        select: { id: true },
      });

      if (existingStudent) {
        publicId = existingStudent.id;
        studentId = existingStudent.id;
      } else {
        // 2. Outsider — allocate a fresh public id from the shared Student
        //    sequence. NO Student row is created (mock participants aren't
        //    students). The id is later promoted to a real Student.id only
        //    if an admin explicitly converts the participant to a student.
        const result = await this.prisma.$queryRaw<{ next: bigint }[]>`
          SELECT nextval('"Student_id_seq"') AS next
        `;
        publicId = Number(result[0].next);
      }

      const created = await this.prisma.mockExamParticipant.create({
        data: {
          examId,
          publicId,
          studentId,
          telegramChatId: dto.telegramChatId?.trim() || null,
          firstName,
          lastName,
          phone: dto.phone,
          formData: {},
        },
        select: {
          id: true,
          publicId: true,
          firstName: true,
          lastName: true,
          phone: true,
          telegramChatId: true,
          telegramUsername: true,
          registeredAt: true,
          studentId: true,
          totalScore: true,
          percentage: true,
          passed: true,
          rank: true,
        },
      });

      await this.entityHistoryService.recordCreate({
        entityType: 'MockExamParticipant',
        entityId: created.id,
        newValues: {
          examId,
          firstName,
          lastName,
          phone: dto.phone,
          publicId,
          studentId,
        },
        changedById: userId,
        companyId,
      });

      // If this manual entry is linked to a real DaF student, try to
      // settle the mock fee from their balance right away. Non-fatal:
      // failures here are logged but don't block the registration.
      if (studentId !== null) {
        try {
          await this.mockExamBilling.tryDeductForStudent({
            studentId,
            companyId,
            performedById: userId,
          });
        } catch (err) {
          this.logger.warn(
            `Auto-deduct after manual add failed for student ${studentId}: ${(err as Error).message}`,
          );
        }
      }

      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          "Bu o'quvchi allaqachon imtihonga ro'yxatga olingan",
        );
      }
      throw error;
    }
  }

  /**
   * Promotes an outsider participant to a real DaF student.
   *
   * Reuses `participant.publicId` as the new `Student.id` so the
   * Click/Payme account stays stable across the lifecycle: pre-conversion
   * payments routed through `MockExamGatewayTransaction`; post-conversion
   * payments route through the normal Student.balance flow under the same
   * number. The publicId was originally drawn from `Student_id_seq` so it
   * never collides with existing Student rows.
   */
  async convertToStudent(
    participantId: string,
    dto: ConvertMockParticipantDto,
    companyId: number,
    userId: number,
  ) {
    const participant = await this.prisma.mockExamParticipant.findFirst({
      where: { id: participantId, deletedAt: null },
      select: {
        id: true,
        publicId: true,
        studentId: true,
        firstName: true,
        lastName: true,
        phone: true,
        telegramChatId: true,
        telegramUsername: true,
      },
    });
    if (!participant) {
      throw new NotFoundException('Ishtirokchi topilmadi');
    }
    if (participant.studentId !== null) {
      throw new BadRequestException(
        "Bu ishtirokchi allaqachon o'quvchi (DaF tizimida) — qayta aylantirish kerak emas",
      );
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null, companyId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Filial topilmadi');
    }

    const student = await this.prisma.$transaction(async (tx) => {
      // 1. Defensive double-check: the publicId mustn't collide with any
      //    real Student row. Shouldn't happen by construction (the
      //    publicId came from Student_id_seq), but if it does, fail
      //    loudly rather than corrupting data.
      const collision = await tx.student.findUnique({
        where: { id: participant.publicId },
        select: { id: true },
      });
      if (collision) {
        throw new BadRequestException(
          `O'quvchi #${participant.publicId} allaqachon mavjud — administrator bilan bog'laning`,
        );
      }

      // 2. Create the Student with the participant's publicId as its id.
      const created = await tx.student.create({
        data: {
          id: participant.publicId,
          firstName: participant.firstName,
          lastName: participant.lastName,
          phone: participant.phone,
          telegramChatId: participant.telegramChatId,
          telegram: participant.telegramUsername,
          status: 'ACTIVE',
          isActive: true,
          companyId,
          branches: {
            create: [{ branchId: dto.branchId }],
          },
        },
      });

      // 3. Link the participant to the new student.
      await tx.mockExamParticipant.update({
        where: { id: participant.id },
        data: {
          studentId: created.id,
          convertedAt: new Date(),
          convertedById: userId,
        },
      });

      return created;
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Student',
      entityId: student.id,
      newValues: {
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone,
        source: 'MOCK_PARTICIPANT_CONVERSION',
        mockParticipantId: participant.id,
      },
      changedById: userId,
      companyId,
    });

    return {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      phone: student.phone,
    };
  }

  /**
   * Returns every mock exam this Student has participated in — used by
   * the "Mock imtihonlar" tab on the student profile. Sorted by exam
   * date (most recent first; nulls last).
   */
  async listForStudent(studentId: number) {
    return this.prisma.mockExamParticipant.findMany({
      where: { studentId, deletedAt: null },
      orderBy: [
        { exam: { examDate: { sort: 'desc', nulls: 'last' } } },
        { registeredAt: 'desc' },
      ],
      select: {
        id: true,
        publicId: true,
        registeredAt: true,
        paid: true,
        paidAt: true,
        totalScore: true,
        percentage: true,
        rank: true,
        passed: true,
        exam: {
          select: {
            id: true,
            title: true,
            status: true,
            examDate: true,
            maxScore: true,
            price: true,
            section: { select: { name: true, color: true } },
          },
        },
      },
    });
  }

  /**
   * Admin manually marks a participant as paid when they receive cash, or
   * when a Payme/Click payment was made outside the gateway webhook (rare,
   * but happens during launch / when the bot link wasn't used). Flips
   * `paid=true` on the participant row and records the method + note in
   * EntityHistory for audit. No Transaction is written — this is a
   * registration-fee marker, not a balance-affecting payment.
   */
  async markPaid(
    id: string,
    dto: MarkMockPaidDto,
    companyId: number,
    userId: number,
  ) {
    const participant = await this.prisma.mockExamParticipant.findFirst({
      where: { id, deletedAt: null },
      include: { exam: { select: { price: true, title: true } } },
    });
    if (!participant) {
      throw new NotFoundException('Ishtirokchi topilmadi');
    }
    if (participant.paid) {
      throw new BadRequestException('Bu ishtirokchi allaqachon to\'lagan');
    }
    if (participant.exam.price <= 0) {
      throw new BadRequestException(
        "Bepul imtihon uchun to'lov qabul qilinmaydi",
      );
    }

    const updated = await this.prisma.mockExamParticipant.update({
      where: { id },
      data: { paid: true, paidAt: new Date() },
      select: {
        id: true,
        publicId: true,
        firstName: true,
        lastName: true,
        phone: true,
        telegramChatId: true,
        telegramUsername: true,
        registeredAt: true,
        studentId: true,
        paid: true,
        paidAt: true,
        totalScore: true,
        percentage: true,
        passed: true,
        rank: true,
      },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'MockExamParticipant',
      entityId: id,
      oldValues: { paid: false },
      newValues: {
        paid: true,
        paymentMethod: dto.method,
        ...(dto.note ? { paymentNote: dto.note } : {}),
      },
      changedById: userId,
      companyId,
    });

    this.logger.log(
      `Mock participant ${id} marked paid manually by user ${userId} ` +
        `(method=${dto.method}, exam="${participant.exam.title}")`,
    );

    return updated;
  }

  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.mockExamParticipant.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Ishtirokchi topilmadi');
    }

    await this.prisma.mockExamParticipant.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'MockExamParticipant',
      entityId: id,
      oldValues: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        phone: existing.phone,
      },
      changedById: userId,
      companyId,
    });

    return { message: "Ishtirokchi o'chirildi" };
  }

  private async ensureExam(examId: string) {
    const exam = await this.prisma.mockExam.findFirst({
      where: { id: examId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!exam) {
      throw new NotFoundException('Mock imtihon topilmadi');
    }
    return exam;
  }
}
