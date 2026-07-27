import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod, PaymentSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../../payments/payments.service';
import {
  GATEWAY_STATE,
  MockExamGatewayBillingService,
} from '../../mock-exams/mock-exam-gateway-billing.service';
import {
  CLICK_ALREADY_PAID,
  CLICK_INVALID_AMOUNT,
  CLICK_TRANSACTION_CANCELLED,
  CLICK_TRANSACTION_NOT_FOUND,
  CLICK_USER_NOT_FOUND,
  clickError,
} from './click-errors';
import type {
  ClickPrepareRequest,
  ClickCompleteRequest,
  ClickWebhookResponse,
} from './click.types';

/** Prepared transactions older than this are treated as cancelled. */
const PREPARE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Implements the two-phase Click SHOP-API business logic:
 * Prepare (action=0) and Complete (action=1).
 *
 * Each method receives validated request body, executes business logic,
 * and returns a Click webhook response object.
 */
@Injectable()
export class ClickMethodsService {
  private readonly logger = new Logger(ClickMethodsService.name);

  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private mockGateway: MockExamGatewayBillingService,
  ) {}

  private isPrepareExpired(prepareTime: Date | null): boolean {
    if (!prepareTime) return false;
    return Date.now() - prepareTime.getTime() > PREPARE_TIMEOUT_MS;
  }

  private async cancelExpired(id: string): Promise<void> {
    await this.prisma.clickTransaction.update({
      where: { id },
      data: { status: -1, error: -9, errorNote: 'Transaction expired' },
    });
  }

  // ─── Prepare (action=0) ────────────────────────────────────────

  async prepare(
    body: ClickPrepareRequest,
    companyId: number,
  ): Promise<ClickWebhookResponse> {
    const clickTransId = Number(body.click_trans_id);
    const merchantTransId = String(body.merchant_trans_id);
    const studentId = parseInt(merchantTransId, 10);
    const amount = Number(body.amount);

    // Validate amount (minimum 1000 so'm; Click sends amounts in so'm)
    if (!amount || amount < 1000) {
      return clickError(clickTransId, merchantTransId, CLICK_INVALID_AMOUNT);
    }

    // Validate student
    if (isNaN(studentId)) {
      return clickError(clickTransId, merchantTransId, CLICK_USER_NOT_FOUND);
    }

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null, companyId },
      select: { id: true },
    });

    // Mock imtihon yo'li ikki holatda tanlanadi:
    //   a) mos Student umuman yo'q (tashqi ishtirokchi — publicId umumiy
    //      ketma-ketlikdan, lekin Student qatori yo'q);
    //   b) Student bor, LEKIN to'lov aynan mock havolasi orqali kelgan
    //      (`shouldRouteToMock` — summa to'lanmagan ishtirokchi narxiga
    //      teng va portal PaymentIntent'i yo'q).
    //
    // (b) shart shuning uchun kerakki, DaF o'quvchisida publicId = Student.id
    // bo'lgani sababli mock to'lovi balansga tushib ketardi va qarzi bor
    // o'quvchida qarzga so'rilib, imtihon to'lanmagan qolardi.
    const routeToMock =
      !student ||
      (await this.mockGateway.shouldRouteToMock({
        publicId: studentId,
        amountSom: amount,
        provider: 'CLICK',
        companyId,
      }));

    if (routeToMock) {
      return this.preparePathMock({
        publicId: studentId,
        clickTransId,
        merchantTransId,
        amount,
        clickPaydocId: body.click_paydoc_id,
        companyId,
      });
    }

    // Verify amount matches a live payment intent (if any exists)
    const intent = await this.prisma.paymentIntent.findFirst({
      where: {
        studentId,
        companyId,
        provider: 'CLICK',
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (intent && intent.amount !== Math.floor(amount)) {
      return clickError(clickTransId, merchantTransId, CLICK_INVALID_AMOUNT);
    }

    // Check for existing transaction with same clickTransId
    const existing = await this.prisma.clickTransaction.findUnique({
      where: {
        unique_click_transaction: {
          clickTransId: BigInt(clickTransId),
          companyId,
        },
      },
    });

    if (existing) {
      if (existing.status === 2) {
        return clickError(clickTransId, merchantTransId, CLICK_ALREADY_PAID);
      }
      if (existing.status === -1) {
        return clickError(
          clickTransId,
          merchantTransId,
          CLICK_TRANSACTION_CANCELLED,
        );
      }
      // Idempotent: return existing prepared transaction
      if (existing.status === 1) {
        if (this.isPrepareExpired(existing.prepareTime)) {
          await this.cancelExpired(existing.id);
          return clickError(
            clickTransId,
            merchantTransId,
            CLICK_TRANSACTION_CANCELLED,
          );
        }
        return {
          click_trans_id: clickTransId,
          merchant_trans_id: merchantTransId,
          merchant_prepare_id: existing.id,
          merchant_confirm_id: null,
          error: 0,
          error_note: 'Success',
        };
      }
    }

    // Create new ClickTransaction (status=1 = prepared)
    const txn = await this.prisma.clickTransaction.create({
      data: {
        clickTransId: BigInt(clickTransId),
        clickPaydocId: BigInt(body.click_paydoc_id),
        amount,
        amountInSom: Math.floor(amount),
        status: 1,
        studentId,
        prepareTime: new Date(),
        companyId,
      },
    });

    return {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: txn.id,
      merchant_confirm_id: null,
      error: 0,
      error_note: 'Success',
    };
  }

  // ─── Complete (action=1) ───────────────────────────────────────

  async complete(
    body: ClickCompleteRequest,
    companyId: number,
  ): Promise<ClickWebhookResponse> {
    const clickTransId = Number(body.click_trans_id);
    const merchantTransId = String(body.merchant_trans_id);
    const merchantPrepareId = String(body.merchant_prepare_id);

    // Look up the prepared ClickTransaction
    const txn = await this.prisma.clickTransaction.findUnique({
      where: { id: merchantPrepareId },
    });

    // Not a Student-side transaction → try the mock fallback.
    if (!txn) {
      const mockTxn = await this.mockGateway.findById(merchantPrepareId);
      if (mockTxn && mockTxn.companyId === companyId) {
        return this.completePathMock({
          mockTxn,
          clickTransId,
          merchantTransId,
          body,
        });
      }
      return clickError(
        clickTransId,
        merchantTransId,
        CLICK_TRANSACTION_NOT_FOUND,
      );
    }

    if (txn.companyId !== companyId) {
      return clickError(
        clickTransId,
        merchantTransId,
        CLICK_TRANSACTION_NOT_FOUND,
      );
    }

    // Already completed → idempotent
    if (txn.status === 2) {
      return {
        click_trans_id: clickTransId,
        merchant_trans_id: merchantTransId,
        merchant_prepare_id: txn.id,
        merchant_confirm_id: txn.id,
        error: 0,
        error_note: 'Success',
      };
    }

    // Not in prepared state
    if (txn.status !== 1) {
      if (txn.status === -1) {
        return clickError(
          clickTransId,
          merchantTransId,
          CLICK_TRANSACTION_CANCELLED,
        );
      }
      return clickError(
        clickTransId,
        merchantTransId,
        CLICK_TRANSACTION_NOT_FOUND,
      );
    }

    // Reject late Complete on a stale Prepare
    if (this.isPrepareExpired(txn.prepareTime)) {
      await this.cancelExpired(txn.id);
      return clickError(
        clickTransId,
        merchantTransId,
        CLICK_TRANSACTION_CANCELLED,
      );
    }

    // If Click sends error < 0, cancel the transaction
    if (body.error < 0) {
      await this.prisma.clickTransaction.update({
        where: { id: txn.id },
        data: {
          status: -1,
          error: body.error,
          errorNote: body.error_note || 'Cancelled by Click',
        },
      });

      return {
        click_trans_id: clickTransId,
        merchant_trans_id: merchantTransId,
        merchant_prepare_id: txn.id,
        merchant_confirm_id: null,
        error: 0,
        error_note: 'Success',
      };
    }

    // Validate amount matches
    const requestAmount = Number(body.amount);
    if (Math.floor(requestAmount) !== txn.amountInSom) {
      return clickError(clickTransId, merchantTransId, CLICK_INVALID_AMOUNT);
    }

    // Create ERP Payment + update ClickTransaction atomically
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const branchId = await this.payments.resolveStudentBranchId(
            txn.studentId,
            companyId,
            tx,
          );

          const erpPayment = await this.payments.createFromExternal(
            {
              studentId: txn.studentId,
              amount: txn.amountInSom,
              method: PaymentMethod.CLICK,
              externalId: String(txn.clickTransId),
              source: PaymentSource.GATEWAY_WEBHOOK,
              companyId,
              ...(branchId !== null && { branchId }),
            },
            tx,
          );

          await tx.clickTransaction.update({
            where: { id: txn.id },
            data: {
              status: 2,
              completeTime: new Date(),
              paymentId: erpPayment.id,
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 15000,
        },
      );

      return {
        click_trans_id: clickTransId,
        merchant_trans_id: merchantTransId,
        merchant_prepare_id: txn.id,
        merchant_confirm_id: txn.id,
        error: 0,
        error_note: 'Success',
      };
    } catch (err) {
      this.logger.error(
        `Click Complete failed for clickTransId=${clickTransId}: ${err}`,
      );
      throw err;
    }
  }

  // ─── Mock-only fallback paths ──────────────────────────────────

  /** Prepare path for non-DaF mock participants. */
  private async preparePathMock(args: {
    publicId: number;
    clickTransId: number;
    merchantTransId: string;
    amount: number;
    clickPaydocId: number | string;
    companyId: number;
  }): Promise<ClickWebhookResponse> {
    const target = await this.mockGateway.resolveTarget(args.publicId);
    if (!target) {
      return clickError(
        args.clickTransId,
        args.merchantTransId,
        CLICK_USER_NOT_FOUND,
      );
    }
    if (target.alreadyPaid) {
      return clickError(
        args.clickTransId,
        args.merchantTransId,
        CLICK_ALREADY_PAID,
      );
    }
    // Mock fee must match exactly. Free mocks never reach this code path
    // (the bot doesn't show a payment prompt for price=0).
    if (Math.floor(args.amount) !== target.examPrice) {
      return clickError(
        args.clickTransId,
        args.merchantTransId,
        CLICK_INVALID_AMOUNT,
      );
    }

    const existing = await this.mockGateway.findByExternalId(
      'CLICK',
      String(args.clickTransId),
      args.companyId,
    );
    if (existing) {
      if (existing.state === GATEWAY_STATE.COMPLETED) {
        return clickError(
          args.clickTransId,
          args.merchantTransId,
          CLICK_ALREADY_PAID,
        );
      }
      if (existing.state === GATEWAY_STATE.CANCELLED) {
        return clickError(
          args.clickTransId,
          args.merchantTransId,
          CLICK_TRANSACTION_CANCELLED,
        );
      }
      if (existing.state === GATEWAY_STATE.PREPARED) {
        if (this.isPrepareExpired(existing.preparedAt)) {
          await this.mockGateway.markErrored(
            existing.id,
            -9,
            'Transaction expired',
          );
          return clickError(
            args.clickTransId,
            args.merchantTransId,
            CLICK_TRANSACTION_CANCELLED,
          );
        }
        return {
          click_trans_id: args.clickTransId,
          merchant_trans_id: args.merchantTransId,
          merchant_prepare_id: existing.id,
          merchant_confirm_id: null,
          error: 0,
          error_note: 'Success',
        };
      }
    }

    const txn = await this.mockGateway.findOrCreatePending({
      provider: 'CLICK',
      externalId: String(args.clickTransId),
      mockParticipantId: target.participantId,
      amount: args.amount,
      amountInSom: Math.floor(args.amount),
      clickPaydocId: BigInt(args.clickPaydocId),
      companyId: args.companyId,
    });

    return {
      click_trans_id: args.clickTransId,
      merchant_trans_id: args.merchantTransId,
      merchant_prepare_id: txn.id,
      merchant_confirm_id: null,
      error: 0,
      error_note: 'Success',
    };
  }

  /** Complete path for non-DaF mock participants. */
  private async completePathMock(args: {
    mockTxn: { id: string; state: number; amountInSom: number; preparedAt: Date | null };
    clickTransId: number;
    merchantTransId: string;
    body: ClickCompleteRequest;
  }): Promise<ClickWebhookResponse> {
    const { mockTxn, clickTransId, merchantTransId, body } = args;

    // Idempotent
    if (mockTxn.state === GATEWAY_STATE.COMPLETED) {
      return {
        click_trans_id: clickTransId,
        merchant_trans_id: merchantTransId,
        merchant_prepare_id: mockTxn.id,
        merchant_confirm_id: mockTxn.id,
        error: 0,
        error_note: 'Success',
      };
    }

    if (mockTxn.state !== GATEWAY_STATE.PREPARED) {
      if (
        mockTxn.state === GATEWAY_STATE.CANCELLED ||
        mockTxn.state === GATEWAY_STATE.REFUNDED
      ) {
        return clickError(
          clickTransId,
          merchantTransId,
          CLICK_TRANSACTION_CANCELLED,
        );
      }
      return clickError(
        clickTransId,
        merchantTransId,
        CLICK_TRANSACTION_NOT_FOUND,
      );
    }

    if (this.isPrepareExpired(mockTxn.preparedAt)) {
      await this.mockGateway.markErrored(
        mockTxn.id,
        -9,
        'Transaction expired',
      );
      return clickError(
        clickTransId,
        merchantTransId,
        CLICK_TRANSACTION_CANCELLED,
      );
    }

    if (body.error < 0) {
      await this.mockGateway.markErrored(
        mockTxn.id,
        body.error,
        body.error_note || 'Cancelled by Click',
      );
      return {
        click_trans_id: clickTransId,
        merchant_trans_id: merchantTransId,
        merchant_prepare_id: mockTxn.id,
        merchant_confirm_id: null,
        error: 0,
        error_note: 'Success',
      };
    }

    if (Math.floor(Number(body.amount)) !== mockTxn.amountInSom) {
      return clickError(clickTransId, merchantTransId, CLICK_INVALID_AMOUNT);
    }

    await this.mockGateway.markCompleted(mockTxn.id);

    return {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: mockTxn.id,
      merchant_confirm_id: mockTxn.id,
      error: 0,
      error_note: 'Success',
    };
  }
}
