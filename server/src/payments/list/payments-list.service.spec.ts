import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tashkentRangeUtc } from '../../common/date/tashkent';
import {
  attributeIncome,
  loadAttributionRows,
} from '../../common/finance/income-attribution';
import { PrismaService } from '../../prisma/prisma.service';
import type { PaymentListQueryDto } from './dto/payment-list-query.dto';
import { parsePaymentPeriod } from './payment-period';
import { PaymentsListService } from './payments-list.service';

jest.mock('../../common/finance/income-attribution', () => ({
  loadAttributionRows: jest.fn(),
  attributeIncome: jest.fn(),
}));

const OCT = { startDate: '2026-10-01', endDate: '2026-10-31' };
const q = (over: Partial<PaymentListQueryDto> = {}) =>
  ({ ...OCT, ...over }) as PaymentListQueryDto;

const student = (id: number, deletedAt: Date | null = null) => ({
  id,
  firstName: 'Ism',
  lastName: `Familiya${id}`,
  phone: '901112233',
  deletedAt,
});
const payment = (over: Record<string, unknown>) => ({
  amount: 0,
  method: 'CASH',
  status: 'COMPLETED',
  source: 'ADMIN_MANUAL',
  receiptCode: null,
  receiptNumber: null,
  note: null,
  receivedBy: null,
  correctsPayment: null,
  correctedBy: null,
  transactions: [],
  ...over,
});
// Made-up figures; newest first, as `orderBy: createdAt desc` returns them.
const PAYMENTS = [
  payment({
    id: 'p1',
    amount: 535_714,
    createdAt: new Date('2026-10-05T10:00:00Z'),
    studentId: 10001,
    student: student(10001),
  }),
  payment({
    id: 'p2',
    amount: 400_000,
    method: 'CLICK',
    source: 'GATEWAY_WEBHOOK',
    createdAt: new Date('2026-10-04T10:00:00Z'),
    studentId: 10002,
    student: student(10002, new Date('2026-10-08T10:00:00Z')),
  }),
  payment({
    id: 'p3',
    amount: 300_000,
    method: 'TRANSFER',
    status: 'REVERSED',
    createdAt: new Date('2026-10-03T10:00:00Z'),
    studentId: 10003,
    student: student(10003),
  }),
];
const BY_PAYMENT = new Map([
  [
    'p1',
    {
      currentMonth: 385_714,
      advance: 0,
      late: [{ monthKey: '2026-09', amount: 150_000 }],
    },
  ],
  ['p2', { currentMonth: 400_000, advance: 0, late: [] }],
]);
const group = (
  id: string,
  name: string,
  courseId: string,
  teacherIds: number[],
  deletedAt: Date | null = null,
) => ({
  id,
  name,
  deletedAt,
  courseId,
  teachers: teacherIds.map((teacherId) => ({ teacherId })),
});
const enrollment = (
  id: string,
  studentId: number,
  g: ReturnType<typeof group>,
) => ({
  id,
  studentId,
  groupId: g.id,
  status: 'ACTIVE',
  createdAt: new Date('2026-09-01T05:00:00Z'),
  startDate: null,
  statusChangedAt: null,
  group: g,
});
const ENROLLMENTS = [
  enrollment('e1', 10001, group('g1', 'B1-02', 'c1', [10003])),
  // Deleted after the payment day: still the payment's group.
  enrollment(
    'e2',
    10001,
    group('g2', 'A1-01', 'c2', [], new Date('2026-10-20T10:00:00Z')),
  ),
  enrollment('e3', 10002, group('g3', 'C1-01', 'c3', [10004])),
];

describe('PaymentsListService', () => {
  let service: PaymentsListService;
  let prisma: any;

  beforeEach(async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    jest.setSystemTime(new Date('2026-10-11T07:00:00Z'));
    (loadAttributionRows as jest.Mock)
      .mockReset()
      .mockResolvedValue({ payerIds: [], rows: [] });
    (attributeIncome as jest.Mock)
      .mockReset()
      .mockReturnValue({ byPayment: BY_PAYMENT });
    prisma = {
      payment: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            typeof where.status === 'string'
              ? PAYMENTS.filter((p) => p.status === where.status)
              : PAYMENTS,
          ),
        ),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue(ENROLLMENTS) },
      enrollmentStateLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module = await Test.createTestingModule({
      providers: [
        PaymentsListService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(PaymentsListService);
  });

  afterEach(() => jest.useRealTimers());

  const whereOf = () => prisma.payment.findMany.mock.calls[0][0].where;
  const ids = (r: { data: { id: string }[] }) => r.data.map((x) => x.id);

  it('reads the period, the scope and completed payments, archived students included', async () => {
    const res = await service.rows(1001, [4], q());
    const call = prisma.payment.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      companyId: 1001,
      branchId: { in: [4] },
      createdAt: tashkentRangeUtc('2026-10-01', '2026-10-31'),
      status: 'COMPLETED',
    });
    expect(call.where.student).toBeUndefined();
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
    expect(res.period).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
      singleMonth: true,
      endsOnMonthEnd: true,
    });
    expect(ids(res)).toEqual(['p1', 'p2']);
    expect(res.totals).toEqual({
      count: 2,
      amount: 935_714,
      partAmount: null,
    });
  });

  it('refuses a bad period before reading anything', async () => {
    await expect(
      service.rows(1001, [4], q({ startDate: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('«Hammasi»: no status clause; the sum leaves the reversed one out', async () => {
    const res = await service.rows(1001, [4], q({ status: 'ALL' }));
    expect(whereOf().status).toBeUndefined();
    expect(res.totals.count).toBe(3);
    expect(res.totals.amount).toBe(935_714);
  });

  it('«Bekor qilinganlar»: reversed rows, nothing summed, no parts', async () => {
    const res = await service.rows(1001, [4], q({ status: 'REVERSED' }));
    expect(whereOf().status).toBe('REVERSED');
    expect(ids(res)).toEqual(['p3']);
    expect(res.totals.amount).toBe(0);
    expect(res.data[0].parts).toBeNull();
  });

  it('the part filter keeps rows with that part and sums only it', async () => {
    const late = await service.rows(1001, [4], q({ part: 'LATE' }));
    expect(ids(late)).toEqual(['p1']);
    expect(late.totals.partAmount).toBe(150_000);
    expect(late.totals.amount).toBe(535_714);

    const current = await service.rows(
      1001,
      [4],
      q({ part: 'CURRENT', status: 'ALL' }),
    );
    expect(ids(current)).toEqual(['p1', 'p2']);
    expect(current.totals.partAmount).toBe(785_714);

    const advance = await service.rows(1001, [4], q({ part: 'ADVANCE' }));
    expect(advance.data).toEqual([]);
    expect(advance.totals.partAmount).toBe(0);
  });

  it('method, source and receiver become SQL filters', async () => {
    await service.rows(1001, [4], q({ method: ['CLICK'] }));
    expect(whereOf().method).toBe('CLICK');

    prisma.payment.findMany.mockClear();
    await service.rows(1001, [4], q({ method: ['CLICK', 'PAYME'] }));
    expect(whereOf().method).toEqual({ in: ['CLICK', 'PAYME'] });

    prisma.payment.findMany.mockClear();
    await service.rows(1001, [4], q({ source: 'ONLINE' }));
    expect(whereOf().source).toBe('GATEWAY_WEBHOOK');

    prisma.payment.findMany.mockClear();
    await service.rows(1001, [4], q({ source: 'ADMIN' }));
    expect(whereOf().source).toEqual({ not: 'GATEWAY_WEBHOOK' });

    prisma.payment.findMany.mockClear();
    await service.rows(1001, [4], q({ receivedById: [10002], online: true }));
    expect(whereOf().AND).toContainEqual({
      OR: [{ receivedById: 10002 }, { source: 'GATEWAY_WEBHOOK' }],
    });

    prisma.payment.findMany.mockClear();
    await service.rows(1001, [4], q({ receivedById: [10002, 10005] }));
    expect(whereOf().AND).toContainEqual({
      receivedById: { in: [10002, 10005] },
    });

    prisma.payment.findMany.mockClear();
    await service.rows(1001, [4], q({ online: true }));
    expect(whereOf().AND).toContainEqual({ source: 'GATEWAY_WEBHOOK' });
  });

  it('the search is one more SQL clause', async () => {
    await service.rows(1001, [4], q({ search: '10001' }));
    expect(whereOf().AND).toContainEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([{ studentId: 10001 }]),
      }),
    );
  });

  it("reads the payment day's groups once, for every row, sorted by name", async () => {
    const res = await service.rows(1001, [4], q());
    expect(prisma.enrollment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.enrollment.findMany.mock.calls[0][0].where).toEqual({
      studentId: { in: [10001, 10002] },
      deletedAt: null,
      group: { branchId: { in: [4] } },
    });
    expect(prisma.enrollmentStateLog.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.enrollmentStateLog.findMany.mock.calls[0][0]).toMatchObject({
      where: { enrollmentId: { in: ['e1', 'e2', 'e3'] } },
      orderBy: { transitionAt: 'asc' },
    });
    expect(res.data[0].groups).toEqual([
      { id: 'g2', name: 'A1-01' },
      { id: 'g1', name: 'B1-02' },
    ]);
    expect(res.data[1].groups).toEqual([{ id: 'g3', name: 'C1-01' }]);
  });

  it('group, teacher and course filters go through the day groups', async () => {
    expect(ids(await service.rows(1001, [4], q({ groupId: ['g1'] })))).toEqual([
      'p1',
    ]);
    expect(
      ids(await service.rows(1001, [4], q({ teacherId: [10003] }))),
    ).toEqual(['p1']);
    expect(ids(await service.rows(1001, [4], q({ courseId: ['c3'] })))).toEqual(
      ['p2'],
    );
    // Through the deleted group too.
    expect(ids(await service.rows(1001, [4], q({ courseId: ['c2'] })))).toEqual(
      ['p1'],
    );
  });

  it('pages after filtering and totals', async () => {
    const res = await service.rows(
      1001,
      [4],
      q({ status: 'ALL', page: 2, pageSize: 1 }),
    );
    expect(ids(res)).toEqual(['p2']);
    expect(res.total).toBe(3);
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(1);
  });

  it("an archived student's payment is listed, marked archived", async () => {
    const res = await service.rows(1001, [4], q());
    expect(res.data[1].student.archived).toBe(true);
    expect(res.data[0].student.archived).toBe(false);
  });

  it('calls the engine exactly once per request, with the period and scope', async () => {
    await service.rows(1001, [4], q({ part: 'LATE', groupId: ['g1'] }));
    expect(loadAttributionRows).toHaveBeenCalledTimes(1);
    expect(attributeIncome).toHaveBeenCalledTimes(1);
    const [, companyId, period, scope] = (loadAttributionRows as jest.Mock).mock
      .calls[0];
    expect([companyId, period.startStr, period.endStr, scope]).toEqual([
      1001,
      '2026-10-01',
      '2026-10-31',
      [4],
    ]);
  });

  it('an empty scope reads nothing', async () => {
    prisma.payment.findMany.mockResolvedValue([]);
    const res = await service.rows(1001, [], q());
    expect(whereOf().branchId).toEqual({ in: [] });
    expect(res.data).toEqual([]);
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });

  it('`only` reads one payment by id, whatever its status or day', async () => {
    const period = parsePaymentPeriod('2026-10-01', '2026-10-31');
    await service.buildRows(
      1001,
      [4],
      period,
      { status: 'COMPLETED' },
      {
        id: 'p3',
      },
    );
    expect(whereOf()).toEqual({
      companyId: 1001,
      branchId: { in: [4] },
      id: 'p3',
    });
  });
});
