import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StaffSalaryAdjustmentService } from './staff-salary-adjustment.service';

jest.mock('./shared/resolve-current-period', () => ({
  parseTashkentDateStart: jest.fn((s: string) => new Date(`${s}T00:00:00Z`)),
  resolveCurrentPeriod: jest.fn(),
}));
jest.mock('./shared/payroll-branch-scope', () => ({
  assertPayrollCoversUser: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./shared/advance-settle', () => ({
  settlePendingAdvances: jest.fn().mockResolvedValue(0),
}));

import { resolveCurrentPeriod } from './shared/resolve-current-period';
import { assertPayrollCoversUser } from './shared/payroll-branch-scope';
import { settlePendingAdvances } from './shared/advance-settle';

const tsh = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d) - 5 * 60 * 60 * 1000);

const PERIOD = {
  periodStart: tsh(2026, 9, 1),
  periodEnd: new Date(tsh(2026, 10, 1).getTime() - 1),
  periodEndDateExclusive: new Date('2026-10-01T00:00:00Z'),
};
// 3 000 000 from 11.09 → 20/30 → 2 000 000.
const VERSIONS = [
  { value: 3_000_000, effectiveFrom: tsh(2026, 9, 11), effectiveTo: null },
];

function setup() {
  const tx: any = {
    employeeSalaryConfig: {
      findFirst: jest.fn().mockResolvedValue({ id: 'cfg1' }),
    },
    employeeSalaryConfigVersion: {
      findMany: jest.fn().mockResolvedValue(VERSIONS),
    },
    salaryPayment: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    staffSalaryAdjustment: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    expense: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
  };
  const prisma: any = {
    $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)),
  };
  const history: any = { recordCreate: jest.fn().mockResolvedValue(undefined) };
  const monthly: any = {
    getMonthlyForUser: jest.fn().mockResolvedValue({ row: { ok: true } }),
  };
  const service = new StaffSalaryAdjustmentService(prisma, history, monthly);
  return { service, tx, prisma, history, monthly };
}

const dto = { month: '2026-09', amount: 2_076_000, reason: "oy o'rtasidan" };

describe('StaffSalaryAdjustmentService.set', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveCurrentPeriod as jest.Mock).mockResolvedValue(PERIOD);
    (settlePendingAdvances as jest.Mock).mockResolvedValue(0);
  });

  it('refuses a month before the floor and a future month', async () => {
    const { service } = setup();
    await expect(
      service.set(10500, { ...dto, month: '2026-04' }, 1, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    const nextYear = `${new Date().getUTCFullYear() + 1}-01`;
    await expect(
      service.set(10500, { ...dto, month: nextYear }, 1, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checks the payee is inside the caller payroll scope first', async () => {
    const { service } = setup();
    await service.set(10500, dto, 1, 7);
    expect(assertPayrollCoversUser).toHaveBeenCalledWith(
      expect.anything(),
      7,
      10500,
    );
  });

  it('refuses someone with no global FIXED_MONTHLY rate or a teacher', async () => {
    const { service, tx } = setup();
    tx.employeeSalaryConfig.findFirst.mockResolvedValue(null);
    await expect(service.set(10500, dto, 1, 1)).rejects.toThrow(
      "Xodimda oylik stavkasi yo'q",
    );
    expect(tx.employeeSalaryConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 10500,
          groupId: null,
          salaryType: 'FIXED_MONTHLY',
          user: {
            deletedAt: null,
            roles: { none: { role: { name: 'Teacher' } } },
          },
        }),
      }),
    );
  });

  it('refuses a month whose payment is APPROVED or PAID', async () => {
    const { service, tx } = setup();
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'p1',
      status: 'APPROVED',
      note: null,
    });
    await expect(service.set(10500, dto, 1, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.staffSalaryAdjustment.upsert).not.toHaveBeenCalled();
  });

  it('stores only the record when the month has no payment yet', async () => {
    const { service, tx, history } = setup();
    await service.set(10500, dto, 1, 7);
    expect(tx.staffSalaryAdjustment.upsert).toHaveBeenCalledWith({
      where: {
        companyId_userId_month: {
          companyId: 1,
          userId: 10500,
          month: '2026-09',
        },
      },
      create: {
        companyId: 1,
        userId: 10500,
        month: '2026-09',
        amount: 2_076_000,
        calculatedAmount: 2_000_000,
        reason: "oy o'rtasidan",
        createdById: 7,
      },
      update: {
        amount: 2_076_000,
        calculatedAmount: 2_000_000,
        reason: "oy o'rtasidan",
        createdById: 7,
      },
    });
    expect(tx.salaryPayment.update).not.toHaveBeenCalled();
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        entityType: 'User',
        entityId: 10500,
        changedById: 7,
        companyId: 1,
        newValues: expect.objectContaining({
          action: 'OYLIK_TUZATILDI',
          oy: '2026-09',
          hisob: 2_000_000,
          qoldaSumma: 2_076_000,
          sabab: "oy o'rtasidan",
        }),
      }),
    );
  });

  it('recomputes a CALCULATED payment: gross − settled advances − newly settled', async () => {
    const { service, tx } = setup();
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'p1',
      status: 'CALCULATED',
      note: null,
    });
    // 500 000 already settled against it; one more advance (400 000) now fits.
    tx.expense.aggregate.mockResolvedValue({ _sum: { amount: 500_000 } });
    (settlePendingAdvances as jest.Mock).mockResolvedValue(400_000);

    await service.set(10500, dto, 1, 7);

    expect(settlePendingAdvances).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        paymentId: 'p1',
        available: 2_076_000 - 500_000,
        userId: 10500,
        companyId: 1,
        periodEndDateExclusive: PERIOD.periodEndDateExclusive,
      }),
    );
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        amount: 2_076_000 - 500_000 - 400_000,
        note: "Qo'lda to'g'rilandi: oy o'rtasidan",
      },
    });
  });

  it('appends to an existing payment note instead of replacing it', async () => {
    const { service, tx } = setup();
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'p1',
      status: 'CALCULATED',
      note: 'eski izoh',
    });
    await service.set(10500, dto, 1, 7);
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({
        note: "eski izoh · Qo'lda to'g'rilandi: oy o'rtasidan",
      }),
    });
  });

  it('refuses a figure below what the payment already settled in advances', async () => {
    const { service, tx } = setup();
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'p1',
      status: 'CALCULATED',
      note: null,
    });
    tx.expense.aggregate.mockResolvedValue({ _sum: { amount: 1_900_000 } });
    await expect(
      service.set(10500, { ...dto, amount: 1_000_000 }, 1, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.staffSalaryAdjustment.upsert).not.toHaveBeenCalled();
  });

  it('returns the refreshed staff row', async () => {
    const { service, monthly } = setup();
    const res = await service.set(10500, dto, 1, 7);
    expect(monthly.getMonthlyForUser).toHaveBeenCalledWith(
      10500,
      { month: '2026-09' },
      1,
      7,
    );
    expect(res).toEqual({ row: { ok: true } });
  });
});

describe('StaffSalaryAdjustmentService.clear', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveCurrentPeriod as jest.Mock).mockResolvedValue(PERIOD);
    (settlePendingAdvances as jest.Mock).mockResolvedValue(0);
  });

  it('is a 404 when the month has no correction', async () => {
    const { service } = setup();
    await expect(service.clear(10500, '2026-09', 1, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes the record, returns the payment to the formula and writes history', async () => {
    const { service, tx, history } = setup();
    tx.staffSalaryAdjustment.findUnique.mockResolvedValue({
      amount: 2_076_000,
    });
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'p1',
      status: 'CALCULATED',
      note: "Qo'lda to'g'rilandi: x",
    });

    await service.clear(10500, '2026-09', 1, 7);

    expect(tx.staffSalaryAdjustment.delete).toHaveBeenCalledWith({
      where: {
        companyId_userId_month: {
          companyId: 1,
          userId: 10500,
          month: '2026-09',
        },
      },
    });
    // gross = formula 2 000 000, nothing settled yet.
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { amount: 2_000_000 },
    });
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({
          action: 'OYLIK_HISOBGA_QAYTARILDI',
          oy: '2026-09',
          hisob: 2_000_000,
          oldingi: 2_076_000,
        }),
      }),
    );
  });
});
