import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Workbook } from 'exceljs';
import {
  addMonthsToMonthKey,
  tashkentMonthKey,
} from '../../common/date/tashkent';
import { GroupPaymentsService } from './group-payments.service';

// Made-up month: student 10001 owes only November's charge (October paid);
// student 10002 owes 600 000, spread over A1-01 (450 000) and B1-02 (300 000).
const enr = (status: string, createdAt = '2026-09-01T05:00:00Z') => ({
  status,
  createdAt: new Date(createdAt),
});
const ROWS = [
  {
    id: 'c1',
    studentId: 10001,
    groupId: 'g1',
    enrollmentId: 'e1',
    periodYear: 2026,
    periodMonth: 10,
    branchId: 4,
    chargedAmount: 450_000,
    enrollment: enr('ACTIVE'),
  },
  {
    id: 'c2',
    studentId: 10002,
    groupId: 'g1',
    enrollmentId: 'e2',
    periodYear: 2026,
    periodMonth: 10,
    branchId: 4,
    chargedAmount: 450_000,
    enrollment: enr('FROZEN'),
  },
  {
    id: 'c3',
    studentId: 10002,
    groupId: 'g2',
    enrollmentId: 'e3',
    periodYear: 2026,
    periodMonth: 10,
    branchId: 4,
    chargedAmount: 300_000,
    enrollment: enr('ACTIVE', '2026-10-05T05:00:00Z'),
  },
  {
    id: 'c4',
    studentId: 10001,
    groupId: 'g1',
    enrollmentId: 'e1',
    periodYear: 2026,
    periodMonth: 11,
    branchId: 4,
    chargedAmount: 450_000,
    enrollment: enr('ACTIVE'),
  },
];
const STUDENTS = [
  {
    id: 10001,
    balance: -450_000,
    firstName: 'Birinchi',
    lastName: 'Ism',
    phone: '900000001',
    deletedAt: null,
  },
  {
    id: 10002,
    balance: -600_000,
    firstName: 'Ikkinchi',
    lastName: 'Ism',
    phone: '900000002',
    deletedAt: null,
  },
];
const teacher = (id: number, firstName: string, lastName: string) => ({
  teacher: { id, firstName, lastName },
});
const GROUPS = [
  {
    id: 'g1',
    name: 'A1-01',
    groupNumber: 11,
    statusEnum: 'ACTIVE',
    deletedAt: null,
    course: { id: 'k1', name: 'Nemis tili A1' },
    teachers: [
      teacher(20001, 'Olim', 'Karimov'),
      teacher(20002, 'Aziza', 'Rahimova'),
    ],
  },
  {
    id: 'g2',
    name: 'B1-02',
    groupNumber: null,
    statusEnum: 'COMPLETED',
    deletedAt: null,
    course: { id: 'k2', name: 'Nemis tili B1' },
    teachers: [],
  },
];

function setup(
  holders: { studentId: number }[] = [
    { studentId: 10001 },
    { studentId: 10002 },
  ],
  groups: unknown[] = GROUPS,
) {
  const prisma = {
    enrollmentMonthlyCharge: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(holders)
        .mockResolvedValueOnce(ROWS),
    },
    student: { findMany: jest.fn().mockResolvedValue(STUDENTS) },
    group: { findMany: jest.fn().mockResolvedValue(groups) },
  };
  return { prisma, service: new GroupPaymentsService(prisma as never) };
}

const SUMMARY = {
  charged: 1_200_000,
  paid: 600_000,
  unpaid: 600_000,
  paidPct: 50,
  students: 2,
  unpaidStudents: 1,
  groups: 2,
  fullyPaidGroups: 0,
  underHalfGroups: 1,
  avgGroupPct: 40,
};

describe('GroupPaymentsService.rows', () => {
  it('reads the month like loadMonthCharges: scoped holders, then their charges, balances and groups', async () => {
    const { prisma, service } = setup();
    await service.rows(1001, [4], { oy: '2026-10' });
    const [holders, later] = prisma.enrollmentMonthlyCharge.findMany.mock.calls;
    expect(holders[0]).toMatchObject({
      where: {
        companyId: 1001,
        periodYear: 2026,
        periodMonth: 10,
        status: 'CHARGED',
        branchId: { in: [4] },
      },
      distinct: ['studentId'],
    });
    expect(later[0].where).toEqual({
      companyId: 1001,
      studentId: { in: [10001, 10002] },
      status: 'CHARGED',
      OR: [
        { periodYear: { gt: 2026 } },
        { periodYear: 2026, periodMonth: { gte: 10 } },
      ],
    });
    expect(prisma.student.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1001,
      id: { in: [10001, 10002] },
    });
    const groupWhere = prisma.group.findMany.mock.calls[0][0].where;
    expect(groupWhere.companyId).toBe(1001);
    expect([...groupWhere.id.in].sort()).toEqual(['g1', 'g2']);
    // A deleted group still shows: no deletedAt filter on the group read.
    expect(groupWhere.deletedAt).toBeUndefined();
  });

  it('answers the card and the Guruhlar rows, lowest percentage first', async () => {
    const { service } = setup();
    const r = await service.rows(1001, [4], { oy: '2026-10' });
    expect(r.month).toBe('2026-10');
    expect(r.summary).toEqual(SUMMARY);
    expect(r.total).toBe(2);
    expect(r.multiTeacherNote).toBe(false);
    expect(r.rows).toEqual([
      {
        id: 'g2',
        name: 'B1-02',
        sub: 'Nemis tili B1',
        teachers: [],
        marks: ['yopilgan'],
        students: 1,
        charged: 300_000,
        paid: 60_000,
        unpaid: 240_000,
        paidPct: 20,
        unpaidStudents: 1,
      },
      {
        id: 'g1',
        name: 'A1-01',
        sub: 'Nemis tili A1',
        teachers: ['Aziza Rahimova', 'Olim Karimov'],
        marks: [],
        students: 2,
        charged: 900_000,
        paid: 540_000,
        unpaid: 360_000,
        paidPct: 60,
        unpaidStudents: 1,
      },
    ]);
  });

  it('the Ustozlar cut: current teachers, «Ustozsiz», the two-teacher note; the card does not move', async () => {
    const { service } = setup();
    const r = await service.rows(1001, [4], {
      oy: '2026-10',
      kesim: 'ustoz',
      qarzdor: '1',
    });
    expect(r.rows.map((x) => x.name)).toEqual([
      'Ustozsiz',
      'Aziza Rahimova',
      'Olim Karimov',
    ]);
    expect(r.multiTeacherNote).toBe(true);
    expect(r.summary).toEqual(SUMMARY);
  });

  it('no month reads the current Tashkent month', async () => {
    const { prisma, service } = setup();
    await service.rows(1001, [4], {});
    const [y, m] = tashkentMonthKey(new Date()).split('-').map(Number);
    expect(
      prisma.enrollmentMonthlyCharge.findMany.mock.calls[0][0].where,
    ).toMatchObject({ periodYear: y, periodMonth: m });
  });

  it('refuses a month before September 2026 or ahead, before reading anything', async () => {
    const { prisma, service } = setup();
    await expect(service.rows(1001, [4], { oy: '2026-08' })).rejects.toThrow(
      new BadRequestException('Bu hisobot sentabr 2026 dan boshlanadi'),
    );
    const next = addMonthsToMonthKey(tashkentMonthKey(new Date()), 1);
    await expect(service.rows(1001, [4], { oy: next })).rejects.toThrow(
      new BadRequestException("Kelajak oyni tanlab bo'lmaydi"),
    );
    expect(prisma.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
  });

  it('an empty scope is a 403 and reads nothing', async () => {
    const { prisma, service } = setup();
    await expect(service.rows(1001, [], { oy: '2026-10' })).rejects.toThrow(
      new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      ),
    );
    expect(prisma.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
  });

  it('a month with no charge: zeros, no rows, and no further reads', async () => {
    const { prisma, service } = setup([]);
    const r = await service.rows(1001, null, { oy: '2026-10' });
    expect(r.summary).toMatchObject({
      charged: 0,
      groups: 0,
      paidPct: null,
      avgGroupPct: null,
    });
    expect(r.rows).toEqual([]);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });
});

describe('GroupPaymentsService.group', () => {
  it('the drawer: totals, students unpaid first, marks from the enrollment', async () => {
    const { service } = setup();
    expect(await service.group(1001, [4], 'g1', '2026-10')).toEqual({
      group: {
        id: 'g1',
        name: 'A1-01',
        course: 'Nemis tili A1',
        teachers: ['Aziza Rahimova', 'Olim Karimov'],
        deleted: false,
        closed: false,
      },
      charged: 900_000,
      paid: 540_000,
      unpaid: 360_000,
      paidPct: 60,
      students: [
        {
          id: 10002,
          firstName: 'Ikkinchi',
          lastName: 'Ism',
          phone: '900000002',
          charged: 450_000,
          paid: 90_000,
          unpaid: 360_000,
          status: 'qisman',
          mark: 'muzlatilgan',
        },
        {
          id: 10001,
          firstName: 'Birinchi',
          lastName: 'Ism',
          phone: '900000001',
          charged: 450_000,
          paid: 450_000,
          unpaid: 0,
          status: 'toladi',
          mark: null,
        },
      ],
    });
  });

  it('a group without a charge in this month and scope is a 404', async () => {
    const { service } = setup();
    await expect(service.group(1001, [4], 'g7', '2026-10')).rejects.toThrow(
      new NotFoundException('Bu guruh tanlangan oyda topilmadi'),
    );
  });

  it("a deleted group that was also COMPLETED shows only «o'chirilgan», not «yopilgan»", async () => {
    const deletedGroups = [
      GROUPS[0],
      { ...GROUPS[1], deletedAt: new Date('2026-10-20T05:00:00Z') },
    ];
    const rowsRes = await setup(undefined, deletedGroups).service.rows(
      1001,
      [4],
      { oy: '2026-10' },
    );
    expect(rowsRes.rows.find((x) => x.id === 'g2')?.marks).toEqual([
      'ochirilgan',
    ]);
    const drawer = await setup(undefined, deletedGroups).service.group(
      1001,
      [4],
      'g2',
      '2026-10',
    );
    expect(drawer.group).toMatchObject({ deleted: true, closed: false });
  });
});

describe('GroupPaymentsService.excel', () => {
  async function sheets(q: object) {
    const { service } = setup();
    const { buffer, filename } = await service.excel(1001, [4], {
      oy: '2026-10',
      ...q,
    });
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    return { wb, filename };
  }

  it('names the file by the month; the first sheet follows the table, every page', async () => {
    const { wb, filename } = await sheets({});
    expect(filename).toBe('guruhlar-tolovi-2026-10.xlsx');
    expect(wb.getWorksheet('Guruhlar')!.getRow(2).getCell(2).value).toBe(
      'B1-02 (yopilgan)',
    );
    expect(wb.getWorksheet("O'quvchilar")!.rowCount).toBe(4); // header + 3 student–group lines
  });

  it('«qarzdor» keeps only the students with something left on the second sheet', async () => {
    const { wb } = await sheets({ qarzdor: '1' });
    const ws = wb.getWorksheet("O'quvchilar")!;
    expect(ws.rowCount).toBe(3);
    expect([
      ws.getRow(2).getCell(4).value,
      ws.getRow(3).getCell(4).value,
    ]).toEqual([10002, 10002]);
  });
});
