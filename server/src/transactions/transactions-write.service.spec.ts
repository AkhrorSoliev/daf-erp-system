import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsWriteService } from './transactions-write.service';
import { PrismaService } from '../prisma/prisma.service';
import { CashMovementsService } from '../cash-accounts/cash-movements.service';

/**
 * Branch stamping on the ledger.
 *
 * Every Transaction row goes through this service, so it is the one place that
 * can guarantee a branch is attached. A `branchId = null` row is invisible to
 * every per-branch report and cannot be re-attributed later — which is exactly
 * how ~8 900 of them accumulated before this.
 */
describe('TransactionsWriteService — branch stamping', () => {
  let service: TransactionsWriteService;
  let prisma: any;
  let cash: any;

  const COMPANY = 1001;
  const STUDENT = 10500;

  beforeEach(async () => {
    prisma = {
      // runInTx opens its own transaction when the caller passes none; hand the
      // callback the same mock client so assertions see every write.
      $transaction: jest.fn((cb: any) => cb(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: STUDENT, balance: 100_000 }]),
      transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      student: { update: jest.fn() },
      user: { update: jest.fn(), findUnique: jest.fn() },
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 2 }) },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    cash = { recordInflow: jest.fn(), recordOutflow: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsWriteService,
        { provide: PrismaService, useValue: prisma },
        { provide: CashMovementsService, useValue: cash },
      ],
    }).compile();

    service = module.get(TransactionsWriteService);
  });

  const createdData = () => prisma.transaction.create.mock.calls[0][0].data;

  describe('recordPayment', () => {
    it("resolves the student's branch when the caller omits it", async () => {
      await service.recordPayment({
        studentId: STUDENT,
        amount: 400_000,
        paymentId: 'p-1',
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(expect.objectContaining({ branchId: 2 }));
    });

    it('routes the cash inflow to that same branch kassa', async () => {
      await service.recordPayment({
        studentId: STUDENT,
        amount: 400_000,
        paymentId: 'p-1',
        companyId: COMPANY,
      });

      expect(cash.recordInflow).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 2 }),
        expect.anything(),
      );
    });

    it('honours an explicit branchId over the lookup', async () => {
      await service.recordPayment({
        studentId: STUDENT,
        amount: 400_000,
        paymentId: 'p-1',
        branchId: 1,
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(expect.objectContaining({ branchId: 1 }));
      expect(prisma.studentBranch.findFirst).not.toHaveBeenCalled();
    });

    it('refuses to write rather than posting a branch-less row', async () => {
      prisma.studentBranch.findFirst.mockResolvedValue(null);
      prisma.enrollment.findFirst.mockResolvedValue(null);

      await expect(
        service.recordPayment({
          studentId: STUDENT,
          amount: 400_000,
          paymentId: 'p-1',
          companyId: COMPANY,
        }),
      ).rejects.toThrow(/filial aniqlanmadi/);

      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('recordRefund', () => {
    it('stamps the branch and takes the cash out of that branch kassa', async () => {
      await service.recordRefund({
        studentId: STUDENT,
        amount: 50_000,
        refundId: 'r-1',
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(expect.objectContaining({ branchId: 2 }));
      expect(cash.recordOutflow).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 2 }),
        expect.anything(),
      );
    });
  });

  describe('recordSalaryPayment', () => {
    it("uses the employee's own branch and pays out of that branch kassa", async () => {
      prisma.user.findUnique.mockResolvedValue({ mainBranch: 2, branches: [] });

      await service.recordSalaryPayment({
        userId: 10768,
        amount: 3_000_000,
        salaryPaymentId: 'sp-1',
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(expect.objectContaining({ branchId: 2 }));
      expect(cash.recordOutflow).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 2 }),
        expect.anything(),
      );
    });

    it('still pays a branch-less CEO instead of throwing', async () => {
      prisma.user.findUnique.mockResolvedValue({ mainBranch: null, branches: [] });

      await service.recordSalaryPayment({
        userId: 10000,
        amount: 3_000_000,
        salaryPaymentId: 'sp-2',
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(expect.objectContaining({ branchId: null }));
    });
  });
});
