import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCallerMayWriteForStudent,
} from '../common/auth/financial-write-scope';
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

    // Processing is what actually pays the money out; approving/rejecting
    // another branch's refund by id was reachable with `companyId` alone.
    await assertCallerMayWriteForStudent(
      this.prisma,
      userId,
      refund.studentId,
      companyId,
    );

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

      // F-16: bound the approved amount. `requestedAmount` was computed by the
      // eligibility logic at create time (paid − consumed − prior refunds); a
      // completion must never pay out MORE than that — otherwise an admin (or a
      // direct API call) could drive the student balance arbitrarily negative
      // and disburse real money beyond what is owed. Partial approval (less) is
      // allowed.
      // F-6: a 0 (or negative) approval is not a refund — reject it instead of
      // writing a 0-value REFUND ledger row and flipping the contract to
      // REFUNDED for nothing. When there is nothing to return (e.g. the course
      // is ≥50% consumed so requestedAmount is 0), the admin must REJECT the
      // request rather than "complete" it.
      if (approvedAmount <= 0) {
        throw new BadRequestException(
          "Refund summasi 0 dan katta bo'lishi kerak — qaytariladigan mablag' yo'q (so'rovni rad eting)",
        );
      }
      if (approvedAmount > refund.requestedAmount) {
        throw new BadRequestException(
          `Tasdiqlangan summa so'ralgan summadan (${refund.requestedAmount} so'm) oshmasligi kerak`,
        );
      }

      // Calculate due date (15 business days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 21); // ~15 business days

      // Atomic: balance deduction + (optional) contract update + refund update
      // all-or-nothing. Contract update only runs for legacy refunds that were
      // tied to a Contract row — new refunds are enrollment-based.
      return this.prisma.$transaction(
        async (tx) => {
          await this.transactionsService.recordRefund(
            {
              studentId: refund.studentId,
              amount: approvedAmount,
              refundId: refund.id,
              contractId: refund.contractId ?? undefined,
              companyId: refund.companyId,
              performedById: userId,
            },
            tx,
          );

          if (refund.contractId) {
            await tx.contract.update({
              where: { id: refund.contractId },
              data: {
                status: ContractStatus.REFUNDED,
                paidAmount: { decrement: approvedAmount },
              },
            });
          }

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

    await assertCallerMayWriteForStudent(
      this.prisma,
      params.performedById,
      refund.studentId,
      params.companyId,
    );

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
        reversedAt: null,
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
        // explicitly if they want to reopen the contract. Only runs for
        // legacy refunds tied to a Contract; enrollment-based refunds skip
        // this step.
        if (approvedAmount > 0 && refund.contractId) {
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
