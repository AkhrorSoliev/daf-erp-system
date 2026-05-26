import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceStatus, EnrollmentStatus } from '@prisma/client';
import { DebtWriteOffService } from './debt-write-off.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history/entity-history.service';

/**
 * Fixture builder — qaytaradi tx, transactionsService, entityHistoryService
 * mocks. computeEligibility tx ni qabul qiladi (PrismaService o'rniga), shu
 * sababli ham `prisma`, ham `tx` bir xil interface ga ega.
 */
function buildClient() {
  return {
    enrollment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    attendance: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    transaction: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(null)),
  };
}

const COMPANY_ID = 1;
const ENROLLMENT_ID = 'enroll-1';
const STUDENT_ID = 10001;
const GROUP_ID = 'group-1';
const PERFORMER_ID = 99;

function makeEnrollment(overrides: Partial<{
  balance: number;
  status: EnrollmentStatus;
  startDate: Date | null;
  price: number;
  lessonPaymentCount: number;
}> = {}) {
  return {
    id: ENROLLMENT_ID,
    studentId: STUDENT_ID,
    groupId: GROUP_ID,
    status: overrides.status ?? EnrollmentStatus.ACTIVE,
    startDate: overrides.startDate ?? null,
    student: {
      id: STUDENT_ID,
      balance: overrides.balance ?? -450_000,
      companyId: COMPANY_ID,
    },
    group: {
      id: GROUP_ID,
      branchId: 1,
      companyId: COMPANY_ID,
      course: {
        price: overrides.price ?? 600_000,
        lessonPaymentCount: overrides.lessonPaymentCount ?? 12,
      },
    },
  };
}

function attendance(status: AttendanceStatus, day: number) {
  return { status, date: new Date(2026, 0, day) };
}

describe('DebtWriteOffService.computeEligibility', () => {
  let service: DebtWriteOffService;
  let client: any;
  let transactionsService: any;
  let entityHistoryService: any;

  beforeEach(async () => {
    client = buildClient();
    transactionsService = {
      recordDebtWriteOff: jest.fn(),
      reverseTransaction: jest.fn(),
    };
    entityHistoryService = {
      recordUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DebtWriteOffService,
        { provide: PrismaService, useValue: client },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    service = module.get(DebtWriteOffService);
  });

  it('returns NotFoundException when enrollment is missing', async () => {
    client.enrollment.findFirst.mockResolvedValue(null);
    await expect(
      service.computeEligibility(ENROLLMENT_ID, COMPANY_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns NO_DEBT when balance >= 0', async () => {
    client.enrollment.findFirst.mockResolvedValue(makeEnrollment({ balance: 0 }));
    client.attendance.findMany.mockResolvedValue([
      attendance(AttendanceStatus.ABSENT, 1),
    ]);

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NO_DEBT');
    expect(result.details.suggestedWriteOff).toBe(0);
  });

  it('returns STUDENT_ATTENDED when current cycle has any PRESENT', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -450_000 }),
    );
    client.attendance.findMany.mockResolvedValue([
      attendance(AttendanceStatus.PRESENT, 1),
      attendance(AttendanceStatus.ABSENT, 2),
      attendance(AttendanceStatus.ABSENT, 3),
    ]);

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('STUDENT_ATTENDED');
  });

  it('returns STUDENT_ATTENDED when current cycle has any LATE', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -100_000 }),
    );
    client.attendance.findMany.mockResolvedValue([
      attendance(AttendanceStatus.LATE, 1),
    ]);

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('STUDENT_ATTENDED');
  });

  it('returns NO_ABSENT_IN_CYCLE when only EXCUSED records exist', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -50_000 }),
    );
    client.attendance.findMany.mockResolvedValue([
      attendance(AttendanceStatus.EXCUSED, 1),
      attendance(AttendanceStatus.EXCUSED, 2),
    ]);

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NO_ABSENT_IN_CYCLE');
  });

  it('eligible: 9 ABSENT (cycle 1) + -450k balance → write off 450k', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -450_000, price: 600_000, lessonPaymentCount: 12 }),
    );
    // 9 ta ABSENT — sikl 1 ichida
    client.attendance.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => attendance(AttendanceStatus.ABSENT, i + 1)),
    );

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(result.eligible).toBe(true);
    expect(result.details.cycleAbsentCount).toBe(9);
    expect(result.details.perLessonCost).toBe(50_000);
    expect(result.details.theoreticalCycleDebt).toBe(9 * 50_000);
    expect(result.details.suggestedWriteOff).toBe(450_000);
    expect(result.details.cycleNumber).toBe(1);
  });

  it('cap rule: theoretical debt > |balance| → write off only |balance|', async () => {
    // balans -100k, lekin 9 ta ABSENT × 50k = 450k nazariy. Cap=100k.
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -100_000, price: 600_000, lessonPaymentCount: 12 }),
    );
    client.attendance.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => attendance(AttendanceStatus.ABSENT, i + 1)),
    );

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(result.eligible).toBe(true);
    expect(result.details.theoreticalCycleDebt).toBe(450_000);
    expect(result.details.suggestedWriteOff).toBe(100_000); // capped
  });

  it('cycle 2: ignores cycle 1 attendances, only counts cycle 2', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -250_000, price: 600_000, lessonPaymentCount: 12 }),
    );
    // 12 ta PRESENT (sikl 1) + 5 ta ABSENT (sikl 2 boshlangan)
    const cycle1 = Array.from({ length: 12 }, (_, i) =>
      attendance(AttendanceStatus.PRESENT, i + 1),
    );
    const cycle2 = Array.from({ length: 5 }, (_, i) =>
      attendance(AttendanceStatus.ABSENT, i + 13),
    );
    client.attendance.findMany.mockResolvedValue([...cycle1, ...cycle2]);

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(result.eligible).toBe(true);
    expect(result.details.cycleNumber).toBe(2);
    expect(result.details.cyclePresentCount).toBe(0);  // faqat sikl 2
    expect(result.details.cycleAbsentCount).toBe(5);   // sikl 2 da 5 ABSENT
    expect(result.details.theoreticalCycleDebt).toBe(5 * 50_000);
    expect(result.details.suggestedWriteOff).toBe(250_000);
  });

  it('partial cycle 1 (4/12): eligible if all ABSENT', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -200_000, price: 600_000, lessonPaymentCount: 12 }),
    );
    client.attendance.findMany.mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => attendance(AttendanceStatus.ABSENT, i + 1)),
    );

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(result.eligible).toBe(true);
    expect(result.details.cycleNumber).toBe(1);
    expect(result.details.cycleAbsentCount).toBe(4);
    expect(result.details.suggestedWriteOff).toBe(200_000);
  });

  it('uses LESSON_DEDUCTION.metadata.perLessonCost when available (price changed later)', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -400_000, price: 900_000, lessonPaymentCount: 12 }),
    );
    // Kurs hozir 900k (75k/dars), lekin oldingi sikl 600k narxda yozilgan
    client.transaction.findFirst.mockResolvedValue({
      metadata: { perLessonCost: 50_000 },
    });
    client.attendance.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => attendance(AttendanceStatus.ABSENT, i + 1)),
    );

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(result.details.perLessonCost).toBe(50_000); // eski narx
    expect(result.details.theoreticalCycleDebt).toBe(8 * 50_000); // 400k
  });

  it('startDate filter: ignores attendances before enrollment.startDate', async () => {
    const startDate = new Date(2026, 0, 10);
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -150_000, startDate }),
    );
    client.attendance.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) =>
        attendance(AttendanceStatus.ABSENT, i + 11),
      ),
    );

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(client.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: startDate },
        }),
      }),
    );
    expect(result.details.cycleAbsentCount).toBe(3);
  });

  it('excludes cancelled-lesson attendances (cancellationId IS NOT NULL)', async () => {
    client.enrollment.findFirst.mockResolvedValue(makeEnrollment());
    client.attendance.findMany.mockResolvedValue([]);

    await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(client.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cancellationId: null,
        }),
      }),
    );
  });
});

describe('DebtWriteOffService.executeWriteOff', () => {
  let service: DebtWriteOffService;
  let client: any;
  let transactionsService: any;
  let entityHistoryService: any;

  beforeEach(async () => {
    client = buildClient();
    transactionsService = {
      recordDebtWriteOff: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      reverseTransaction: jest.fn(),
    };
    entityHistoryService = {
      recordUpdate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DebtWriteOffService,
        { provide: PrismaService, useValue: client },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    service = module.get(DebtWriteOffService);
  });

  it('rejects when reason is too short', async () => {
    await expect(
      service.executeWriteOff(
        {
          enrollmentId: ENROLLMENT_ID,
          companyId: COMPANY_ID,
          performedById: PERFORMER_ID,
          reason: 'ha',
          confirmAmount: 100_000,
        },
        client,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when eligibility fails inside the tx (race condition)', async () => {
    client.enrollment.findFirst.mockResolvedValue(makeEnrollment({ balance: 0 }));

    await expect(
      service.executeWriteOff(
        {
          enrollmentId: ENROLLMENT_ID,
          companyId: COMPANY_ID,
          performedById: PERFORMER_ID,
          reason: 'Yo\'qolgan o\'quvchi',
          confirmAmount: 0,
        },
        client,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when confirmAmount does not match suggestedWriteOff', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -450_000 }),
    );
    client.attendance.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => attendance(AttendanceStatus.ABSENT, i + 1)),
    );

    await expect(
      service.executeWriteOff(
        {
          enrollmentId: ENROLLMENT_ID,
          companyId: COMPANY_ID,
          performedById: PERFORMER_ID,
          reason: "Yo'qolgan o'quvchi — joriy siklda kelmagan",
          confirmAmount: 999_999, // noto'g'ri
        },
        client,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('happy path: writes DEBT_WRITE_OFF + Student history', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -450_000 }),
    );
    client.enrollment.findUnique.mockResolvedValue({
      studentId: STUDENT_ID,
      group: { branchId: 1, companyId: COMPANY_ID },
    });
    client.attendance.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => attendance(AttendanceStatus.ABSENT, i + 1)),
    );

    const result = await service.executeWriteOff(
      {
        enrollmentId: ENROLLMENT_ID,
        companyId: COMPANY_ID,
        performedById: PERFORMER_ID,
        reason: "Yo'qolgan o'quvchi — joriy siklda kelmagan",
        confirmAmount: 450_000,
      },
      client,
    );

    expect(transactionsService.recordDebtWriteOff).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: STUDENT_ID,
        amount: 450_000,
        enrollmentId: ENROLLMENT_ID,
        performedById: PERFORMER_ID,
        metadata: expect.objectContaining({
          cycleNumber: 1,
          cycleAbsentCount: 9,
          perLessonCost: 50_000,
          theoreticalCycleDebt: 450_000,
          actualWriteOff: 450_000,
          previousBalance: -450_000,
          newBalance: 0,
        }),
      }),
      client,
    );

    expect(entityHistoryService.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: STUDENT_ID,
        oldValues: { balance: -450_000 },
        newValues: { balance: 0 },
        changedById: PERFORMER_ID,
        companyId: COMPANY_ID,
      }),
    );

    expect(result.balanceBefore).toBe(-450_000);
    expect(result.balanceAfter).toBe(0);
  });

  it('partial write-off: cap at |balance|, previous-cycle debt remains', async () => {
    // balans -100k, 9 ABSENT × 50k = 450k nazariy. Yozish: 100k. Yangi balans: 0.
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -100_000 }),
    );
    client.enrollment.findUnique.mockResolvedValue({
      studentId: STUDENT_ID,
      group: { branchId: 1, companyId: COMPANY_ID },
    });
    client.attendance.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => attendance(AttendanceStatus.ABSENT, i + 1)),
    );

    await service.executeWriteOff(
      {
        enrollmentId: ENROLLMENT_ID,
        companyId: COMPANY_ID,
        performedById: PERFORMER_ID,
        reason: "Yo'qolgan o'quvchi — joriy sikl",
        confirmAmount: 100_000,
      },
      client,
    );

    expect(transactionsService.recordDebtWriteOff).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100_000,
        metadata: expect.objectContaining({
          theoreticalCycleDebt: 450_000,
          actualWriteOff: 100_000,
        }),
      }),
      client,
    );
  });
});
