import { loadJoinRequestView } from './join-request-view';

const REQUEST = {
  id: 'r1',
  companyId: 1001,
  branchId: 7,
  groupId: 'g1',
  chatId: '555444',
  telegramUsername: 'dilnoza_a',
  firstName: 'Dilnoza',
  lastName: 'Aliyeva',
  phone: '901234567',
  photo: 'https://r2/p.jpg',
  status: 'PENDING' as const,
  taskId: 't1',
  decidedById: null,
  decidedAt: null,
  rejectReason: null,
  approvedGroupId: null,
  studentId: null,
  createdAt: new Date('2026-10-10T09:02:00.000Z'),
};

const group = (id: string, extra: object = {}) => ({
  id,
  name: id.toUpperCase(),
  branchId: 7,
  deletedAt: null,
  statusEnum: 'ACTIVE',
  teachers: [{ teacher: { firstName: 'Madina', lastName: 'Karimova' } }],
  ...extra,
});

function db() {
  return {
    group: {
      findMany: jest.fn().mockResolvedValue([group('g1'), group('g2')]),
    },
    enrollment: { findMany: jest.fn().mockResolvedValue([]) },
    lead: { findFirst: jest.fn().mockResolvedValue(null) },
    student: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  };
}

describe('loadJoinRequestView', () => {
  it('lists the branch groups that take students and names the requested one', async () => {
    const d = db();
    const view = await loadJoinRequestView(d as any, REQUEST as any);

    expect(view.requestedGroup).toEqual({ id: 'g1', name: 'G1' });
    expect(view.groups).toEqual([
      { id: 'g1', name: 'G1', teacherName: 'Madina Karimova' },
      { id: 'g2', name: 'G2', teacherName: 'Madina Karimova' },
    ]);
    expect(view.lead).toBeNull();
    expect(view.archivedStudentId).toBeNull();
    expect(view.sameNameGroupIds).toEqual([]);
  });

  it('keeps a closed requested group out of the list but still names it', async () => {
    const d = db();
    d.group.findMany.mockResolvedValue([
      group('g1', { statusEnum: 'COMPLETED' }),
      group('g2'),
    ]);
    const view = await loadJoinRequestView(d as any, REQUEST as any);

    expect(view.requestedGroup).toEqual({ id: 'g1', name: 'G1' });
    expect(view.groups.map((g) => g.id)).toEqual(['g2']);
  });

  it('finds the lead, the archived card and the same name in a group', async () => {
    const d = db();
    d.lead.findFirst.mockResolvedValue({
      createdAt: new Date('2026-10-03T07:00:00.000Z'),
      statusEnum: 'CONTACTED',
      deletedAt: null,
      source: { name: 'Instagram forma' },
    });
    d.student.findFirst.mockResolvedValue({ id: 10942 });
    d.enrollment.findMany.mockResolvedValue([
      { groupId: 'g2' },
      { groupId: 'g2' },
    ]);
    const view = await loadJoinRequestView(d as any, REQUEST as any);

    expect(view.lead).toEqual({
      createdAt: new Date('2026-10-03T07:00:00.000Z'),
      status: 'CONTACTED',
      archived: false,
      sourceName: 'Instagram forma',
    });
    expect(view.archivedStudentId).toBe(10942);
    expect(view.sameNameGroupIds).toEqual(['g2']);
    expect(d.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 1001,
          OR: [{ phone: '901234567' }, { extraPhone: '901234567' }],
        },
      }),
    );
    expect(d.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 1001,
          phone: '901234567',
          deletedAt: { not: null },
        },
      }),
    );
    expect(d.enrollment.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        group: { branchId: 7, deletedAt: null },
        student: {
          deletedAt: null,
          firstName: { equals: 'Dilnoza', mode: 'insensitive' },
          lastName: { equals: 'Aliyeva', mode: 'insensitive' },
        },
      },
      select: { groupId: true },
    });
  });

  it('names who decided', async () => {
    const d = db();
    d.user.findUnique.mockResolvedValue({
      id: 10002,
      firstName: 'Bobur',
      lastName: 'Aliyev',
    });
    const view = await loadJoinRequestView(
      d as any,
      {
        ...REQUEST,
        status: 'APPROVED',
        decidedById: 10002,
        studentId: 11345,
        approvedGroupId: 'g2',
      } as any,
    );

    expect(view.decidedBy).toEqual({
      id: 10002,
      firstName: 'Bobur',
      lastName: 'Aliyev',
    });
    expect(view.approvedGroup).toEqual({ id: 'g2', name: 'G2' });
    expect(view.studentId).toBe(11345);
  });
});
