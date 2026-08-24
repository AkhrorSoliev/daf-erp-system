import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WithdrawalsService } from './withdrawals.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('WithdrawalsService', () => {
  let service: WithdrawalsService;
  let prisma: any;
  let history: any;

  const studentRow = {
    id: 10001,
    firstName: 'Ali',
    lastName: 'Valiyev',
    balance: 500_000,
    branchId: 1,
  };

  beforeEach(async () => {
    prisma = {
      // The financial-write guard reads the acting user's roles/branches.
      // A CEO spans every branch, so the default caller passes.
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue(studentRow),
        update: jest.fn().mockResolvedValue({}),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            groupId: 'grp-1',
            group: {
              id: 'grp-1',
              name: 'Standart-1',
              teachers: [
                {
                  teacher: {
                    id: 99,
                    firstName: 'Lola',
                    lastName: 'Karimova',
                    deletedAt: null,
                    isActive: true,
                  },
                },
              ],
            },
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({ groupId: 'grp-1' }),
      },
      // The withdrawal is recognised as the student's branch's revenue.
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      transaction: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'tx-1', createdAt: new Date() }),
      },
      salaryAccrual: { create: jest.fn().mockResolvedValue({ id: 'acc-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 10001, balance: 500_000 }]),
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    };

    history = { recordStatusChange: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();

    service = module.get(WithdrawalsService);
  });

  describe('preview', () => {
    it('returns student data, max withdrawable, and teacher suggestions', async () => {
      const out = await service.preview(10001, 1);
      expect(out.studentId).toBe(10001);
      expect(out.currentBalance).toBe(500_000);
      expect(out.maxWithdrawable).toBe(500_000);
      expect(out.teacherSuggestions).toHaveLength(1);
      expect(out.teacherSuggestions[0].userId).toBe(99);
    });

    it('clamps maxWithdrawable to 0 for negative balance', async () => {
      prisma.student.findFirst.mockResolvedValueOnce({
        ...studentRow,
        balance: -50_000,
      });
      const out = await service.preview(10001, 1);
      expect(out.maxWithdrawable).toBe(0);
    });

    it('throws if student not found', async () => {
      prisma.student.findFirst.mockResolvedValueOnce(null);
      await expect(service.preview(99999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('skips deleted/inactive teachers from suggestions', async () => {
      prisma.enrollment.findMany.mockResolvedValueOnce([
        {
          groupId: 'grp-1',
          group: {
            id: 'grp-1',
            name: 'Standart-1',
            teachers: [
              {
                teacher: {
                  id: 1,
                  firstName: 'A',
                  lastName: 'A',
                  deletedAt: new Date(),
                  isActive: false,
                },
              },
              {
                teacher: {
                  id: 2,
                  firstName: 'B',
                  lastName: 'B',
                  deletedAt: null,
                  isActive: false,
                },
              },
            ],
          },
        },
      ]);
      const out = await service.preview(10001, 1);
      expect(out.teacherSuggestions).toHaveLength(0);
    });
  });

  describe('create — without teacher credit', () => {
    it('writes a BALANCE_WITHDRAWAL transaction and updates balance', async () => {
      const result = await service.create(
        {
          studentId: 10001,
          amount: 200_000,
          targetMonth: '2026-01',
          creditTeacher: false,
        },
        7,
        1,
      );
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'BALANCE_WITHDRAWAL',
            amount: -200_000,
            // Recognised revenue must land in the student's branch P&L (D4).
            branchId: 1,
          }),
        }),
      );
      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 10001 },
        data: { balance: 300_000 },
      });
      expect(prisma.salaryAccrual.create).not.toHaveBeenCalled();
      expect(result.amount).toBe(200_000);
      expect(result.accrualId).toBeNull();
    });

    it('rejects when balance is insufficient', async () => {
      prisma.student.findFirst.mockResolvedValueOnce({
        ...studentRow,
        balance: 100_000,
      });
      await expect(
        service.create(
          {
            studentId: 10001,
            amount: 500_000,
            targetMonth: '2026-01',
            creditTeacher: false,
          },
          7,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when student not found', async () => {
      prisma.student.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.create(
          {
            studentId: 99999,
            amount: 100_000,
            targetMonth: '2026-01',
            creditTeacher: false,
          },
          7,
          1,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create — with teacher credit', () => {
    it('creates a SalaryAccrual linked to the withdrawal transaction', async () => {
      const result = await service.create(
        {
          studentId: 10001,
          amount: 200_000,
          targetMonth: '2026-03',
          creditTeacher: true,
          teacherUserId: 99,
        },
        7,
        1,
      );
      expect(prisma.salaryAccrual.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 99,
            studentId: 10001,
            groupId: 'grp-1',
            attendanceId: null,
            amount: 200_000,
            deductionTransactionId: 'tx-1',
          }),
        }),
      );
      expect(result.accrualId).toBe('acc-1');
    });

    it('requires teacherUserId when creditTeacher is true', async () => {
      await expect(
        service.create(
          {
            studentId: 10001,
            amount: 200_000,
            targetMonth: '2026-01',
            creditTeacher: true,
          },
          7,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("forbids selecting a teacher not in the student's groups", async () => {
      prisma.enrollment.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.create(
          {
            studentId: 10001,
            amount: 100_000,
            targetMonth: '2026-01',
            creditTeacher: true,
            teacherUserId: 12345,
          },
          7,
          1,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
