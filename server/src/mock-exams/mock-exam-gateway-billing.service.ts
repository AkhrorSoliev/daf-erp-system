import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type GatewayProvider = 'CLICK' | 'PAYME';

/** State semantics mirror ClickTransaction / PaymeTransaction. */
export const GATEWAY_STATE = {
  PREPARED: 1,
  COMPLETED: 2,
  CANCELLED: -1,
  REFUNDED: -2,
} as const;

interface ResolvedMockTarget {
  participantId: string;
  examPrice: number;
  alreadyPaid: boolean;
}

/**
 * Mock-only payment routing. When a Click/Payme webhook arrives with an
 * `account_id` that doesn't match any Student, this service picks up the
 * fallback path: validate against MockExamParticipant.publicId, track
 * gateway-protocol state in MockExamGatewayTransaction, and flip
 * `participant.paid = true` on completion.
 *
 * No Transaction / Payment rows are written for mock-only payments — the
 * canonical "did they pay?" question is answered by
 * `MockExamParticipant.paid` and aggregate revenue is the SUM of
 * `MockExam.price` over paid participants.
 */
@Injectable()
export class MockExamGatewayBillingService {
  private readonly logger = new Logger(MockExamGatewayBillingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Resolves a Click/Payme `account_id` to a mock participant target.
   *
   * Returns null when the publicId doesn't belong to any active mock
   * participant — caller should treat as "user not found".
   */
  async resolveTarget(
    publicId: number,
    expectedAmountSom?: number,
  ): Promise<ResolvedMockTarget | null> {
    // BIR ODAMDA BIR NECHTA IShTIROKCHI BO'LADI. DaF o'quvchisi har bir mock
    // imtihonga o'sha publicId bilan yoziladi, shuning uchun bu yerda
    // `findFirst` ishlatib bo'lmaydi — u tartibsiz (ixtiyoriy) qatorni
    // qaytaradi va odatda ENG ESKISINI oladi. Natijada odam yangi imtihon
    // uchun to'laganda summa eski imtihon narxi bilan solishtirilib,
    // "mos emas" deb rad etilardi.
    const rows = await this.prisma.mockExamParticipant.findMany({
      where: { publicId, deletedAt: null },
      orderBy: { registeredAt: 'desc' },
      select: {
        id: true,
        paid: true,
        feeAmount: true,
        exam: { select: { price: true } },
      },
    });
    if (rows.length === 0) return null;

    // To'lanishi kerak bo'lgan summa: ro'yxatdan o'tishda qotirilgan fee
    // (DaF chegirmasi bilan), eski qatorlarda imtihonning joriy narxi.
    const feeOf = (p: (typeof rows)[number]) => p.feeAmount ?? p.exam.price;
    const unpaid = rows.filter((p) => !p.paid);

    // 1) To'lov summasi bilan AYNAN mos keladigan to'lanmagan ishtirokchi —
    //    to'lov havolasi o'sha summani o'zida saqlaydi, shuning uchun bu eng
    //    ishonchli moslik. Bir nechta mos kelsa, eng yangisi olinadi.
    if (expectedAmountSom != null) {
      const wanted = Math.floor(expectedAmountSom);
      const exact = unpaid.find((p) => feeOf(p) === wanted);
      if (exact) {
        return {
          participantId: exact.id,
          examPrice: feeOf(exact),
          alreadyPaid: false,
        };
      }
    }

    // 2) Summa berilmagan yoki mos kelmadi — eng yangi to'lanmagani.
    if (unpaid.length > 0) {
      return {
        participantId: unpaid[0].id,
        examPrice: feeOf(unpaid[0]),
        alreadyPaid: false,
      };
    }

    // 3) Hammasi to'langan — chaqiruvchi "allaqachon to'langan" deb javob bersin.
    return {
      participantId: rows[0].id,
      examPrice: feeOf(rows[0]),
      alreadyPaid: true,
    };
  }

  /**
   * Shu to'lov mock imtihon uchunmi yoki o'quvchi balansini to'ldirishmi?
   *
   * MUAMMO: bot bergan mock havolasi hisob raqami sifatida `publicId` ni
   * ishlatadi, DaF o'quvchisida esa `publicId === Student.id`. Shuning uchun
   * webhook uni O'QUVCHI deb tanib, pulni balansga yozardi. Agar o'quvchining
   * qarzi bo'lsa, pul o'sha qarzga so'rilardi va imtihon "kutilmoqda" bo'lib
   * qolaverardi — qarzdor o'quvchi mock uchun umuman to'lay olmasdi.
   *
   * QAROR: mock havolasi orqali kelgan pul FAQAT mock uchun ishlatiladi —
   * o'quvchining balansiga ham, qarziga ham tegmaydi.
   *
   * Ajratish belgilari (uchalasi ham bajarilishi shart):
   *   1. shu `publicId` da to'lanmagan, o'chirilmagan ishtirokchi bor;
   *   2. to'lanayotgan summa AYNAN o'sha ishtirokchining narxiga teng;
   *   3. o'quvchi portalidan boshlangan tirik `PaymentIntent` YO'Q — u bor
   *      bo'lsa, demak odam ataylab balans to'ldirmoqda, aralashmaymiz.
   *
   * Uchinchi shart muhim: bo'lmasa, o'quvchi mock narxiga teng summani
   * balansiga to'ldirmoqchi bo'lganda puli imtihonga ketib qolardi.
   */
  async shouldRouteToMock(args: {
    publicId: number;
    amountSom: number;
    provider: GatewayProvider;
    companyId: number;
  }): Promise<boolean> {
    const target = await this.resolveTarget(args.publicId, args.amountSom);
    if (!target || target.alreadyPaid) return false;
    if (target.examPrice <= 0) return false;
    if (Math.floor(args.amountSom) !== target.examPrice) return false;

    const liveIntent = await this.prisma.paymentIntent.findFirst({
      where: {
        studentId: args.publicId,
        companyId: args.companyId,
        provider: args.provider,
        used: false,
        expiresAt: { gt: new Date() },
        amount: Math.floor(args.amountSom),
      },
      select: { id: true },
    });
    if (liveIntent) return false;

    this.logger.log(
      `Mock sifatida yo'naltirildi: publicId=${args.publicId} summa=${args.amountSom} ` +
        `participant=${target.participantId} (${args.provider})`,
    );
    return true;
  }

  async findByExternalId(
    provider: GatewayProvider,
    externalId: string,
    companyId: number,
  ) {
    return this.prisma.mockExamGatewayTransaction.findUnique({
      where: {
        provider_externalId_companyId: { provider, externalId, companyId },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.mockExamGatewayTransaction.findUnique({
      where: { id },
    });
  }

  /**
   * Creates or returns the existing pending transaction for this
   * (provider, externalId) pair. Idempotent — Click/Payme can resend the
   * same Prepare/Create request.
   */
  async findOrCreatePending(args: {
    provider: GatewayProvider;
    externalId: string;
    mockParticipantId: string;
    amount: number;
    amountInSom: number;
    companyId: number;
    clickPaydocId?: bigint;
    paymeTime?: bigint;
  }) {
    const existing = await this.findByExternalId(
      args.provider,
      args.externalId,
      args.companyId,
    );
    if (existing) return existing;

    return this.prisma.mockExamGatewayTransaction.create({
      data: {
        provider: args.provider,
        externalId: args.externalId,
        mockParticipantId: args.mockParticipantId,
        amount: args.amount,
        amountInSom: args.amountInSom,
        state: GATEWAY_STATE.PREPARED,
        preparedAt: new Date(),
        clickPaydocId: args.clickPaydocId ?? null,
        paymeTime: args.paymeTime ?? null,
        companyId: args.companyId,
      },
    });
  }

  /**
   * Marks a gateway transaction as completed AND flips the linked mock
   * participant's `paid` flag. Both writes happen in a Serializable
   * transaction so they're atomic.
   */
  async markCompleted(gatewayTxnId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const txn = await tx.mockExamGatewayTransaction.update({
          where: { id: gatewayTxnId },
          data: {
            state: GATEWAY_STATE.COMPLETED,
            completedAt: new Date(),
          },
        });
        await tx.mockExamParticipant.update({
          where: { id: txn.mockParticipantId },
          data: { paid: true, paidAt: new Date() },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );
  }

  /**
   * Cancels a gateway transaction. If it had already been completed, also
   * un-marks the participant as paid (state = -2 refunded) so the
   * participant returns to "pending payment" state.
   */
  async markCancelled(
    gatewayTxnId: string,
    options: { wasPerformed: boolean; reason?: number },
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const txn = await tx.mockExamGatewayTransaction.update({
          where: { id: gatewayTxnId },
          data: {
            state: options.wasPerformed
              ? GATEWAY_STATE.REFUNDED
              : GATEWAY_STATE.CANCELLED,
            cancelledAt: new Date(),
            reason: options.reason ?? null,
          },
        });
        if (options.wasPerformed) {
          await tx.mockExamParticipant.update({
            where: { id: txn.mockParticipantId },
            data: { paid: false, paidAt: null },
          });
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );
  }

  /**
   * Stamps an error on a pending transaction (e.g. Click prepare expired
   * or sent an explicit error code). Does NOT affect the participant.
   */
  async markErrored(
    gatewayTxnId: string,
    error: number,
    errorNote: string,
  ): Promise<void> {
    await this.prisma.mockExamGatewayTransaction.update({
      where: { id: gatewayTxnId },
      data: {
        state: GATEWAY_STATE.CANCELLED,
        cancelledAt: new Date(),
        error,
        errorNote,
      },
    });
  }

  /** Used by Payme's GetStatement to merge into the statement response. */
  async listInTimeRange(
    provider: GatewayProvider,
    companyId: number,
    fromMs: number,
    toMs: number,
  ) {
    return this.prisma.mockExamGatewayTransaction.findMany({
      where: {
        provider,
        companyId,
        createdAt: {
          gte: new Date(fromMs),
          lte: new Date(toMs),
        },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        mockParticipant: { select: { publicId: true } },
      },
    });
  }
}
