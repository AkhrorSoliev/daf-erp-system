import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SmsMessageType } from '@prisma/client';
import { loadContactPhone } from '../balance-notices/load-transfer-state';
import { tashkentDateStr } from '../common/date/tashkent';
import { tryResolveStudentBranchId } from '../common/finance/resolve-branch';
import { PrismaService } from '../prisma/prisma.service';
import { refundReceiptPdfUrl } from '../receipts/receipt-urls';
import { SmsService } from '../sms/sms.service';
import { describeError } from '../telegram-digest/telegram-send';
import {
  REFUND_CANCELLED_EVENT,
  REFUND_HANDED_OVER_EVENT,
  REFUND_REQUESTED_EVENT,
  type RefundEventPayload,
} from './refund-events';
import {
  refundCancelledText,
  refundHandedOverText,
  refundRequestedText,
} from './refund-student-text';

interface Facts {
  student: { firstName: string; balance: number };
  refund: {
    approvedAmount: number | null;
    requestedAmount: number;
    dueDate: Date | null;
    refundMethod: string | null;
    handedOverAt: Date | null;
    cancelReason: string | null;
  };
  phone: string | null;
}

/**
 * Tells the student at once, on Telegram, that their refund request was
 * opened, handed over or cancelled (spec §5.4, ADR-0077 — an addition to
 * ADR-0025's instant list, like the payment receipt). Pattern of
 * `PaymentEventsListener`: SmsService writes the SmsMessage row and the
 * history line; a student without a linked chat is skipped; an error is
 * logged and swallowed, so a message can never affect the refund.
 */
@Injectable()
export class RefundStudentMessagesListener {
  private readonly logger = new Logger(RefundStudentMessagesListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  @OnEvent(REFUND_REQUESTED_EVENT)
  onRequested(p: RefundEventPayload) {
    return this.send(p, 'request', ({ student, refund, phone }) =>
      refund.dueDate
        ? refundRequestedText({
            firstName: student.firstName,
            amount: refund.approvedAmount ?? refund.requestedAmount,
            dueDate: tashkentDateStr(refund.dueDate),
            balance: student.balance,
            phone,
          })
        : null,
    );
  }

  @OnEvent(REFUND_HANDED_OVER_EVENT)
  onHandedOver(p: RefundEventPayload) {
    return this.send(p, 'hand-over', ({ student, refund }) =>
      refund.handedOverAt
        ? refundHandedOverText({
            firstName: student.firstName,
            amount: refund.approvedAmount ?? refund.requestedAmount,
            method: refund.refundMethod === 'CASH' ? 'CASH' : 'TRANSFER',
            handedOverDay: tashkentDateStr(refund.handedOverAt),
            receiptUrl: refundReceiptPdfUrl(p.refundId),
          })
        : null,
    );
  }

  @OnEvent(REFUND_CANCELLED_EVENT)
  onCancelled(p: RefundEventPayload) {
    return this.send(p, 'cancellation', ({ student, refund, phone }) =>
      refund.cancelReason
        ? refundCancelledText({
            firstName: student.firstName,
            amount: refund.approvedAmount ?? refund.requestedAmount,
            reason: refund.cancelReason,
            balance: student.balance,
            phone,
          })
        : null,
    );
  }

  /** Re-reads what the text needs; `compose` returns null for a row too incomplete to describe. */
  private async send(
    p: RefundEventPayload,
    what: string,
    compose: (facts: Facts) => string | null,
  ) {
    try {
      // Any student not deleted gets it — frozen and departed included, as
      // with the payment receipt (ADR-0025).
      const student = await this.prisma.student.findFirst({
        where: { id: p.studentId, deletedAt: null },
        select: { firstName: true, telegramChatId: true, balance: true },
      });
      if (!student?.telegramChatId) return;
      const refund = await this.prisma.refund.findFirst({
        where: { id: p.refundId, companyId: p.companyId },
        select: {
          approvedAmount: true,
          requestedAmount: true,
          dueDate: true,
          refundMethod: true,
          handedOverAt: true,
          cancelReason: true,
        },
      });
      if (!refund) return;
      const branchId = await tryResolveStudentBranchId(
        this.prisma,
        p.studentId,
        p.companyId,
      );
      const phone = await loadContactPhone(this.prisma, branchId, p.companyId);
      const text = compose({ student, refund, phone });
      if (!text) return;
      await this.sms.sendToStudent(
        p.studentId,
        text,
        SmsMessageType.AUTO,
        p.performedById,
        p.companyId,
      );
    } catch (err) {
      this.logger.warn(
        `Refund ${what} message failed for student ${p.studentId}: ${describeError(err)}`,
      );
    }
  }
}
