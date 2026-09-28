import { LessonAdmissionService } from './lesson-admission.service';

const OCT = ['2026-10-02', '2026-10-05', '2026-10-07'];
const chargeRow = (studentId: number) => ({
  studentId,
  groupId: 'g005',
  coveredDates: OCT,
  frozenOutDates: [],
  coveredLessons: 3,
  perLessonCost: 100000,
  discountPercent: 0,
  chargedAmount: 300000,
  group: { name: '#005' },
});

describe('LessonAdmissionService', () => {
  const prisma = {
    student: { findMany: jest.fn(), findUnique: jest.fn() },
    enrollmentMonthlyCharge: { findMany: jest.fn() },
  };
  const settings = { get: jest.fn().mockResolvedValue(true) };
  const service = new LessonAdmissionService(
    prisma as never,
    settings as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    settings.get.mockResolvedValue(true);
  });

  it('admits everyone and reads no charge when contract 3.2 is switched off', async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: 1, balance: -300000, companyId: 5 },
    ]);
    settings.get.mockResolvedValue(false);
    const result = await service.forLesson({
      groupId: 'g005',
      lessonDay: '2026-10-05',
      studentIds: [1],
    });
    expect(result.size).toBe(0);
    expect(settings.get).toHaveBeenCalledWith(
      5,
      'payment.admissionRuleEnabled',
    );
    expect(prisma.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
    await expect(
      service.reachForPayment({
        studentId: 1,
        companyId: 5,
        balanceAfter: -100,
        today: '2026-10-05',
      }),
    ).resolves.toBeNull();
  });

  it('judges every student of a lesson from their balance and month charges', async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: 1, balance: -300000 },
      { id: 2, balance: -100000 },
    ]);
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
      chargeRow(1),
      chargeRow(2),
    ]);

    const result = await service.forLesson({
      groupId: 'g005',
      lessonDay: '2026-10-05',
      studentIds: [1, 2],
    });

    expect(result.get(1)).toMatchObject({ admitted: false, shortfall: 200000 });
    expect(result.get(2)).toMatchObject({
      admitted: true,
      paidThrough: '2026-10-05',
    });
    expect(prisma.enrollmentMonthlyCharge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          periodYear: 2026,
          periodMonth: 10,
          status: 'CHARGED',
          enrollment: { status: 'ACTIVE', deletedAt: null },
        }),
      }),
    );
  });

  it('reads nothing before the rule starts', async () => {
    const result = await service.forLesson({
      groupId: 'g005',
      lessonDay: '2026-09-30',
      studentIds: [1],
    });
    expect(result.size).toBe(0);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('reads through the given transaction client', async () => {
    const tx = {
      student: { findMany: jest.fn().mockResolvedValue([]) },
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await service.forLesson(
      { groupId: 'g005', lessonDay: '2026-10-05', studentIds: [1] },
      tx as never,
    );
    expect(tx.student.findMany).toHaveBeenCalled();
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('reaches for a payment with the group names', async () => {
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([chargeRow(1)]);
    // 200 000 of 300 000 paid: lessons 1–2 covered, 07.10 still needs 100 000.
    const reach = await service.reachForPayment({
      studentId: 1,
      companyId: 5,
      balanceAfter: -100000,
      today: '2026-10-05',
    });
    expect(reach).toEqual({
      paidThrough: '2026-10-05',
      next: { date: '2026-10-07', groupName: '#005', needed: 100000 },
      clearsDebt: false,
    });
  });

  describe('first-lesson coverage (ADR-0047, R4)', () => {
    const coverageRow = (over: Record<string, unknown> = {}) => ({
      enrollmentId: 'enr-1',
      groupId: 'g005',
      periodYear: 2026,
      periodMonth: 10,
      coveredDates: OCT,
      frozenOutDates: [],
      coveredLessons: 3,
      perLessonCost: 100000,
      discountPercent: 0,
      chargedAmount: 300000,
      ...over,
    });

    it('reads every charge from the lesson month on, whatever the enrollment status', async () => {
      prisma.student.findUnique.mockResolvedValue({ balance: -300000 });
      prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
        coverageRow(),
      ]);

      const coverage = await service.loadCoverage(
        prisma as never,
        7,
        '2026-10-02',
      );

      expect(prisma.enrollmentMonthlyCharge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            studentId: 7,
            status: 'CHARGED',
            enrollment: { deletedAt: null },
            OR: [
              { periodYear: { gt: 2026 } },
              { periodYear: 2026, periodMonth: { gte: 10 } },
            ],
          },
        }),
      );
      expect(coverage!('g005', '2026-10-02')).toEqual({
        firstLesson: true,
        covered: false,
        enrollmentId: 'enr-1',
      });
    });

    it('calls an ABSENT on an unpaid first lesson unpaid, and a paid one not', async () => {
      prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
        coverageRow(),
      ]);
      prisma.student.findUnique.mockResolvedValue({ balance: -300000 });
      await expect(
        service.isUnpaidFirstLesson({
          studentId: 7,
          groupId: 'g005',
          lessonDay: '2026-10-02',
        }),
      ).resolves.toBe(true);

      // 100 000 paid: the first lesson is reached.
      prisma.student.findUnique.mockResolvedValue({ balance: -200000 });
      await expect(
        service.isUnpaidFirstLesson({
          studentId: 7,
          groupId: 'g005',
          lessonDay: '2026-10-02',
        }),
      ).resolves.toBe(false);

      // The 2nd lesson is contract 3.2's business, not this rule's.
      prisma.student.findUnique.mockResolvedValue({ balance: -300000 });
      await expect(
        service.isUnpaidFirstLesson({
          studentId: 7,
          groupId: 'g005',
          lessonDay: '2026-10-05',
        }),
      ).resolves.toBe(false);
    });

    it('reads nothing before 01.10.2026', async () => {
      await expect(
        service.isUnpaidFirstLesson({
          studentId: 7,
          groupId: 'g005',
          lessonDay: '2026-09-30',
        }),
      ).resolves.toBe(false);
      expect(prisma.student.findUnique).not.toHaveBeenCalled();
    });
  });
});
