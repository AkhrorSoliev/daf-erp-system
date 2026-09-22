import { Test, TestingModule } from '@nestjs/testing';
import { StudentsStatusService } from './students-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { EnrollmentBillingService } from '../billing/enrollment-billing.service';
import { MonthlyChargeService } from '../billing/monthly-charge.service';
import { StudentStatus } from '@prisma/client';

describe('StudentsStatusService', () => {
  let service: StudentsStatusService;
  let prisma: any;
  let monthlyCharge: any;

  const companyId = 1001;
  const userId = 10001;
  const studentId = 10453;

  const mockStudent = {
    id: studentId,
    firstName: 'Ali',
    lastName: 'Valiyev',
    status: StudentStatus.ACTIVE,
    isActive: true,
    companyId,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue(mockStudent),
        update: jest
          .fn()
          .mockResolvedValue({ ...mockStudent, branches: [], enrollments: [] }),
      },
      // The freeze path's LESSON_PACK leg (`refundPrepaidForFreeze`) — no
      // prepaid-bearing enrollments by default, so it never runs in tests
      // that only care about the MONTHLY leg.
      enrollment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      studentExitReason: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      // The caller: a CEO spans every branch, so `assertCallerMayTouchStudent`
      // never needs a real branch list.
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsStatusService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StatusHistoryService,
          useValue: {
            changeStatus: jest.fn().mockResolvedValue({
              statusChangedAt: new Date(),
              statusChangedById: userId,
            }),
          },
        },
        {
          provide: StatusCascadeService,
          useValue: { cascade: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EntityHistoryService,
          useValue: {
            recordStatusChange: jest.fn(),
          },
        },
        {
          provide: EnrollmentBillingService,
          useValue: {
            refundPrepaidWithOverride: jest.fn(),
          },
        },
        {
          provide: MonthlyChargeService,
          useValue: (monthlyCharge = {
            reverseChargeForDeparture: jest.fn().mockResolvedValue(null),
          }),
        },
      ],
    }).compile();

    service = module.get(StudentsStatusService);
  });

  describe('changeStatus → FROZEN, oylik kurs', () => {
    it("o'tmagan darslar pulini balansga qaytaradi", async () => {
      // Oylik kursdagi aktiv yozilish, sentabr hisobi bor.
      prisma.enrollment.findMany.mockResolvedValue([
        { id: 'enr-1', group: { companyId } },
      ]);
      monthlyCharge.reverseChargeForDeparture.mockResolvedValue({
        refunded: 257_144,
      });

      await service.changeStatus(
        studentId,
        { status: StudentStatus.FROZEN, reason: 'Sinov sababi' } as never,
        userId,
        companyId,
      );

      expect(monthlyCharge.reverseChargeForDeparture).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          enrollmentId: 'enr-1',
          reason: expect.stringContaining('Muzlatish'),
        }),
      );
    });

    it('12 talik kursda reverseChargeForDeparture CHAQIRILMAYDI', async () => {
      // `reverseChargeForDeparture` o'zi non-MONTHLY kursda null qaytaradi,
      // lekin muzlatish yo'li uni umuman chaqirmasligi kerak — chunki
      // `refundPrepaidForFreeze` o'sha yozilishni allaqachon qaytargan.
      // Ikkalasi bir yozilishda ishlasa, ikki marta qaytarish xavfi tug'iladi.
      //
      // `refundMonthlyForFreeze` bu holatni QUERY DARAJASIDA chetlab
      // o'tadi — `enrollment.findMany` `paymentModel: MONTHLY` bilan
      // filtrlanadi, shuning uchun LESSON_PACK yozilishi natijada
      // umuman qaytmaydi (mock shu filtrlangan natijani ifodalab, bo'sh
      // massiv qaytaradi — Postgres'ning o'zi shu where bilan hech narsa
      // qaytarmagan bo'lardi).
      prisma.enrollment.findMany.mockResolvedValue([]);

      await service.changeStatus(
        studentId,
        { status: StudentStatus.FROZEN, reason: 'Sinov sababi' } as never,
        userId,
        companyId,
      );

      expect(monthlyCharge.reverseChargeForDeparture).not.toHaveBeenCalled();
      // So'rovning o'zi MONTHLY bilan filtrlanganini tekshiramiz — bu
      // yerda LESSON_PACK yozilishi qaytishi mumkin emasligining sababi.
      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId,
            status: 'ACTIVE',
            group: { course: { paymentModel: 'MONTHLY' } },
          }),
        }),
      );
    });

    // Spec 4-bo'limdagi asosiy pul invarianti — muzlatish qaytardi, keyin
    // o'quvchi guruhdan chiqarildi -> IKKINCHI marta qaytmasligi shart —
    // ATAYLAB bu yerda test qilinmaydi. `reverseChargeForDeparture`ning
    // o'zi shu servisda mock qilingan, shuning uchun uni to'g'ridan-to'g'ri
    // chaqirib "ikkinchi marta null qaytaradi" deb tekshirish faqat
    // mockning o'zini sinaydi — implementatsiyani EMAS (2026-09-03 kod
    // ko'rigi: shu naqshdagi test `plannedLessons`/`coveredLessons`
    // almashtirilgan xatoni ushlay olmadi). Haqiqiy idempotentlik
    // himoyasi — `charge.coveredLessons`ning jonli holatidan hisoblanishi —
    // `server/src/billing/monthly-charge.service.spec.ts`dagi
    // "ikkinchi marta chaqirilganda qayta qaytarmaydi (idempotent)"
    // testida yotadi: u haqiqiy `reverseChargeForDeparture`ni statefull
    // Prisma mock ustida ikki marta ketma-ket chaqiradi va shu implementatsiya
    // xatosida qizil bo'lib qoladi. Bu fayl faqat "MONTHLY freeze
    // reverseChargeForDeparture'ni chaqiradi" chegarasini sinaydi —
    // funksiyaning o'z ichki arifmetikasi emas.

    it("muzlatish qaytarishi yiqilsa status O'ZGARMAYDI", async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { id: 'enr-1', group: { companyId } },
      ]);
      monthlyCharge.reverseChargeForDeparture.mockRejectedValue(
        new Error('tranzaksiya yiqildi'),
      );

      await expect(
        service.changeStatus(
          studentId,
          { status: StudentStatus.FROZEN, reason: 'Sinov sababi' } as never,
          userId,
          companyId,
        ),
      ).rejects.toThrow();
      expect(prisma.student.update).not.toHaveBeenCalled();
    });
  });
});

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
    // Avtomatik pauza ham `applyStatusChange` orqali o'tadi, ya'ni oylik
    // qaytarish oyog'iga ham kiradi. Yuqoridagi `enrollment.findMany` bo'sh
    // ro'yxat qaytargani uchun u erta to'xtaydi va bu mok hech qachon
    // chaqirilmaydi — lekin u bo'lmasa servis umuman qurilmaydi.
    const monthlyChargeService = {
      reverseChargeForDeparture: jest.fn().mockResolvedValue(null),
    };
    const service = new StudentsStatusService(
      prisma as never,
      statusHistoryService as never,
      statusCascadeService as never,
      entityHistoryService as never,
      enrollmentBillingService as never,
      monthlyChargeService as never,
    );
    return {
      service,
      prisma,
      statusHistoryService,
      statusCascadeService,
      entityHistoryService,
      monthlyChargeService,
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
