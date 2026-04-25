import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { ContractStatus, Prisma, RefundStatus } from '@prisma/client';
import { ProcessRefundDto } from './dto/process-refund.dto';
import {
  assertValidTransition,
  REFUND_TRANSITIONS,
} from '../common/finance/status-transitions';

@Injectable()
export class RefundsProcessService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
  ) {}

  /**
   * Approve or reject a refund request, then process the actual refund.
   */
  async process(
    id: string,
    dto: ProcessRefundDto,
    userId: number,
    companyId: number,
  ) {
    const refund = await this.prisma.refund.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        studentId: true,
        contractId: true,
        requestedAmount: true,
        status: true,
        companyId: true,
      },
    });
    if (!refund) throw new NotFoundException('Refund topilmadi');

    if (dto.status === RefundStatus.REJECTED) {
      assertValidTransition(
        'Refund',
        REFUND_TRANSITIONS,
        refund.status,
        RefundStatus.REJECTED,
      );
      return this.prisma.refund.update({
        where: { id },
        data: {
          status: RefundStatus.REJECTED,
          reason: dto.reason,
          processedById: userId,
          processedAt: new Date(),
        },
      });
    }

    if (dto.status === RefundStatus.COMPLETED) {
      assertValidTransition(
        'Refund',
        REFUND_TRANSITIONS,
        refund.status,
        RefundStatus.COMPLETED,
      );

      const approvedAmount = dto.approvedAmount ?? refund.requestedAmount;

      // Calculate due date (15 business days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 21); // ~15 business days

      // Atomic: balance deduction + contract update + refund update all-or-nothing
      return this.prisma.$transaction(
        async (tx) => {
          await this.transactionsService.recordRefund(
            {
              studentId: refund.studentId,
              amount: approvedAmount,
              refundId: refund.id,
              contractId: refund.contractId,
              companyId: refund.companyId,
              performedById: userId,
            },
            tx,
          );

          await tx.contract.update({
            where: { id: refund.contractId },
            data: {
              status: ContractStatus.REFUNDED,
              paidAmount: { decrement: approvedAmount },
            },
          });

          return tx.refund.update({
            where: { id },
            data: {
              status: RefundStatus.COMPLETED,
              approvedAmount,
              processedById: userId,
              processedAt: new Date(),
              dueDate,
              ...(dto.refundMethod && { refundMethod: dto.refundMethod }),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }

    // For APPROVED/PROCESSING status
    assertValidTransition(
      'Refund',
      REFUND_TRANSITIONS,
      refund.status,
      dto.status,
    );
    return this.prisma.refund.update({
      where: { id },
      data: {
        status: dto.status,
        approvedAmount: dto.approvedAmount,
        processedById: userId,
        processedAt: new Date(),
      },
    });
  }

  /**
   * Reverse a COMPLETED refund — posted-row-immutable rule: we don't edit
   * the Refund row, we walk back the ledger entry and restore the contract
   * state it mutated. Intended for "we approved by mistake" scenarios.
   *
   * Guardrails:
   *   - Refund must belong to caller's company
   *   - Refund must be COMPLETED (no-op on earlier states)
   *   - Underlying REFUND Transaction must exist and not already be reversed
   */
  async reverse(
    id: string,
    params: { reason?: string; performedById: number; companyId: number },
  ) {
    const refund = await this.prisma.refund.findFirst({
      where: { id, companyId: params.companyId },
      select: {
        id: true,
        studentId: true,
        contractId: true,
        approvedAmount: true,
        status: true,
      },
    });
    if (!refund) throw new NotFoundException('Refund topilmadi');
    if (refund.status !== RefundStatus.COMPLETED) {
      throw new BadRequestException(
        'Faqat yakunlangan refundni bekor qilish mumkin',
      );
    }

    const ledgerEntry = await this.prisma.transaction.findFirst({
      where: {
        refundId: id,
        type: 'REFUND',
        reversedTransactionId: null,
      },
      select: { id: true },
    });
    if (!ledgerEntry) {
      throw new BadRequestException(
        'Refund ledger yozuvi topilmadi yoki avvalroq bekor qilingan',
      );
    }

    const approvedAmount = refund.approvedAmount ?? 0;

    return this.prisma.$transaction(
      async (tx) => {
        await this.transactionsService.reverseTransaction(
          ledgerEntry.id,
          {
            performedById: params.performedById,
            reason: params.reason ?? 'Refund bekor qilindi',
          },
          tx,
        );

        // Undo the contract paidAmount decrement done by the original
        // refund. Contract status stays REFUNDED — operators change it
        // explicitly if they want to reopen the contract.
        if (approvedAmount > 0) {
          await tx.contract.update({
            where: { id: refund.contractId },
            data: { paidAmount: { increment: approvedAmount } },
          });
        }

        return { reversedRefundId: id, amount: approvedAmount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
