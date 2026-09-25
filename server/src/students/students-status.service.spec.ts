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

/**
 * A frozen student who quits for good is expelled in one step.
 *
 * The real StatusHistoryService and StatusCascadeService run here over an
 * in-memory enrollment table, because the break this guards lived inside
 * them: the transition table refused FROZEN → EXPELLED with a 400 while the
 * dialog offered it, so admins reactivated the student first. That wrote a
 * return nobody made, and the departed-students report counted a second
 * departure. With either service mocked this test would stay green on that
 * bug.
 *
 * Money is not asserted here. The cascade hands each dropped enrollment to
 * the same refund helpers as every other expulsion, and their
 * no-second-refund guarantee lives in their own specs
 * (`monthly-charge.service.spec.ts`, `enrollment-billing.service.spec.ts`).
 */
describe('StudentsStatusService — expelling a frozen student', () => {
  const companyId = 1001;
  const userId = 10001;
  const studentId = 10453;
  const expelReason = {
    id: 'reason-quit',
    name: "O'qishni tashladi",
    appliesTo: ['EXPEL'],
  };

  interface FakeEnrollment {
    id: string;
    studentId: number;
    status: string;
    deletedAt: Date | null;
    groupId: string;
    group: { companyId: number; course: { paymentModel: string } };
    student: { firstName: string; lastName: string };
  }

  interface EnrollmentWhere {
    studentId?: number;
    deletedAt?: null;
    status?: string | { in: string[] };
  }

  interface GroupHistoryRow {
    entityType: string;
    entityId: string;
    oldValues: Record<string, unknown>;
  }

  const enrollment = (
    id: string,
    groupId: string,
    status: string,
    paymentModel: string,
  ): FakeEnrollment => ({
    id,
    studentId,
    status,
    deletedAt: null,
    groupId,
    group: { companyId, course: { paymentModel } },
    student: { firstName: 'Ali', lastName: 'Valiyev' },
  });

  // Understands only the filters the Student cascade sends. Anything else
  // fails loudly instead of quietly matching every row.
  const matches = (e: FakeEnrollment, where: EnrollmentWhere) => {
    for (const key of Object.keys(where)) {
      if (!['studentId', 'deletedAt', 'status'].includes(key)) {
        throw new Error(`fake enrollment table: unsupported filter "${key}"`);
      }
    }
    if (where.studentId !== undefined && e.studentId !== where.studentId) {
      return false;
    }
    if (where.deletedAt === null && e.deletedAt !== null) return false;
    if (typeof where.status === 'string') return e.status === where.status;
    if (where.status) return where.status.in.includes(e.status);
    return true;
  };

  let enrollments: FakeEnrollment[];
  let statusHistoryRows: Array<Record<string, unknown>>;
  let cardUpdates: Array<Record<string, unknown>>;
  let stateLogRows: Array<Record<string, unknown>>;
  let entityHistory: Record<string, jest.Mock>;

  beforeEach(async () => {
    enrollments = [
      enrollment('enr-monthly', 'group-monthly', 'FROZEN', 'MONTHLY'),
      enrollment('enr-pack', 'group-pack', 'FROZEN', 'LESSON_PACK'),
      // A group the student finished long ago: the expulsion must not touch it.
      enrollment('enr-finished', 'group-finished', 'COMPLETED', 'MONTHLY'),
    ];
    statusHistoryRows = [];
    cardUpdates = [];
    stateLogRows = [];

    const prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: studentId,
          firstName: 'Ali',
          lastName: 'Valiyev',
          status: StudentStatus.FROZEN,
          isActive: false,
          companyId,
          deletedAt: null,
        }),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          cardUpdates.push(data);
          return Promise.resolve({
            id: studentId,
            ...data,
            companyId,
            branches: [],
            enrollments: [],
          });
        }),
      },
      // The caller is a CEO, who spans every branch.
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
      // Answers only for the exit type it is asked about, so a lookup made
      // for the FREEZE list (the status the student is leaving) finds nothing.
      studentExitReason: {
        findFirst: jest.fn(
          ({ where }: { where: { id: string; appliesTo: { has: string } } }) =>
            Promise.resolve(
              where.id === expelReason.id &&
                expelReason.appliesTo.includes(where.appliesTo.has)
                ? expelReason
                : null,
            ),
        ),
        count: jest.fn().mockResolvedValue(1),
      },
      statusHistory: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          statusHistoryRows.push(data);
          return Promise.resolve(data);
        }),
      },
      enrollment: {
        findMany: jest.fn(({ where }: { where: EnrollmentWhere }) =>
          Promise.resolve(enrollments.filter((e) => matches(e, where))),
        ),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: EnrollmentWhere;
            data: { status: string };
          }) => {
            const hit = enrollments.filter((e) => matches(e, where));
            for (const e of hit) e.status = data.status;
            return Promise.resolve({ count: hit.length });
          },
        ),
      },
      enrollmentStateLog: {
        createMany: jest.fn(
          ({ data }: { data: Array<Record<string, unknown>> }) => {
            stateLogRows.push(...data);
            return Promise.resolve({ count: data.length });
          },
        ),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma),
    );
    entityHistory = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };
    const enrollmentBilling = {
      refundPrepaidWithOverride: jest.fn(),
      refundPrepaidToBalance: jest.fn().mockResolvedValue(null),
    };
    const monthlyCharge = {
      reverseChargeForDeparture: jest.fn().mockResolvedValue(null),
      restoreChargeForReturn: jest.fn().mockResolvedValue(null),
    };

    const service = new StudentsStatusService(
      prisma as never,
      new StatusHistoryService(prisma as never),
      new StatusCascadeService(
        prisma as never,
        entityHistory as never,
        enrollmentBilling as never,
        monthlyCharge as never,
      ),
      entityHistory as never,
      enrollmentBilling as never,
      monthlyCharge as never,
    );

    await service.changeStatus(
      studentId,
      { status: StudentStatus.EXPELLED, reasonId: expelReason.id } as never,
      userId,
      companyId,
    );
  });

  it('writes FROZEN → EXPELLED to StatusHistory', () => {
    expect(statusHistoryRows).toEqual([
      {
        entityType: 'Student',
        entityId: '10453',
        fromStatus: 'FROZEN',
        toStatus: 'EXPELLED',
        reason: "O'qishni tashladi",
        changedById: 10001,
        companyId: 1001,
      },
    ]);
  });

  it("writes FROZEN → EXPELLED to the student's EntityHistory", () => {
    expect(entityHistory.recordStatusChange).toHaveBeenCalledTimes(1);
    expect(entityHistory.recordStatusChange).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 10453,
      oldValues: { status: 'FROZEN' },
      newValues: { status: 'EXPELLED', reason: "O'qishni tashladi" },
      changedById: 10001,
      companyId: 1001,
    });
  });

  it('marks the card EXPELLED with the chosen expulsion reason', () => {
    expect(cardUpdates).toHaveLength(1);
    expect(cardUpdates[0]).toMatchObject({
      status: 'EXPELLED',
      isActive: false,
      statusChangeReasonId: 'reason-quit',
    });
  });

  it('drops every frozen enrollment and logs each drop, leaving a finished group alone', () => {
    expect(enrollments.map((e) => [e.id, e.status])).toEqual([
      ['enr-monthly', 'DROPPED'],
      ['enr-pack', 'DROPPED'],
      ['enr-finished', 'COMPLETED'],
    ]);
    expect(stateLogRows).toMatchObject([
      { enrollmentId: 'enr-monthly', status: 'DROPPED', changedById: 10001 },
      { enrollmentId: 'enr-pack', status: 'DROPPED', changedById: 10001 },
    ]);
  });

  it("records the expulsion in each frozen group's history", () => {
    const calls = entityHistory.recordDelete.mock.calls as Array<
      [GroupHistoryRow]
    >;
    expect(
      calls.map(([row]) => [row.entityType, row.entityId, row.oldValues]),
    ).toEqual([
      [
        'Group',
        'group-monthly',
        {
          action: 'OQUVCHI_CHETLATILDI',
          oquvchi: 'Ali Valiyev',
          oquvchiId: 10453,
        },
      ],
      [
        'Group',
        'group-pack',
        {
          action: 'OQUVCHI_CHETLATILDI',
          oquvchi: 'Ali Valiyev',
          oquvchiId: 10453,
        },
      ],
    ]);
  });
});
