import { StudentStatus } from '@prisma/client';
import { StudentsStatusService } from './students-status.service';

describe('StudentsStatusService.pauseForAbsence', () => {
  const companyId = 1001;

  function makeService(student: Record<string, unknown> | null) {
    const prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue(student),
        // `formatStudent` bu uchta munosabatni kutadi — mock ularsiz
        // yiqiladi va test aslida nimani tekshirayotgani ko'rinmay qoladi.
        update: jest.fn().mockResolvedValue({
          id: 10001,
          branches: [],
          enrollments: [],
        }),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      studentExitReason: { findFirst: jest.fn(), count: jest.fn() },
      $transaction: jest.fn(),
    };
    const statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({
        statusChangedAt: new Date('2026-09-19T02:30:00.000Z'),
        statusChangedById: undefined,
        statusChangeReason: 'x',
      }),
    };
    const statusCascadeService = { cascade: jest.fn().mockResolvedValue([]) };
    const entityHistoryService = { recordStatusChange: jest.fn() };
    const enrollmentBillingService = { refundPrepaidWithOverride: jest.fn() };
    const service = new StudentsStatusService(
      prisma as never,
      statusHistoryService as never,
      statusCascadeService as never,
      entityHistoryService as never,
      enrollmentBillingService as never,
    );
    return {
      service,
      prisma,
      statusHistoryService,
      statusCascadeService,
      entityHistoryService,
    };
  }

  const activeStudent = {
    id: 10001,
    companyId,
    status: StudentStatus.ACTIVE,
  };

  const params = {
    studentId: 10001,
    companyId,
    streak: 3,
    lastAbsenceDate: new Date('2026-09-12T00:00:00.000Z'),
  };

  it("tizim aktori filial tekshiruvisiz muzlatadi va sababni o'zi yozadi", async () => {
    const { service, prisma, statusHistoryService, statusCascadeService } =
      makeService(activeStudent);

    await service.pauseForAbsence(params);

    expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        fromStatus: StudentStatus.ACTIVE,
        toStatus: StudentStatus.FROZEN,
        changedById: undefined,
        reason: expect.stringContaining('Avtomatik pauza:'),
      }),
    );

    // Sabab o'z-o'zini tushuntirsin — necha dars va qachon.
    const reason = statusHistoryService.changeStatus.mock.calls[0][0]
      .reason as string;
    expect(reason).toContain('3 ta');
    expect(reason).toContain('12.09.2026');

    // Ro'yxatdan sabab tanlash TALAB QILINMAYDI — «Avtomatik pauza» degan
    // qator ro'yxatda yo'q va uni qo'shish adminni chalg'itardi.
    expect(prisma.studentExitReason.count).not.toHaveBeenCalled();
    expect(prisma.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StudentStatus.FROZEN,
          isActive: false,
          statusChangeReasonId: null,
        }),
      }),
    );
    expect(statusCascadeService.cascade).toHaveBeenCalledWith(
      'Student',
      '10001',
      StudentStatus.FROZEN,
      undefined,
    );
  });

  it("ACTIVE bo'lmagan o'quvchini jimgina o'tkazib yuboradi", async () => {
    // Cron nomzodlarni yig'gani bilan pauza qilgani orasida admin uni
    // chiqarib yuborgan bo'lishi mumkin — bu xato emas.
    const { service, statusHistoryService } = makeService({
      ...activeStudent,
      status: StudentStatus.FROZEN,
    });

    await service.pauseForAbsence(params);

    expect(statusHistoryService.changeStatus).not.toHaveBeenCalled();
  });

  it("boshqa kompaniyaning o'quvchisiga tegmaydi", async () => {
    const { service, statusHistoryService } = makeService(null);

    await service.pauseForAbsence(params);

    expect(statusHistoryService.changeStatus).not.toHaveBeenCalled();
  });
});
