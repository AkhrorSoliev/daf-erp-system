import { KpiResultsService } from './kpi-results.service';
import type { KpiSettings } from './kpi-rules';

/** Shared fixtures of the `KpiResultsService` specs. */

export const at = (iso: string) => new Date(`${iso}+05:00`);
export const SETTINGS: KpiSettings = {
  enabled: true,
  changedAt: null,
  leadPaid: { mode: 'FIXED', value: 50_000 },
  promiseKept: { mode: 'FIXED', value: 20_000 },
};
export const PAYMENT = {
  id: 'p1',
  studentId: 10500,
  amount: 600_000,
  status: 'COMPLETED',
  createdAt: at('2026-10-20T10:00:00'),
  companyId: 1001,
  branchId: 2,
  correctsPaymentId: null as string | null,
};
export const FIRST = {
  id: 'p1',
  amount: 600_000,
  createdAt: PAYMENT.createdAt,
  branchId: 2,
};
export const LEAD = {
  id: 'L1',
  ownerId: 11,
  branchId: 3 as number | null,
  statusChangedAt: at('2026-10-18T09:00:00'),
  conversionKind: 'NEW_STUDENT' as string | null,
};
export const ROLES: Record<number, string[]> = {
  11: ['Administrator'],
  12: ['Administrator', 'CEO'],
  13: ['Administrator', 'Branch Director'],
  14: ['Cashier'],
};

export function setupKpiResults(settings: Partial<KpiSettings> = {}) {
  const prisma = {
    payment: {
      findUnique: jest.fn().mockResolvedValue(PAYMENT),
      findFirst: jest.fn().mockResolvedValue(FIRST),
      findMany: jest.fn().mockResolvedValue([]),
    },
    lead: { findMany: jest.fn().mockResolvedValue([LEAD]) },
    paymentPromise: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    kpiResult: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findFirst: jest.fn(({ where }: { where: { id: number } }) =>
        Promise.resolve(
          ROLES[where.id]
            ? { roles: ROLES[where.id].map((name) => ({ role: { name } })) }
            : null,
        ),
      ),
    },
  };
  const kpiSettings = {
    read: jest.fn().mockResolvedValue({ ...SETTINGS, ...settings }),
  };
  const service = new KpiResultsService(prisma as never, kpiSettings as never);
  return { prisma, kpiSettings, service };
}
