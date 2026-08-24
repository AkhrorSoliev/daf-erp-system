import { ReportsStudentFlowService } from './reports-student-flow.service';

describe('ReportsStudentFlowService', () => {
  let prisma: any;
  let service: ReportsStudentFlowService;

  beforeEach(() => {
    prisma = {
      student: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'ACTIVE', _count: 503 },
          { status: 'FROZEN', _count: 184 },
          { status: 'EXPELLED', _count: 134 },
          { status: 'GRADUATED', _count: 3 },
        ]),
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendance: {
        findMany: jest
          .fn()
          .mockResolvedValue(new Array(444).fill({ studentId: 1 })),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([
        { s: 'FROZEN', n: BigInt(73) },
        { s: 'EXPELLED', n: BigInt(41) },
        { s: 'GRADUATED', n: BigInt(20) },
      ]),
    };
    // inGroup, groupless, arrived — in call order
    prisma.student.count
      .mockResolvedValueOnce(427)
      .mockResolvedValueOnce(76)
      .mockResolvedValueOnce(72);
    service = new ReportsStudentFlowService(prisma);
  });

  it('returns the production July shape', async () => {
    const out = await service.getStudentFlow(1, {
      month: '2026-07',
      branchIds: null,
    });

    expect(out.attended).toBe(444);
    expect(out.inGroup).toBe(427);
    expect(out.groupless).toBe(76);
    expect(out.totalStudents).toBe(824);
    expect(out.arrived).toBe(72);
    expect(out.left).toEqual({
      frozen: 73,
      expelled: 41,
      graduated: 20,
      archived: 0,
      total: 134,
    });
    expect(out.netChange).toBe(-62);
  });

  it('splits dropped students into still-studying and groupless', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      { studentId: 1 },
      { studentId: 1 },
      { studentId: 2 },
      { studentId: 3 },
    ]);
    prisma.student.findMany.mockResolvedValue([
      { id: 1, status: 'ACTIVE', enrollments: [{ id: 'e' }] },
      { id: 2, status: 'EXPELLED', enrollments: [] },
      { id: 3, status: 'ACTIVE', enrollments: [] },
    ]);

    const out = await service.getStudentFlow(1, {
      month: '2026-07',
      branchIds: null,
    });

    expect(out.dropped.records).toBe(4);
    expect(out.dropped.students).toBe(3);
    expect(out.dropped.stillInGroup).toBe(1);
    expect(out.dropped.groupless).toBe(2);
    expect(out.dropped.grouplessByStatus).toEqual(
      expect.arrayContaining([
        { status: 'EXPELLED', count: 1 },
        { status: 'ACTIVE', count: 1 },
      ]),
    );
  });

  it('an empty branch scope returns zeros without querying', async () => {
    const out = await service.getStudentFlow(1, {
      month: '2026-07',
      branchIds: [],
    });
    expect(out.attended).toBe(0);
    expect(out.totalStudents).toBe(0);
    expect(prisma.student.groupBy).not.toHaveBeenCalled();
  });

  it('scopes every student query by branch', async () => {
    await service.getStudentFlow(1, { month: '2026-07', branchIds: [7] });
    const where = prisma.student.groupBy.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('7');
  });
});
