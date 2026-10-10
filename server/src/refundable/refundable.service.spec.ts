import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { activeStudentWhere } from '../students/shared/active-student-where';
import { RefundableService } from './refundable.service';
import type { RefundableQueryDto } from './dto/refundable-query.dto';

const card = (id: number, firstName: string) => ({
  id,
  firstName,
  lastName: 'Test',
  phone: `90${id}`,
  createdAt: new Date('2026-01-10T07:00:00Z'),
});
const STUDENTS = [
  {
    ...card(10001, 'Aziza'),
    balance: 300_000,
    status: 'FROZEN',
    statusChangedAt: new Date('2026-09-20T07:00:00Z'),
  },
  {
    ...card(10002, 'Bobur'),
    balance: 200_000,
    status: 'FROZEN',
    statusChangedAt: new Date('2026-08-01T07:00:00Z'),
  },
  {
    ...card(10003, 'Dilnoza'),
    balance: 150_000,
    status: 'ACTIVE',
    statusChangedAt: null,
  },
  {
    ...card(10004, 'Elyor'),
    balance: 100_000,
    status: 'EXPELLED',
    statusChangedAt: new Date('2026-09-01T07:00:00Z'),
  },
];
const PENDING = {
  id: 'r-1',
  studentId: 10005,
  requestedAmount: 250_000,
  approvedAmount: 250_000,
  createdAt: new Date('2026-09-28T06:00:00Z'),
  dueDate: new Date('2026-10-12T19:00:00Z'), // 13.10
  reason: null,
  student: {
    firstName: 'Farida',
    lastName: 'Test',
    phone: '9010005',
    branches: [{ branchId: 1 }],
  },
};
const q = (over: Partial<RefundableQueryDto> = {}) =>
  ({
    tab: 'muzlatilgan',
    page: 1,
    pageSize: 20,
    pendingPage: 1,
    pendingPageSize: 10,
    ...over,
  }) as RefundableQueryDto;
const emptyScope = (where: any) =>
  where.branches?.some?.branchId?.in?.length === 0;

describe('RefundableService (ADR-0075)', () => {
  let service: RefundableService;
  let prisma: any;

  beforeEach(async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    jest.setSystemTime(new Date('2026-10-14T07:00:00Z')); // Wednesday
    prisma = {
      student: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(emptyScope(where) ? [] : STUDENTS),
        ),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            studentId: 10003,
            statusChangedAt: new Date('2026-09-04T07:00:00Z'),
            group: { id: 'g-3', name: 'A1-05' },
          },
          {
            studentId: 10004,
            statusChangedAt: new Date('2026-09-01T07:00:00Z'),
            group: { id: 'g-4', name: 'A2-01' },
          },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      balanceNotice: {
        findMany: jest.fn().mockResolvedValue([
          {
            studentId: 10001,
            createdAt: new Date('2026-09-10T07:00:00Z'),
            channel: 'BOT',
          },
          {
            studentId: 10002,
            createdAt: new Date('2026-09-01T07:00:00Z'),
            channel: 'CALL',
          },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      refund: {
        findMany: jest.fn().mockResolvedValue([PENDING]),
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 1 },
          _sum: { requestedAmount: 250_000 },
        }),
        count: jest.fn().mockResolvedValue(4),
        findFirst: jest
          .fn()
          .mockResolvedValue({ processedAt: new Date('2026-10-02T09:00:00Z') }),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      cashAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'acc-1', name: 'Asosiy kassa', type: 'CASH', branchId: 1 },
          ]),
      },
      payment: { findFirst: jest.fn().mockResolvedValue(null) },
      branch: {
        findUnique: jest.fn().mockResolvedValue({ phone: '901234567' }),
      },
      company: { findUnique: jest.fn().mockResolvedValue({ phone: null }) },
    };
    const module = await Test.createTestingModule({
      providers: [
        RefundableService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(RefundableService);
  });
  afterEach(() => jest.useRealTimers());

  describe('list', () => {
    it('kinds follow ADR-0067; the summary adds the three tabs; the chips add up to the frozen tab', async () => {
      const out = await service.list(1001, null, q());
      expect(out.tabs).toEqual({
        muzlatilgan: { total: 500_000, count: 2 },
        guruhsiz: { total: 150_000, count: 1 },
        ketgan: { total: 100_000, count: 1 },
      });
      expect(out.summary).toEqual({ total: 750_000, count: 4 });
      expect(out.chips).toEqual({ all: 2, upto30: 1, d31to60: 0, over60: 1 });
      expect(out.rows.data.map((r) => r.studentId)).toEqual([10001, 10002]);
      expect(out.rows.data[0]).toMatchObject({
        since: '2026-09-20',
        days: 24,
        ageBucket: 'upto30',
        notice: null,
      });
      expect(out.rows.data[1].notice).toEqual({
        date: '2026-09-01',
        channel: 'CALL',
      });
    });

    it('studying, archived and empty balances are never read', async () => {
      await service.list(1001, null, q());
      expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject({
        companyId: 1001,
        deletedAt: null,
        balance: { gt: 0 },
        NOT: activeStudentWhere(),
      });
    });

    it('guruhsiz counts from the last enrollment and names the last group', async () => {
      const out = await service.list(1001, null, q({ tab: 'guruhsiz' }));
      expect(out.rows.data[0]).toMatchObject({
        studentId: 10003,
        since: '2026-09-04',
        days: 40,
        lastGroup: { id: 'g-3', name: 'A1-05' },
      });
    });

    it('search and the age chip narrow the table rows only', async () => {
      const aged = await service.list(1001, null, q({ age: 'over60' }));
      expect(aged.rows.data.map((r) => r.studentId)).toEqual([10002]);
      expect(aged.rows.total).toBe(1);
      expect(aged.tabs.muzlatilgan.count).toBe(2);
      const found = await service.list(1001, null, q({ search: 'aziza' }));
      expect(found.rows.data.map((r) => r.studentId)).toEqual([10001]);
      expect(found.summary.count).toBe(4);
    });

    it('pending requests: oldest due first, a bank-day pill, the history count, the last hand-over and the drawers of their branches', async () => {
      const out = await service.list(1001, [1], q());
      expect(prisma.refund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1001,
            status: 'REQUESTED',
            student: { branches: { some: { branchId: { in: [1] } } } },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          skip: 0,
          take: 10,
        }),
      );
      expect(out.pending).toMatchObject({
        total: 1,
        sum: 250_000,
        page: 1,
        pageSize: 10,
        historyCount: 4,
        lastHandedOverAt: '2026-10-02T09:00:00.000Z',
      });
      expect(out.pending.data[0]).toMatchObject({
        id: 'r-1',
        amount: 250_000,
        branchId: 1,
        dueDate: '2026-10-13',
        due: { overdue: true, bankDays: 1 },
      });
      expect(out.cashAccounts).toEqual([
        { id: 'acc-1', name: 'Asosiy kassa', type: 'CASH', branchId: 1 },
      ]);
      expect(prisma.cashAccount.findMany.mock.calls[0][0].where).toEqual({
        companyId: 1001,
        branchId: { in: [1] },
        isActive: true,
        deletedAt: null,
      });
    });

    it("a request's branch is picked deterministically: the student's lowest branch, one row", async () => {
      await service.list(1001, null, q());
      expect(
        prisma.refund.findMany.mock.calls[0][0].select.student.select.branches,
      ).toEqual({
        select: { branchId: true },
        orderBy: { branchId: 'asc' },
        take: 1,
      });
    });

    it('an empty scope is nothing', async () => {
      prisma.refund.findMany.mockResolvedValue([]);
      prisma.refund.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { requestedAmount: null },
      });
      const out = await service.list(1001, [], q());
      expect(out.summary).toEqual({ total: 0, count: 0 });
      expect(out.pending).toMatchObject({ total: 0, sum: 0 });
      expect(out.cashAccounts).toEqual([]);
      expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
    });
  });

  describe('student (the drawer)', () => {
    it('reads the facts of one student and the transfer lock', async () => {
      prisma.student.findFirst.mockResolvedValueOnce({
        ...STUDENTS[1],
        telegramChatId: '555',
        telegramDisconnectedAt: null,
        branches: [{ branchId: 1 }],
      });
      prisma.enrollment.findFirst.mockResolvedValueOnce({
        statusChangedAt: new Date('2026-08-01T07:00:00Z'),
        group: { id: 'g-2', name: 'B1-02' },
      });
      prisma.payment.findFirst.mockResolvedValueOnce({
        createdAt: new Date('2026-07-15T07:00:00Z'),
        amount: 450_000,
      });
      prisma.balanceNotice.findFirst.mockResolvedValueOnce({
        createdAt: new Date('2026-09-01T07:00:00Z'),
        channel: 'CALL',
      });

      const d = await service.student(1001, null, null, 10002);

      expect(d).toMatchObject({
        student: { id: 10002, branchId: 1, status: 'FROZEN' },
        balance: 200_000,
        kind: 'muzlatilgan',
        since: '2026-08-01',
        days: 74,
        lastGroup: { id: 'g-2', name: 'B1-02' },
        lastPayment: { createdAt: '2026-07-15T07:00:00.000Z', amount: 450_000 },
        telegramLinked: true,
      });
      // Notice Tue 01.09 → term to 15.09 → transfer from 15.10; today is 14.10.
      expect(d.transfer).toEqual({
        notice: { date: '2026-09-01', channel: 'CALL' },
        termEnds: '2026-09-15',
        allowedFrom: '2026-10-15',
        allowed: false,
        refusal:
          "Markazga o'tkazish 15.10 dan ochiladi (xabar 01.09 da berilgan, qaytarish muddati 15.09 gacha).",
      });
      // A notice given today (Wed 14.10): term to 28.10, transfer from 27.11.
      expect(d.noticePreview).toContain('Assalomu alaykum, Bobur!');
      expect(d.noticePreview).toContain("200\u00A0000 so'm qolgan");
      expect(d.noticePreview).toContain('27-noyabrgacha');
      expect(d.noticePreview).toContain('+998 90 123 45 67');
    });

    it('a studying student has no kind; a blocked chat is not linked', async () => {
      prisma.student.findFirst.mockResolvedValueOnce({
        ...STUDENTS[2],
        telegramChatId: '555',
        telegramDisconnectedAt: new Date('2026-10-01T07:00:00Z'),
        branches: [{ branchId: 1 }],
      });
      prisma.student.count.mockResolvedValueOnce(1);
      const d = await service.student(1001, null, null, 10003);
      expect(d).toMatchObject({
        kind: null,
        since: null,
        days: null,
        telegramLinked: false,
      });
    });

    it("another branch's student is a 404 — named when the caller works there too (ADR-0063)", async () => {
      prisma.student.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          branches: [{ branch: { id: 2, name: 'Ikkinchi filial' } }],
        });
      const err = await service
        .student(1001, [1], [1, 2], 10001)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        branch: { id: 2, name: 'Ikkinchi filial' },
      });
    });
  });

  describe('excel', () => {
    it("four sheets with the page's columns and a «Jami» row; the search applies to the student sheets", async () => {
      const { buffer, filename } = await service.excel(
        1001,
        null,
        q({ search: 'aziza' }),
      );
      expect(filename).toBe('qaytariladigan-pul-2026-10-14.xlsx');
      const wb = new Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      expect(wb.worksheets.map((w) => w.name)).toEqual([
        'Kutilayotgan',
        'Muzlatilganlar',
        'Guruhsiz',
        'Ketganlar',
      ]);
      const pending = wb.worksheets[0];
      expect(pending.getRow(2).getCell(5).value).toBe(250_000);
      expect(pending.getRow(2).getCell(8).value).toBe(
        "muddati o'tdi · 1 bank kuni",
      );
      const frozen = wb.worksheets[1];
      expect(frozen.rowCount).toBe(3); // header, the one match, Jami
      expect(frozen.getRow(3).getCell(1).value).toBe('Jami');
      expect(frozen.getRow(2).getCell(7).value).toBe('kutilmoqda');
      expect(frozen.getRow(3).getCell(8).value).toBe(300_000);
    });

    it('a request due today reads «bugun oxirgi kun» on the pending sheet', async () => {
      prisma.refund.findMany.mockResolvedValue([
        { ...PENDING, dueDate: new Date('2026-10-13T19:00:00Z') }, // 14.10 = today
      ]);
      const { buffer } = await service.excel(1001, null, q());
      const wb = new Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      expect(wb.worksheets[0].getRow(2).getCell(8).value).toBe(
        'bugun oxirgi kun',
      );
    });
  });
});
