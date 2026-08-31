import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MockExamStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  studentBranchWhere,
} from '../common/finance/report-branch-scope';
import { EntityHistoryService } from '../common/entity-history';
import { MockExamBillingService } from './mock-exam-billing.service';
import { AddManualParticipantDto } from './dto/add-manual-participant.dto';
import { ConvertMockParticipantDto } from './dto/convert-mock-participant.dto';
import {
  ParticipantsQueryDto,
  type ParticipantPaidStatus,
} from './dto/participants-query.dto';
import { equalsOrIn } from '../common/dto/to-array';
import { MarkMockPaidDto } from './dto/mark-mock-paid.dto';
import { resolveParticipantFee } from './mock-exam-pricing.util';

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
/**
 * `cash` — to'lanmagan, lekin formada naqd niyati belgilangan; `pending` —
 * to'lanmagan va bunday belgisi yo'q; `paid` — yopilgan.
 */
const CASH_INTENT: Prisma.MockExamParticipantWhereInput = {
  formData: { path: ['__payIntent'], equals: 'CASH' },
};

function paidStatusWhere(
  status: ParticipantPaidStatus,
): Prisma.MockExamParticipantWhereInput {
  if (status === 'paid') return { paid: true };
  if (status === 'cash') return { paid: false, formData: CASH_INTENT.formData };
  return { paid: false, NOT: CASH_INTENT };
}

@Injectable()
export class MockExamParticipantsService {
  private readonly logger = new Logger(MockExamParticipantsService.name);

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private mockExamBilling: MockExamBillingService,
    private eventEmitter: EventEmitter2,
  ) {}

  async list(
    examId: string,
    query: ParticipantsQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    await this.ensureExam(examId, companyId, branchIds);

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
    if (query.examTime?.length) {
      where.examTime = equalsOrIn(query.examTime);
    }
    if (query.level?.length) {
      where.level = equalsOrIn(query.level);
    }
    // Payment-status filter. `cash` = unpaid with a cash intent marker in
    // formData; `pending` = unpaid without it; `paid` = settled. Each is a
    // COMPOSITE predicate, so several selected statuses are OR'd — and the OR
    // is nested under AND because the free-text search already owns `where.OR`.
    if (query.paidStatus?.length) {
      where.AND = [
        ...((where.AND as Prisma.MockExamParticipantWhereInput[]) ?? []),
        { OR: query.paidStatus.map(paidStatusWhere) },
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
          level: true,
          examTime: true,
          feeAmount: true,
          formData: true,
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
    branchIds: ReportBranchIds,
  ) {
    const exam = await this.ensureExam(examId, companyId, branchIds);
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

    // Pricing for the DaF discount.
    const pricing = await this.prisma.mockExam.findUnique({
      where: { id: examId },
      select: { price: true, studentPrice: true },
    });
    const examPrice = pricing?.price ?? 0;
    const studentPrice = pricing?.studentPrice ?? null;

    try {
      // Resolve the DaF student link. An explicit `studentId` picked by the
      // admin wins; otherwise auto-detect by phone (the most reliable
      // signal for manual entries). A matched student reuses their
      // Student.id as the publicId so mock results show up on the student
      // profile and payments route via the normal balance flow, and the
      // DaF mock discount applies.
      let publicId: number;
      let studentId: number | null = null;

      if (dto.studentId != null) {
        const student = await this.prisma.student.findFirst({
          where: { id: dto.studentId, deletedAt: null, companyId },
          select: { id: true },
        });
        if (!student) {
          throw new BadRequestException("Tanlangan o'quvchi topilmadi");
        }
        publicId = student.id;
        studentId = student.id;
      } else {
        const existingStudent = await this.prisma.student.findFirst({
          where: { phone: dto.phone, deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
        if (existingStudent) {
          publicId = existingStudent.id;
          studentId = existingStudent.id;
        } else {
          // Outsider — allocate a fresh public id from the shared Student
          // sequence. NO Student row is created (mock participants aren't
          // students). The id is later promoted to a real Student.id only
          // if an admin explicitly converts the participant to a student.
          const result = await this.prisma.$queryRaw<{ next: bigint }[]>`
            SELECT nextval('"Student_id_seq"') AS next
          `;
          publicId = Number(result[0].next);
        }
      }

      const feeAmount = resolveParticipantFee(
        { price: examPrice, studentPrice },
        studentId !== null,
      );

      const created = await this.prisma.mockExamParticipant.create({
        data: {
          examId,
          publicId,
          studentId,
          level: dto.level ?? null,
          examTime: dto.examTime ?? null,
          feeAmount,
          companyId,
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
          level: true,
          examTime: true,
          feeAmount: true,
          paid: true,
          paidAt: true,
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

      // A DaF student's balance is NOT touched here. It used to be settled
      // on the spot "to save them a payment step", which meant a student who
      // had funds never got asked — and the admin adding them had no idea
      // money had just left the student's lesson balance. The fee is
      // collected the same way it is for everyone else: cash at the desk
      // (`markPaid`) or Payme/Click against the participant's publicId.

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
    branchIds: ReportBranchIds,
  ) {
    // Branch isolation runs through the participant's EXAM — `companyId` alone
    // is not a boundary once there is more than one branch.
    await this.ensureParticipantInScope(participantId, companyId, branchIds);

    const participant = await this.prisma.mockExamParticipant.findFirst({
      where: { id: participantId, deletedAt: null, companyId },
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
  async listForStudent(
    studentId: number,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    // Gated on the STUDENT — this is the student's own exam history, so branch
    // access follows the student rather than each exam.
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        companyId,
        deletedAt: null,
        ...studentBranchWhere(branchIds),
      },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    return this.prisma.mockExamParticipant.findMany({
      where: { studentId, deletedAt: null, companyId },
      orderBy: [
        { exam: { examDate: { sort: 'desc', nulls: 'last' } } },
        { registeredAt: 'desc' },
      ],
      select: {
        id: true,
        publicId: true,
        registeredAt: true,
        level: true,
        feeAmount: true,
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
    branchIds: ReportBranchIds,
  ) {
    // Branch isolation runs through the participant's EXAM — `companyId` alone
    // is not a boundary once there is more than one branch.
    await this.ensureParticipantInScope(id, companyId, branchIds);

    const participant = await this.prisma.mockExamParticipant.findFirst({
      where: { id, deletedAt: null, companyId },
      include: { exam: { select: { price: true, title: true } } },
    });
    if (!participant) {
      throw new NotFoundException('Ishtirokchi topilmadi');
    }
    if (participant.paid) {
      throw new BadRequestException("Bu ishtirokchi allaqachon to'lagan");
    }
    // Guard on the participant's locked-in fee (after any DaF discount),
    // falling back to the exam price for legacy rows.
    const fee = participant.feeAmount ?? participant.exam.price;
    if (fee <= 0) {
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
        level: true,
        examTime: true,
        feeAmount: true,
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

    // Notify the participant on Telegram that their payment was accepted.
    // Handled by a listener in TelegramModule (avoids a circular import).
    // Skipped downstream when there's no telegramChatId (manual entries).
    this.eventEmitter.emit('mock.participant.paid', {
      telegramChatId: updated.telegramChatId,
      publicId: updated.publicId,
      examTitle: participant.exam.title,
      feeAmount: updated.feeAmount ?? participant.exam.price,
    });

    return updated;
  }

  async remove(
    id: string,
    companyId: number,
    userId: number,
    branchIds: ReportBranchIds,
  ) {
    // Branch isolation runs through the participant's EXAM — `companyId` alone
    // is not a boundary once there is more than one branch.
    await this.ensureParticipantInScope(id, companyId, branchIds);

    const existing = await this.prisma.mockExamParticipant.findFirst({
      where: { id, deletedAt: null, companyId },
    });
    if (!existing) {
      throw new NotFoundException('Ishtirokchi topilmadi');
    }

    // Give the money back BEFORE the row disappears. A removed registration
    // that keeps its fee is money the centre holds for nothing — and because
    // the per-exam unique index only counts live rows, the same person can
    // register again and be charged twice over.
    const refunded = await this.mockExamBilling.refundParticipantFee(
      id,
      userId,
    );

    await this.prisma.mockExamParticipant.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    if (refunded > 0) {
      this.logger.log(
        `Participant ${id} removed — ${refunded} so'm returned to balance`,
      );
    }

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

    return {
      message:
        refunded > 0
          ? `Ishtirokchi o'chirildi, ${refunded.toLocaleString('ru-RU')} so'm balansga qaytarildi`
          : "Ishtirokchi o'chirildi",
      refunded,
    };
  }

  /**
   * The one gate for everything reached through an exam.
   *
   * It used to be `where: { id: examId, deletedAt: null }` — no company, no
   * branch. Every participant read and write hung off it, so an exam id from
   * another company was enough to list its participants, mark one paid, convert
   * one into a student or delete one. The methods below already RECEIVED
   * `companyId`; they just never used it in the lookup.
   *
   * Company isolation via `MockExam.companyId`; branch isolation via the exam's
   * own branch. A `branchId = null` exam is legacy/unassigned and stays visible
   * to every branch on purpose — it belongs to none, so hiding it would strand
   * it where nobody could assign it. It is excluded from branch FINANCIAL
   * totals separately (see `revenueSummary`), which is what keeps
   * `Σ(branches) + unassigned == company` true.
   */
  private async ensureExam(
    examId: string,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    const exam = await this.prisma.mockExam.findFirst({
      where: {
        id: examId,
        deletedAt: null,
        companyId,
        ...(branchIds == null
          ? {}
          : { OR: [{ branchId: { in: branchIds } }, { branchId: null }] }),
      },
      select: { id: true, status: true, branchId: true },
    });
    if (!exam) {
      throw new NotFoundException('Mock imtihon topilmadi');
    }
    return exam;
  }

  /**
   * Participant gate — resolves through the participant's exam so the same
   * company/branch rule applies to `markPaid`, `convertToStudent` and `remove`,
   * all of which were `where: { id, deletedAt: null }`.
   */
  private async ensureParticipantInScope(
    id: string,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    const participant = await this.prisma.mockExamParticipant.findFirst({
      where: { id, deletedAt: null, companyId },
      select: { id: true, examId: true },
    });
    if (!participant) {
      throw new NotFoundException('Ishtirokchi topilmadi');
    }
    await this.ensureExam(participant.examId, companyId, branchIds);
    return participant;
  }
}
