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
  ): Promise<ResolvedMockTarget | null> {
    const participant = await this.prisma.mockExamParticipant.findFirst({
      where: { publicId, deletedAt: null },
      select: {
        id: true,
        paid: true,
        feeAmount: true,
        exam: { select: { price: true } },
      },
    });
    if (!participant) return null;
    return {
      participantId: participant.id,
      // The amount the gateway must charge for THIS participant — the fee
      // locked in at registration (after any DaF discount), falling back to
      // the exam's current price for legacy rows. Must equal the amount
      // embedded in the payment deep-link or the webhook rejects the pay.
      examPrice: participant.feeAmount ?? participant.exam.price,
      alreadyPaid: participant.paid,
    };
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
