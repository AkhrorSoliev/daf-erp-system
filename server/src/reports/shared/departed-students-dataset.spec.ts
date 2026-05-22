import { loadDepartedStudents } from './departed-students-dataset';

describe('loadDepartedStudents', () => {
  function makePrisma(rows: unknown[]) {
    return {
      student: { findMany: jest.fn().mockResolvedValue(rows) },
    } as any;
  }

  it('builds the snapshot where clause (no ACTIVE enrollment, GRADUATED excluded)', async () => {
    const prisma = makePrisma([]);
    await loadDepartedStudents(prisma, 1);

    const where = prisma.student.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      companyId: 1,
      deletedAt: null,
      enrollments: { none: { status: 'ACTIVE', deletedAt: null } },
      status: { not: 'GRADUATED' },
    });
    expect(where.branches).toBeUndefined();
  });

  it('applies the branch filter when given', async () => {
    const prisma = makePrisma([]);
    await loadDepartedStudents(prisma, 1, { branchId: 7 });

    const where = prisma.student.findMany.mock.calls[0][0].where;
    expect(where.branches).toEqual({ some: { branchId: 7 } });
  });

  it('uses the student exit reason for a FROZEN student', async () => {
    const prisma = makePrisma([
      {
        id: 10001,
        firstName: 'Ali',
        lastName: 'Valiyev',
        phone: '901234567',
        status: 'FROZEN',
        statusChangedAt: new Date('2026-03-10'),
        statusExitReason: { id: 'sr1', name: 'Moliyaviy' },
        enrollments: [
          {
            statusChangedAt: new Date('2026-03-10'),
            // Enrollment also has a reason — but for a FROZEN student the
            // student-level exit reason must win.
            departureReason: { id: 'er1', name: 'Boshqa sabab' },
            group: {
              id: 'g1',
              name: 'B1-01',
              branch: { id: 1, name: 'Bosh' },
              course: { id: 'c1', name: 'A1' },
              teachers: [
                {
                  teacher: { id: 30001, firstName: 'Feruz', lastName: 'Ustoz' },
                },
              ],
            },
          },
        ],
      },
    ]);

    const [rec] = await loadDepartedStudents(prisma, 1);
    expect(rec).toMatchObject({
      studentId: 10001,
      fullName: 'Ali Valiyev',
      status: 'FROZEN',
      departureReasonId: 'sr1',
      departureReasonName: 'Moliyaviy',
      lastGroup: { id: 'g1', name: 'B1-01' },
      course: { id: 'c1', name: 'A1' },
      branch: { id: 1, name: 'Bosh' },
      teachers: [{ id: 30001, fullName: 'Feruz Ustoz' }],
      leftAt: new Date('2026-03-10'),
    });
  });

  it('uses the last enrollment departure reason for an ungrouped ACTIVE student', async () => {
    const prisma = makePrisma([
      {
        id: 10002,
        firstName: 'Hasan',
        lastName: 'Tursunov',
        phone: '907654321',
        status: 'ACTIVE',
        statusChangedAt: null,
        statusExitReason: null,
        enrollments: [
          {
            statusChangedAt: new Date('2026-02-01'),
            departureReason: { id: 'er2', name: 'Vaqt mos kelmadi' },
            group: null,
          },
        ],
      },
    ]);

    const [rec] = await loadDepartedStudents(prisma, 1);
    expect(rec.departureReasonId).toBe('er2');
    expect(rec.departureReasonName).toBe('Vaqt mos kelmadi');
    expect(rec.leftAt).toEqual(new Date('2026-02-01'));
    expect(rec.lastGroup).toBeNull();
    expect(rec.teachers).toEqual([]);
  });

  it('handles a student with no enrollments at all', async () => {
    const prisma = makePrisma([
      {
        id: 10003,
        firstName: 'Olim',
        lastName: 'Olimov',
        phone: '900000000',
        status: 'ACTIVE',
        statusChangedAt: null,
        statusExitReason: null,
        enrollments: [],
      },
    ]);

    const [rec] = await loadDepartedStudents(prisma, 1);
    expect(rec.leftAt).toBeNull();
    expect(rec.departureReasonId).toBeNull();
    expect(rec.lastGroup).toBeNull();
  });
});
