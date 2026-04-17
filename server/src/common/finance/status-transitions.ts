import { BadRequestException } from '@nestjs/common';
import {
  ContractStatus,
  PaymentStatus,
  RefundStatus,
  SalaryPaymentStatus,
} from '@prisma/client';

/**
 * Valid state machine transitions for finance entities.
 *
 * Centralizing these prevents scattered, drift-prone checks inside each
 * service (e.g. one endpoint accepting CALCULATED → PAID directly while
 * another enforces CALCULATED → APPROVED → PAID). Any new finance endpoint
 * should route its status change through `assertValidTransition()`.
 */

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: [
    PaymentStatus.COMPLETED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  COMPLETED: [PaymentStatus.REFUNDED],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
  REVERSED: [],
};

export const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  REQUESTED: [RefundStatus.APPROVED, RefundStatus.REJECTED],
  APPROVED: [RefundStatus.PROCESSING, RefundStatus.COMPLETED],
  PROCESSING: [RefundStatus.COMPLETED],
  COMPLETED: [],
  REJECTED: [],
};

export const SALARY_PAYMENT_TRANSITIONS: Record<
  SalaryPaymentStatus,
  SalaryPaymentStatus[]
> = {
  CALCULATED: [SalaryPaymentStatus.APPROVED, SalaryPaymentStatus.CANCELLED],
  APPROVED: [SalaryPaymentStatus.PAID, SalaryPaymentStatus.CANCELLED],
  PAID: [],
  CANCELLED: [],
};

export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: [ContractStatus.ACTIVE, ContractStatus.CANCELLED],
  ACTIVE: [
    ContractStatus.COMPLETED,
    ContractStatus.CANCELLED,
    ContractStatus.REFUNDED,
  ],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

type TransitionMap<T extends string> = Record<T, T[]>;

export function assertValidTransition<T extends string>(
  entity: string,
  map: TransitionMap<T>,
  from: T,
  to: T,
): void {
  if (from === to) {
    throw new BadRequestException(
      `${entity} statusi allaqachon '${to}' holatida`,
    );
  }
  const allowed = map[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestException(
      `${entity} statusi '${from}' dan '${to}' ga o'tkazib bo'lmaydi`,
    );
  }
}
