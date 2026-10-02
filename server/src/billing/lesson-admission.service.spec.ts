import { LessonAdmissionService } from './lesson-admission.service';

const OCT = ['2026-10-02', '2026-10-05', '2026-10-07'];
const chargeRow = (studentId: number) => ({
  studentId,
  groupId: 'g005',
  periodYear: 2026,
  periodMonth: 10,
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
  // Every switch on, the least share at the contract's 50%.
  const bySettingKey = (_companyId: number, key: string) =>
    Promise.resolve(key === 'payment.admissionMinPaidPercent' ? 50 : true);
  const settings = { get: jest.fn(bySettingKey) };
  const service = new LessonAdmissionService(
    prisma as never,
    settings as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    settings.get.mockImplementation(bySettingKey);
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
          OR: [
            { periodYear: { gt: 2026 } },
            { periodYear: 2026, periodMonth: { gte: 10 } },
          ],
          status: 'CHARGED',
          enrollment: { status: 'ACTIVE', deletedAt: null },
        }),
      }),
    );
  });

  it("counts a later month's charge as held: October paid, November owed", async () => {
    prisma.student.findMany.mockResolvedValue([{ id: 1, balance: -300000 }]);
    // October (300 000) paid in full, November's 300 000 posted and unpaid.
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
      chargeRow(1),
      {
        ...chargeRow(1),
        periodMonth: 11,
        coveredDates: ['2026-11-02', '2026-11-04', '2026-11-06'],
      },
    ]);
    const result = await service.forLesson({
      groupId: 'g005',
      lessonDay: '2026-10-07',
      studentIds: [1],
    });
    expect(result.get(1)).toMatchObject({ admitted: true, reason: 'PAID' });
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
      next: {
        date: '2026-10-07',
        groupName: '#005',
        needed: 100000,
        minPaidPercent: null,
      },
      clearsDebt: false,
    });
  });

  describe('at least half of the month (ADR-0064)', () => {
    // November: 10 lessons at 30 000 — two lessons cost 60 000, half is 150 000.
    const novRow = {
      ...chargeRow(1),
      periodMonth: 11,
      coveredLessons: 10,
      perLessonCost: 30000,
      coveredDates: [2, 4, 6, 9, 11, 13, 16, 18, 20, 23].map(
        (d) => `2026-11-${String(d).padStart(2, '0')}`,
      ),
    };
    const onSecondLesson = () =>
      service.forLesson({
        groupId: 'g005',
        lessonDay: '2026-11-04',
        studentIds: [1],
      });

    beforeEach(() => {
      // 100 000 of 300 000 paid: the 2nd lesson is paid for, half is not.
      prisma.student.findMany.mockResolvedValue([
        { id: 1, balance: -200000, companyId: 5 },
      ]);
      prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([novRow]);
    });

    it('keeps a student below `payment.admissionMinPaidPercent` out', async () => {
      const result = await onSecondLesson();
      expect(result.get(1)).toMatchObject({
        admitted: false,
        reason: 'BELOW_MIN_SHARE',
        shortfall: 50000,
      });
      expect(settings.get).toHaveBeenCalledWith(
        5,
        'payment.admissionMinPaidPercent',
      );
    });

    it('0% asks only for the lessons held', async () => {
      settings.get.mockImplementation((_companyId: number, key: string) =>
        Promise.resolve(key === 'payment.admissionMinPaidPercent' ? 0 : true),
      );
      const result = await onSecondLesson();
      expect(result.get(1)).toMatchObject({ admitted: true, reason: 'PAID' });
    });

    it('tells the payment dialog that it is the half that is short', async () => {
      const reach = await service.reachForPayment({
        studentId: 1,
        companyId: 5,
        balanceAfter: -200000,
        today: '2026-11-04',
      });
      expect(reach).toMatchObject({
        paidThrough: null,
        next: { date: '2026-11-04', needed: 50000, minPaidPercent: 50 },
      });
    });

    describe('reachForMonth (contract 3.7)', () => {
      const forMonth = () =>
        service.reachForMonth({
          companyId: 5,
          studentIds: [1],
          today: '2026-11-18',
        });

      it("walks the month from its first lesson with the student's balance", async () => {
        // Half paid: five lessons of ten, the 6th (13.11) is already behind.
        prisma.student.findMany.mockResolvedValue([
          { id: 1, balance: -150000 },
        ]);
        const reach = await forMonth();
        expect(reach.get(1)).toEqual({
          paidThrough: '2026-11-11',
          next: {
            date: '2026-11-13',
            groupName: '#005',
            needed: 30000,
            minPaidPercent: null,
          },
          clearsDebt: false,
        });
        expect(prisma.enrollmentMonthlyCharge.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              studentId: { in: [1] },
              periodYear: 2026,
              periodMonth: 11,
            }),
          }),
        );
      });

      it('is empty when contract 3.2 is switched off', async () => {
        settings.get.mockResolvedValue(false);
        expect((await forMonth()).size).toBe(0);
        expect(prisma.student.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('first-lesson coverage (ADR-0048, R4)', () => {
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
