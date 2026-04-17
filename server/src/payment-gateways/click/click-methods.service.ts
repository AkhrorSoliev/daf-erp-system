import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod, PaymentSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../../payments/payments.service';
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
  ) {}

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

    if (!student) {
      return clickError(clickTransId, merchantTransId, CLICK_USER_NOT_FOUND);
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

    if (!txn || txn.companyId !== companyId) {
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
          const erpPayment = await this.payments.createFromExternal(
            {
              studentId: txn.studentId,
              amount: txn.amountInSom,
              method: PaymentMethod.CLICK,
              externalId: String(txn.clickTransId),
              source: PaymentSource.GATEWAY_WEBHOOK,
              companyId,
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
}
