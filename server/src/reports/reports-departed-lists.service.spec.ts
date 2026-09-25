import { PrismaService } from '../prisma/prisma.service';
import { ReportsDepartedListsService } from './reports-departed-lists.service';

const at = (s: string) => new Date(s);
const NOW = at('2026-11-20T12:00:00Z');
const MAY = '2026-05-01T09:00:00.000Z';

const A1 = {
  id: 'g1',
  name: 'A1-01',
  branch: { id: 1, name: "Farg'ona" },
  course: { id: 'c1', name: 'A1' },
  teachers: [{ teacher: { id: 501, firstName: 'Ali', lastName: 'Valiyev' } }],
};
const A2 = {
  id: 'g2',
  name: 'A2-01',
  branch: { id: 1, name: "Farg'ona" },
  course: { id: 'c2', name: 'A2' },
  teachers: [
    { teacher: { id: 501, firstName: 'Ali', lastName: 'Valiyev' } },
    { teacher: { id: 502, firstName: 'Olim', lastName: 'Karimov' } },
  ],
};

// 10001 left 03.09 (confirmed), 10002 expelled 01.11, 10003 left 15.11 (pending),
// 10005 came back in 3 days, 10006 still studying.
const LOADER = {
  students: [10001, 10002, 10003, 10005, 10006].map((id) => ({
    id,
    status: id === 10002 ? 'EXPELLED' : 'ACTIVE',
    statusChangedAt: null,
  })),
  enrollments: [
    {
      id: 'e1',
      studentId: 10001,
      status: 'DROPPED',
      createdAt: at(MAY),
      statusChangedAt: at('2026-09-03T09:00:00.000Z'),
    },
    {
      id: 'e2',
      studentId: 10002,
      status: 'DROPPED',
      createdAt: at(MAY),
      statusChangedAt: at('2026-11-01T09:00:00.000Z'),
    },
    {
      id: 'e3',
      studentId: 10003,
      status: 'DROPPED',
      createdAt: at(MAY),
      statusChangedAt: at('2026-11-15T09:00:00.000Z'),
    },
    {
      id: 'e5',
      studentId: 10005,
      status: 'DROPPED',
      createdAt: at(MAY),
      statusChangedAt: at('2026-09-05T09:00:00.000Z'),
    },
    {
      id: 'e6',
      studentId: 10005,
      status: 'ACTIVE',
      createdAt: at('2026-09-08T09:00:00.000Z'),
      statusChangedAt: null,
    },
    {
      id: 'e7',
      studentId: 10006,
      status: 'ACTIVE',
      createdAt: at(MAY),
      statusChangedAt: null,
    },
  ],
  history: [
    {
      entityId: '10002',
      fromStatus: 'ACTIVE',
      toStatus: 'EXPELLED',
      createdAt: at('2026-11-01T09:00:00.100Z'),
    },
  ],
};

const DETAILS = [
  { id: 10001, balance: -50_000, status: 'ACTIVE', group: A1 },
  { id: 10002, balance: 0, status: 'EXPELLED', group: A2 },
  { id: 10003, balance: -10_000, status: 'ACTIVE', group: A1 },
].map((s) => ({
  id: s.id,
  firstName: 'Test',
  lastName: String(s.id),
  phone: '901234567',
  status: s.status,
  balance: s.balance,
  enrollments: [{ group: s.group }],
}));

function fakePrisma(loaderStudents = LOADER.students) {
  return {
    company: {
      findUnique: jest.fn().mockResolvedValue({ systemStartDate: null }),
    },
    student: {
      // The loader asks for ids and statuses; the lists ask for details.
      findMany: jest.fn(
        (args: { select: object; where: { id?: { in: number[] } } }) =>
          Promise.resolve(
            'firstName' in args.select
              ? DETAILS.filter((d) => args.where.id?.in.includes(d.id))
              : loaderStudents,
          ),
      ),
    },
    enrollment: { findMany: jest.fn().mockResolvedValue(LOADER.enrollments) },
    enrollmentStateLog: { findMany: jest.fn().mockResolvedValue([]) },
    statusHistory: { findMany: jest.fn().mockResolvedValue(LOADER.history) },
  };
}

const service = (prisma: ReturnType<typeof fakePrisma>) =>
  new ReportsDepartedListsService(prisma as unknown as PrismaService);

describe('ReportsDepartedListsService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  describe('getDepartedStudentsList', () => {
    it('lists the students who have not come back, latest departure first', async () => {
      const result = await service(fakePrisma()).getDepartedStudentsList(1001, {
        scope: null,
      });

      expect(result.total).toBe(3);
      expect(result.data.map((r) => r.id)).toEqual(['10003', '10002', '10001']);
      expect(result.data[0]).toEqual({
        id: '10003',
        student: { id: 10003, fullName: 'Test 10003' },
        phone: '901234567',
        status: 'ACTIVE',
        balance: -10_000,
        lastGroup: { id: 'g1', name: 'A1-01' },
        branch: { id: 1, name: "Farg'ona" },
        course: { id: 'c1', name: 'A1' },
        teachers: [{ id: 501, fullName: 'Ali Valiyev' }],
        departedAt: '2026-11-15T09:00:00.000Z',
        state: 'pending',
        stopKind: 'LEFT_GROUP',
      });
      expect(result.data[1]).toMatchObject({
        departedAt: '2026-11-01T09:00:00.000Z',
        state: 'confirmed',
        stopKind: 'EXPELLED',
      });
    });

    it('filters by status and by debt', async () => {
      const prisma = fakePrisma();
      const ids = async (params: object) =>
        (
          await service(prisma).getDepartedStudentsList(1001, {
            scope: null,
            ...params,
          })
        ).data.map((r) => r.id);

      expect(await ids({ status: 'EXPELLED' })).toEqual(['10002']);
      expect(await ids({ debtorsOnly: true })).toEqual(['10003', '10001']);
      expect(await ids({ status: 'EXPELLED', debtorsOnly: true })).toEqual([]);
    });

    it('pages after filtering', async () => {
      const result = await service(fakePrisma()).getDepartedStudentsList(1001, {
        scope: null,
        page: 2,
        pageSize: 2,
      });
      expect(result).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(result.data.map((r) => r.id)).toEqual(['10001']);
    });

    it('asks for no details when everyone is in a group', async () => {
      const prisma = fakePrisma(LOADER.students.filter((s) => s.id === 10006));
      const result = await service(prisma).getDepartedStudentsList(1001, {
        scope: null,
      });
      expect(result).toEqual({ data: [], total: 0, page: 1, pageSize: 10 });
      expect(prisma.student.findMany).toHaveBeenCalledTimes(1);
    });
  });

  it('breaks the open departures down by student status', async () => {
    expect(
      await service(fakePrisma()).getDepartedStudentsByStatus(1001, {
        scope: null,
      }),
    ).toEqual({
      data: [
        { status: 'ACTIVE', label: 'Faol (guruhsiz)', count: 2 },
        { status: 'EXPELLED', label: 'Chetlatilgan', count: 1 },
      ],
      total: 3,
    });
  });

  it('groups the open departures by course of the last group', async () => {
    expect(
      await service(fakePrisma()).getDepartedStudentsGroupBy(1001, {
        scope: null,
        groupBy: 'course',
      }),
    ).toEqual({
      data: [
        {
          id: 'c1',
          name: 'A1',
          total: 2,
          segments: [{ status: 'ACTIVE', label: 'Faol (guruhsiz)', count: 2 }],
        },
        {
          id: 'c2',
          name: 'A2',
          total: 1,
          segments: [{ status: 'EXPELLED', label: 'Chetlatilgan', count: 1 }],
        },
      ],
      uniqueTotal: 3,
    });
  });

  it('counts a student under every teacher of their last group', async () => {
    const result = await service(fakePrisma()).getDepartedStudentsGroupBy(
      1001,
      {
        scope: null,
        groupBy: 'teacher',
      },
    );
    expect(result.data.map((b) => [b.name, b.total])).toEqual([
      ['Ali Valiyev', 3],
      ['Olim Karimov', 1],
    ]);
    expect(result.uniqueTotal).toBe(3);
  });
});
