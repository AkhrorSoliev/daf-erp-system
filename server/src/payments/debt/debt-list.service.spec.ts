import { Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Workbook } from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { DebtAgeService } from '../../common/finance/debt-age.service';
import { MonthlyPaymentNoticeService } from '../../billing/monthly-payment-notice.service';
import { StatementService } from '../../statements/statement.service';
import { allocate, headlineOf } from '../../statements/statement-analysis';
import type {
  StatementMonth,
  StatementRow,
} from '../../statements/statement.types';
import { DebtListService } from './debt-list.service';
import type { DebtListQueryDto } from './dto/debt-list-query.dto';

const teacher = (id: number, firstName: string, lastName: string) => [
  { teacher: { id, firstName, lastName } },
];
const G1 = {
  id: 'g1',
  name: 'A1-01',
  deletedAt: null,
  statusEnum: 'ACTIVE',
  teachers: teacher(20001, 'Olim', 'Karimov'),
};
const G2 = {
  ...G1,
  id: 'g2',
  name: 'B1-02',
  teachers: teacher(20002, 'Nodira', 'Saidova'),
};
// Made-up figures. 10001 owes both parts (shu oy 450 000, eski 50 000),
// 10002 this month only, 10003 is frozen and owes 200 000 of this month.
const STUDYING = [
  { id: 10001, balance: -500_000 },
  { id: 10002, balance: -100_000 },
];
const NOT_STUDYING = [{ id: 10003, balance: -300_000, status: 'FROZEN' }];
const NAMES = [
  { id: 10001, firstName: 'Ali', lastName: 'Valiyev', phone: '901112233' },
  { id: 10002, firstName: 'Vali', lastName: 'Aliyev', phone: '907778899' },
  { id: 10003, firstName: 'Sobir', lastName: 'Karimov', phone: null },
];
// The shape `ENROLLMENT_SELECT` returns: the enrollment's own `deletedAt` included.
const ENROLLMENTS = [
  { studentId: 10001, status: 'ACTIVE', deletedAt: null, group: G1 },
  { studentId: 10002, status: 'ACTIVE', deletedAt: null, group: G2 },
  { studentId: 10003, status: 'FROZEN', deletedAt: null, group: G1 },
];
const q = (over: Partial<DebtListQueryDto> = {}) =>
  ({ tab: 'shu-oy', ...over }) as DebtListQueryDto;
const idsOf = (where: any): number[] =>
  typeof where.studentId === 'number' ? [where.studentId] : where.studentId.in;

describe('DebtListService', () => {
  let service: DebtListService;
  let prisma: any;
  let notices: { dueDates: jest.Mock };
  let statements: { build: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    jest.setSystemTime(new Date('2026-10-14T07:00:00Z'));
    const emptyScope = (where: any) =>
      where.branches?.some?.branchId?.in?.length === 0;
    prisma = {
      student: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            where.balance
              ? emptyScope(where)
                ? []
                : where.NOT
                  ? NOT_STUDYING
                  : STUDYING
              : NAMES.filter((n) => where.id.in.includes(n.id)),
          ),
        ),
        findFirst: jest.fn(),
      },
      enrollmentMonthlyCharge: {
        groupBy: jest.fn().mockResolvedValue([
          { studentId: 10001, _sum: { chargedAmount: 450_000 } },
          { studentId: 10002, _sum: { chargedAmount: 450_000 } },
          { studentId: 10003, _sum: { chargedAmount: 200_000 } },
        ]),
      },
      enrollment: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            ENROLLMENTS.filter((e) => idsOf(where).includes(e.studentId)),
          ),
        ),
      },
      paymentPromise: {
        findMany: jest.fn().mockResolvedValue([
          {
            studentId: 10002,
            status: 'BROKEN',
            promiseDate: new Date('2026-10-09T18:59:59Z'),
            promisedAmount: null,
          },
        ]),
        findFirst: jest.fn(),
      },
      callLog: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      transaction: { count: jest.fn().mockResolvedValue(6) },
    };
    notices = {
      dueDates: jest.fn().mockResolvedValue(new Map([[10001, '2026-10-06']])),
    };
    statements = { build: jest.fn() };
    const ages = new Map([
      [
        10001,
        {
          since: '2026-09-01T00:00:00.000Z',
          months: { '2026-09': 50_000, '2026-10': 450_000 },
        },
      ],
    ]);
    const module = await Test.createTestingModule({
      providers: [
        DebtListService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: DebtAgeService,
          useValue: { getDebtAges: jest.fn().mockResolvedValue(ages) },
        },
        { provide: MonthlyPaymentNoticeService, useValue: notices },
        { provide: StatementService, useValue: statements },
      ],
    }).compile();
    service = module.get(DebtListService);
  });
  afterEach(() => jest.useRealTimers());

  describe('list', () => {
    it("a tab's total is the sum of its rows; the tab totals and the difference are the split's", async () => {
      const res = await service.list(1001, null, q());
      expect(res.data.map((r) => [r.studentId, r.amount, r.otherPart])).toEqual(
        [
          [10001, 450_000, 50_000],
          [10002, 100_000, 0],
        ],
      );
      expect(res).toMatchObject({
        total: 2,
        page: 1,
        pageSize: 20,
        sum: 550_000,
        leftThisMonth: 200_000,
        writeOffCount: 6,
      });
      expect(res.tabs).toEqual({
        'shu-oy': { total: 550_000, count: 2 },
        eski: { total: 50_000, count: 1 },
        chiqqan: {
          total: 300_000,
          count: 1,
          byKind: {
            ungrouped: { total: 0, count: 0 },
            frozen: { total: 300_000, count: 1 },
            left: { total: 0, count: 0 },
          },
        },
      });
      expect(res.data[0]).toMatchObject({
        dueDate: '2026-10-06',
        promise: null,
        groups: [
          {
            id: 'g1',
            name: 'A1-01',
            teachers: [{ id: 20001, name: 'Olim Karimov' }],
          },
        ],
      });
      expect(res.data[1].promise).toEqual({
        state: 'broken',
        promiseDate: '2026-10-09',
        promisedAmount: null,
      });
      expect(res.options).toEqual({
        groups: [
          { id: 'g1', name: 'A1-01' },
          { id: 'g2', name: 'B1-02' },
        ],
        teachers: [
          { id: 20002, name: 'Nodira Saidova' },
          { id: 20001, name: 'Olim Karimov' },
        ],
      });
    });

    it("Eski qarz and O'qimayotganlar take their own parts; due dates are read for Shu oy only", async () => {
      const eski = await service.list(1001, null, q({ tab: 'eski' }));
      expect(
        eski.data.map((r) => [r.studentId, r.amount, r.otherPart]),
      ).toEqual([[10001, 50_000, 450_000]]);
      expect(eski.data[0].months).toEqual([
        { monthKey: '2026-09', amount: 50_000 },
      ]);
      expect(notices.dueDates).not.toHaveBeenCalled();
      const out = await service.list(1001, null, q({ tab: 'chiqqan' }));
      expect(out.data).toEqual([
        expect.objectContaining({
          studentId: 10003,
          amount: 300_000,
          kind: 'frozen',
          groups: [expect.objectContaining({ id: 'g1' })],
        }),
      ]);
    });

    it('filters, sorts and pages on the server; the sum covers every filtered row', async () => {
      const ids = async (over: Partial<DebtListQueryDto>) =>
        (await service.list(1001, null, q(over))).data.map((r) => r.studentId);
      expect(await ids({ promise: 'broken' })).toEqual([10002]);
      expect(await ids({ promise: 'none' })).toEqual([10001]);
      expect(await ids({ search: 'vali' })).toEqual([10001, 10002]);
      expect(await ids({ search: '10002' })).toEqual([10002]);
      expect(await ids({ groupIds: ['g2'] })).toEqual([10002]);
      expect(await ids({ teacherIds: [20001] })).toEqual([10001]);
      expect(await ids({ sort: 'broken' })).toEqual([10002, 10001]);
      const page2 = await service.list(1001, null, q({ page: 2, pageSize: 1 }));
      expect(page2).toMatchObject({
        total: 2,
        page: 2,
        pageSize: 1,
        sum: 550_000,
      });
      expect(page2.data.map((r) => r.studentId)).toEqual([10002]);
    });

    it('reads the page-only facts for the page rows only', async () => {
      await service.list(1001, null, q({ pageSize: 1 }));
      expect(notices.dueDates).toHaveBeenCalledWith(1001, [10001], '2026-10');
      expect(prisma.callLog.findMany.mock.calls[0][0].where).toEqual({
        companyId: 1001,
        studentId: { in: [10001] },
      });
      expect(prisma.payment.findMany.mock.calls[0][0].where).toEqual({
        companyId: 1001,
        studentId: { in: [10001] },
        status: 'COMPLETED',
      });
    });

    it('the branch scope rides on the split and on the write-off count; an empty scope is nothing', async () => {
      await service.list(1001, [4], q());
      expect(prisma.student.findMany.mock.calls[0][0].where.branches).toEqual({
        some: { branchId: { in: [4] } },
      });
      expect(prisma.transaction.count.mock.calls[0][0].where).toEqual({
        companyId: 1001,
        type: 'DEBT_WRITE_OFF',
        reversedAt: null,
        reversedTransactionId: null,
        branchId: { in: [4] },
      });
      prisma.enrollment.findMany.mockClear();
      const none = await service.list(1001, [], q());
      expect(none).toMatchObject({
        data: [],
        total: 0,
        sum: 0,
        leftThisMonth: 0,
      });
      expect(none.tabs['shu-oy']).toEqual({ total: 0, count: 0 });
      expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('student (the drawer)', () => {
    const MODEL = {
      asOf: '2026-10-14',
      months: [
        { key: '2026-09', cost: 450_000 },
        { key: '2026-10', cost: 450_000 },
      ],
      allocations: [
        {
          kind: 'payment',
          to: [{ due: { kind: 'month', month: '2026-09' }, amount: 400_000 }],
        },
      ],
      headline: {
        kind: 'debt',
        amount: 500_000,
        unpaid: [
          { due: { kind: 'month', month: '2026-10' }, amount: 450_000 },
          { due: { kind: 'month', month: '2026-09' }, amount: 50_000 },
        ],
      },
    };
    beforeEach(() => {
      prisma.student.findFirst.mockResolvedValue({
        id: 10001,
        firstName: 'Ali',
        lastName: 'Valiyev',
        phone: '901112233',
        balance: -500_000,
        status: 'ACTIVE',
      });
      prisma.payment.findFirst.mockResolvedValue({
        createdAt: new Date('2026-09-20T09:00:00Z'),
        amount: 400_000,
        method: 'CASH',
      });
      prisma.callLog.findFirst.mockResolvedValue(null);
      prisma.paymentPromise.findFirst.mockResolvedValue({
        status: 'OPEN',
        promiseDate: new Date('2026-10-17T18:00:00Z'),
        promisedAmount: 500_000,
      });
      statements.build.mockResolvedValue(MODEL);
    });

    it('reads the debt, the months from the statement allocation, the last payment and the promise', async () => {
      expect(await service.student(1001, null, null, 10001)).toEqual({
        student: {
          id: 10001,
          firstName: 'Ali',
          lastName: 'Valiyev',
          phone: '901112233',
        },
        kind: null,
        groups: [
          {
            id: 'g1',
            name: 'A1-01',
            teachers: [{ id: 20001, name: 'Olim Karimov' }],
          },
        ],
        debt: 500_000,
        months: [
          {
            month: '2026-09',
            label: null,
            charged: 450_000,
            paid: 400_000,
            left: 50_000,
          },
          {
            month: '2026-10',
            label: null,
            charged: 450_000,
            paid: 0,
            left: 450_000,
          },
        ],
        lastPayment: {
          createdAt: '2026-09-20T09:00:00.000Z',
          amount: 400_000,
          method: 'CASH',
        },
        lastCall: null,
        promise: {
          state: 'open',
          promiseDate: '2026-10-17',
          promisedAmount: 500_000,
        },
      });
      expect(statements.build).toHaveBeenCalledWith(10001, 1001);
    });

    it('a negative month is spent as a credit, so the month lines add up to «Qarz» (ADR-0073)', async () => {
      // Made-up: March 400 000, April −100 000 (a release in a month with no
      // lessons), May 400 000, one payment of 500 000 → balance −200 000. The
      // statement's FIFO spends April's 100 000 like a payment, so May owes 200 000.
      const months = [
        { key: '2026-03', cost: 400_000, items: [] },
        { key: '2026-04', cost: -100_000, items: [] },
        { key: '2026-05', cost: 400_000, items: [] },
      ] as unknown as StatementMonth[];
      const payment = {
        day: '2026-03-10',
        at: '2026-03-10T05:00:00.000Z',
        amount: 500_000,
        paymentMethod: 'CASH',
        paymentId: 'pay-1',
      } as StatementRow;
      const model = {
        months,
        headline: headlineOf(-200_000, allocate(months, [payment], 0).unpaid),
      };
      statements.build.mockResolvedValue(model);
      prisma.student.findFirst.mockResolvedValue({
        id: 10001,
        firstName: 'Ali',
        lastName: 'Valiyev',
        phone: '901112233',
        balance: -200_000,
        status: 'ACTIVE',
      });
      expect(await service.student(1001, null, null, 10001)).toMatchObject({
        debt: 200_000,
        months: [
          { month: '2026-05', charged: 400_000, paid: 200_000, left: 200_000 },
        ],
      });
    });

    it('a failing statement blanks only the months; payment, call and promise stay', async () => {
      statements.build.mockRejectedValue(new Error('odd ledger'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      try {
        expect(await service.student(1001, null, null, 10001)).toMatchObject({
          debt: 500_000,
          months: [],
          lastPayment: { amount: 400_000 },
          promise: { state: 'open' },
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('10001'));
      } finally {
        warn.mockRestore();
      }
    });

    it('a frozen student is «muzlatilgan», shown with the last group', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 10003,
        firstName: 'Sobir',
        lastName: 'Karimov',
        phone: null,
        balance: -300_000,
        status: 'FROZEN',
      });
      expect(await service.student(1001, null, null, 10003)).toMatchObject({
        kind: 'frozen',
        groups: [expect.objectContaining({ id: 'g1' })],
        debt: 300_000,
      });
    });

    it("another branch's student is a 404 — named when the caller works there too (ADR-0063)", async () => {
      prisma.student.findFirst.mockResolvedValueOnce(null);
      await expect(service.student(1001, [1], [1], 10001)).rejects.toThrow(
        "O'quvchi topilmadi",
      );
      expect(prisma.student.findFirst.mock.calls[0][0].where).toMatchObject({
        id: 10001,
        companyId: 1001,
        deletedAt: null,
        branches: { some: { branchId: { in: [1] } } },
      });
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
      expect(statements.build).not.toHaveBeenCalled();
    });

    it('a wider ceiling that does not hold the student either: a plain 404', async () => {
      prisma.student.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const err = await service
        .student(1001, [1], [1, 2], 10001)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).not.toHaveProperty(
        'branch',
      );
      expect(prisma.student.findFirst.mock.calls[1][0].where.branches).toEqual({
        some: { branchId: { in: [1, 2] } },
      });
    });
  });

  describe('excel', () => {
    it('writes the same rows as the list, every page, plus a «Jami» row', async () => {
      const list = await service.list(1001, null, q({ pageSize: 100 }));
      const { buffer, filename } = await service.excel(
        1001,
        null,
        q({ pageSize: 1 }),
      );
      expect(filename).toBe('qarzdorlik-shu-oy-2026-10-14.xlsx');
      const wb = new Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      expect(ws.name).toBe('Shu oy');
      expect(ws.getRow(1).getCell(7).value).toBe('Qarz');
      const ids: unknown[] = [];
      for (let r = 2; r < ws.rowCount; r++)
        ids.push(ws.getRow(r).getCell(2).value);
      expect(ids).toEqual(list.data.map((d) => d.studentId));
      expect(ws.getRow(ws.rowCount).getCell(1).value).toBe('Jami');
      expect(ws.getRow(ws.rowCount).getCell(7).value).toBe(550_000);
    });

    it("text cells print so'm the way the page does; amount columns stay numbers", async () => {
      const { buffer } = await service.excel(1001, null, q({ tab: 'eski' }));
      const wb = new Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const row = wb.worksheets[0].getRow(2);
      expect(row.getCell(9).value).toBe('Sentabr: 50 000');
      expect(row.getCell(7).value).toBe(50_000);
    });
  });
});
