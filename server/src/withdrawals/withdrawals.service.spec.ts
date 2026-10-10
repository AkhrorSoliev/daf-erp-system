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
    statusChangedAt: new Date('2026-01-01T07:00:00Z'),
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
      // A notice long past its term, so the existing cases may withdraw.
      balanceNotice: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-01-05T07:00:00Z'),
          channel: 'CALL',
        }),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
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
            creditTeacher: true,
            teacherUserId: 12345,
          },
          7,
          1,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create — the month is always the current one (ADR-0055)', () => {
    // 30.09.2026 20:00 UTC is already 01.10.2026 01:00 in Tashkent.
    const now = new Date('2026-09-30T20:00:00.000Z');
    beforeEach(() => jest.useFakeTimers().setSystemTime(now));
    afterEach(() => jest.useRealTimers());

    it('books the withdrawal in the current Tashkent month and stamps that instant', async () => {
      const result = await service.create(
        { studentId: 10001, amount: 200_000, creditTeacher: false },
        7,
        1,
      );
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          createdAt: now,
          description: 'Yechib olish (2026-10)',
          metadata: expect.objectContaining({ targetMonth: '2026-10' }),
        }),
      });
      expect(result.targetMonth).toBe('2026-10');
    });

    it('stamps the instant it holds the student lock, so the ledger stays in balance-chain order', async () => {
      // Another write on this student commits while this one waits for the
      // lock; the ledger replay orders rows by (createdAt, id).
      const locked = new Date('2026-09-30T20:00:05.000Z');
      prisma.$queryRaw.mockImplementationOnce(async () => {
        jest.setSystemTime(locked);
        return [{ id: 10001, balance: 500_000 }];
      });

      await service.create(
        { studentId: 10001, amount: 200_000, creditTeacher: false },
        7,
        1,
      );

      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ createdAt: locked }),
      });
    });

    it('accepts the current month from a dialog opened before the deploy', async () => {
      const result = await service.create(
        {
          studentId: 10001,
          amount: 200_000,
          targetMonth: '2026-10',
          creditTeacher: false,
        },
        7,
        1,
      );
      expect(result.targetMonth).toBe('2026-10');
    });

    it('refuses any other month and writes nothing', async () => {
      await expect(
        service.create(
          {
            studentId: 10001,
            amount: 200_000,
            targetMonth: '2026-08',
            creditTeacher: false,
          },
          7,
          1,
        ),
      ).rejects.toThrow('Yechib olish faqat joriy oy uchun yoziladi');
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it("dates the teacher's accrual the day of the withdrawal, inside the open payroll period", async () => {
      await service.create(
        {
          studentId: 10001,
          amount: 200_000,
          creditTeacher: true,
          teacherUserId: 99,
        },
        7,
        1,
      );
      expect(prisma.salaryAccrual.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          lessonDate: new Date('2026-10-01T00:00:00.000Z'),
        }),
      });
    });
  });

  describe('the transfer condition (ADR-0077)', () => {
    const create = () =>
      service.create(
        { studentId: 10001, amount: 100_000, creditTeacher: false },
        7,
        1,
      );
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });
      prisma.student.findFirst.mockResolvedValue({
        ...studentRow,
        statusChangedAt: new Date('2026-10-01T07:00:00Z'),
      });
      prisma.balanceNotice.findFirst.mockResolvedValue({
        createdAt: new Date('2026-10-10T07:00:00Z'),
        channel: 'BOT',
      });
    });
    afterEach(() => jest.useRealTimers());

    it('refuses without a notice, writing nothing', async () => {
      jest.setSystemTime(new Date('2026-12-01T07:00:00Z'));
      prisma.balanceNotice.findFirst.mockResolvedValue(null);
      await expect(create()).rejects.toThrow(
        "Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.",
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('a notice from before the current status does not count', async () => {
      jest.setSystemTime(new Date('2026-12-01T07:00:00Z'));
      prisma.student.findFirst.mockResolvedValue({
        ...studentRow,
        statusChangedAt: new Date('2026-10-15T07:00:00Z'),
      });
      await expect(create()).rejects.toThrow("Avval o'quvchiga xabar bering.");
    });

    it('refuses too early, naming the dates', async () => {
      jest.setSystemTime(new Date('2026-11-21T07:00:00Z'));
      await expect(create()).rejects.toThrow(
        "Markazga o'tkazish 22.11 dan ochiladi (xabar 10.10 da berilgan, qaytarish muddati 23.10 gacha).",
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('opens on the allowed day itself', async () => {
      jest.setSystemTime(new Date('2026-11-22T07:00:00Z'));
      await create();
      expect(prisma.transaction.create).toHaveBeenCalled();
    });

    it("the student's branch holidays move the dates, not the caller's", async () => {
      // The student sits in branch 2; the caller is a CEO (no branch of their
      // own). A holiday on Mon 12.10 pushes the 10th bank day from 23.10 to
      // 26.10 and the opening from 22.11 to 25.11.
      prisma.studentBranch.findFirst.mockResolvedValue({ branchId: 2 });
      prisma.holiday.findMany.mockResolvedValue([
        {
          date: new Date('2026-10-11T19:00:00Z'),
          endDate: new Date('2026-10-11T19:00:00Z'),
        },
      ]);
      jest.setSystemTime(new Date('2026-11-24T07:00:00Z'));
      await expect(create()).rejects.toThrow(
        "Markazga o'tkazish 25.11 dan ochiladi (xabar 10.10 da berilgan, qaytarish muddati 26.10 gacha).",
      );
      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ branchId: null }, { branchId: 2 }],
          }),
        }),
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();

      jest.setSystemTime(new Date('2026-11-25T07:00:00Z'));
      await create();
      expect(prisma.transaction.create).toHaveBeenCalled();
    });

    it('the preview shows the lock before the dialog is filled', async () => {
      jest.setSystemTime(new Date('2026-11-21T07:00:00Z'));
      const out = await service.preview(10001, 1);
      expect(out.transfer).toEqual({
        notice: { date: '2026-10-10', channel: 'BOT' },
        termEnds: '2026-10-23',
        allowedFrom: '2026-11-22',
        allowed: false,
        refusal:
          "Markazga o'tkazish 22.11 dan ochiladi (xabar 10.10 da berilgan, qaytarish muddati 23.10 gacha).",
      });
    });
  });
});
