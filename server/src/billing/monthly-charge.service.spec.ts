import { BadRequestException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ChargeableEnrollment,
  MonthlyChargeService,
} from './monthly-charge.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsWriteService } from '../transactions/transactions-write.service';
import { SettingsService } from '../settings/settings.service';

// Cast once here rather than `as any` at every call site below: the shape
// matches `ChargeableEnrollment` at runtime (Prisma's string enums compare
// equal to the plain string literals used here), this just satisfies the
// stricter compile-time enum types.
const enrollment = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 'enr-1',
    studentId: 10453,
    groupId: 'grp-1',
    status: 'ACTIVE',
    startDate: null,
    group: {
      id: 'grp-1',
      branchId: 1,
      companyId: 1,
      statusEnum: 'ACTIVE',
      exactDays: ['saturday', 'thursday', 'tuesday'],
      course: {
        price: 450_000,
        paymentModel: 'MONTHLY',
        lessonPaymentCount: 12,
      },
    },
    ...over,
  }) as unknown as ChargeableEnrollment;

describe('MonthlyChargeService', () => {
  let service: MonthlyChargeService;
  let prismaMock: any;
  let txWriteMock: any;
  let settingsMock: any;
  let tx: any;
  // The service does create() then update() on the same row (the second
  // write stamps transactionId once the ledger row exists). This mirrors
  // that: update()'s mocked return merges onto the object create() made,
  // so assertions on the FINAL returned charge still see plannedLessons,
  // chargedAmount, etc. — not just the transactionId the update call sent.
  let lastChargeRow: any;

  beforeEach(async () => {
    lastChargeRow = null;

    prismaMock = {
      enrollmentMonthlyCharge: {
        // Default: no existing charge for the requested period, and no
        // carried-over credit from the previous period. Individual tests
        // override this with mockImplementation/mockResolvedValueOnce.
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: any) => {
          lastChargeRow = { id: 'charge-1', status: 'CHARGED', ...data };
          return Promise.resolve(lastChargeRow);
        }),
        update: jest.fn(({ data }: any) => {
          lastChargeRow = { ...lastChargeRow, ...data };
          return Promise.resolve(lastChargeRow);
        }),
        // `reverseMonthlyCharge` ledger qatoridan hisobni topadi.
        findFirst: jest.fn().mockResolvedValue(null),
      },
      // Markaz qoplagan accrual'lar bayrog'ini tozalash
      // (`clearCenterTopUpForPeriod`). Odatiy — tegadigan qator yo'q.
      salaryAccrual: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([]),
        // Default shape for reverseChargeForDeparture's own lookup —
        // matches the `enrollment()` fixture above (saturday/thursday/
        // tuesday, branch 1). Individual tests override with
        // mockResolvedValueOnce as needed.
        findUnique: jest.fn().mockResolvedValue({
          studentId: 10453,
          group: {
            branchId: 1,
            exactDays: ['saturday', 'thursday', 'tuesday'],
          },
        }),
      },
      // `createChargesForPeriod` opens ITS OWN tx per enrollment — tests for
      // it stub `createChargeForEnrollment` directly (already covered above),
      // so this just has to invoke the callback with something tx-shaped.
      $transaction: jest.fn((cb: any) => cb(prismaMock)),
    };
    tx = prismaMock;

    txWriteMock = {
      chargeMonthlyFee: jest.fn().mockResolvedValue({ id: 'txn-1' }),
      reverseMonthlyFee: jest.fn(),
      createAdjustment: jest.fn().mockResolvedValue({ id: 'adj-1' }),
    };

    // Sozlamalarning boshlang'ich (kod ichidagi) qiymatlarini aks ettiradi:
    // kredit yoqilgan, cheklovsiz — mavjud testlar shu yordamida
    // o'zgarishsiz o'tadi. Sozlama-xos testlar buni mockResolvedValueOnce
    // bilan qayta belgilaydi.
    settingsMock = {
      get: jest.fn((_companyId: number, key: string) => {
        if (key === 'payment.excusedCreditEnabled')
          return Promise.resolve(true);
        if (key === 'payment.excusedCreditMonthlyCap')
          return Promise.resolve(null);
        return Promise.resolve(undefined);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthlyChargeService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TransactionsWriteService, useValue: txWriteMock },
        { provide: SettingsService, useValue: settingsMock },
      ],
    }).compile();

    service = module.get(MonthlyChargeService);
  });

  describe('createChargeForEnrollment', () => {
    it('to`liq oyda oy narxini muzlatilgan dars soni bilan yozadi', async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });

      expect(charge).toMatchObject({
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        monthlyPrice: 450_000,
        chargedAmount: 450_000,
        creditLessons: 0,
        status: 'CHARGED',
      });
      // Qoplangan dars SANALARI muzlatiladi — `reverseChargeForDeparture`
      // ularni jonli kalendardan qayta hisoblamasligi uchun.
      expect((charge as { coveredDates: string[] }).coveredDates).toEqual([
        '2026-09-01',
        '2026-09-03',
        '2026-09-05',
        '2026-09-08',
        '2026-09-10',
        '2026-09-12',
        '2026-09-15',
        '2026-09-17',
        '2026-09-19',
        '2026-09-22',
        '2026-09-24',
        '2026-09-26',
        '2026-09-29',
      ]);
      expect(txWriteMock.chargeMonthlyFee).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 450_000, enrollmentId: 'enr-1' }),
        tx,
      );
    });

    it('o`rtada qo`shilgan o`quvchiga qolgan darslar bo`yicha proratsiya qiladi', async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment({ startDate: new Date('2026-09-17T00:00:00Z') }),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });

      expect(charge?.plannedLessons).toBe(13); // guruhning oyi o'zgarmaydi
      // 17, 19, 22, 24, 26, 29 — olti dars qoldi.
      expect(charge?.coveredLessons).toBe(6);
      expect(charge?.chargedAmount).toBe(207_692); // 450 000 x 6/13
    });

    it('o`tgan oyning uzrli darslarini kredit sifatida chegiradi', async () => {
      // Sentabr hisobida excusedLessons = 2 turibdi. `findUnique` ikki xil
      // maqsadda chaqiriladi — joriy davr (oktabr) uchun "mavjudmi" tekshiruvi
      // va o'tgan davr (sentabr) uchun kredit qidiruvi — shuning uchun
      // qaysi davr so'ralganiga qarab javob beramiz, chaqiruv tartibiga
      // tayanmaymiz.
      prismaMock.enrollmentMonthlyCharge.findUnique.mockImplementation(
        ({ where }: any) => {
          const key = where.enrollmentId_periodYear_periodMonth;
          if (key.periodMonth === 9) {
            return Promise.resolve({ excusedLessons: 2 });
          }
          return Promise.resolve(null);
        },
      );

      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 10,
        companyId: 1,
      });

      // Kredit OKTABRning o'z dars narxida sarflanadi, sentabrniki emas —
      // oktabrda sat/thu/tue bo'yicha 14 dars bor (sentabrda 13 edi), shuning
      // uchun perLessonCost = round(450 000/14) = 32 143.
      expect(charge?.plannedLessons).toBe(14);
      expect(charge?.perLessonCost).toBe(32_143);
      expect(charge?.creditLessons).toBe(2);
      expect(charge?.creditAmount).toBe(64_286); // 2 x 32 143
      expect(charge?.chargedAmount).toBe(385_714); // 450 000 - 64 286
    });

    it('payment.excusedCreditEnabled=false bo`lsa kredit umuman o`tmaydi', async () => {
      settingsMock.get.mockImplementation((_companyId: number, key: string) => {
        if (key === 'payment.excusedCreditEnabled')
          return Promise.resolve(false);
        if (key === 'payment.excusedCreditMonthlyCap')
          return Promise.resolve(null);
        return Promise.resolve(undefined);
      });
      prismaMock.enrollmentMonthlyCharge.findUnique.mockImplementation(
        ({ where }: any) => {
          const key = where.enrollmentId_periodYear_periodMonth;
          if (key.periodMonth === 9) {
            return Promise.resolve({ excusedLessons: 2 });
          }
          return Promise.resolve(null);
        },
      );

      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 10,
        companyId: 1,
      });

      // O'tgan oyda 2 ta uzrli kredit bo'lsa ham — sozlama o'chirilgani
      // uchun bu oy uni ko'rmaydi: to'liq narx yechiladi.
      expect(charge?.creditLessons).toBe(0);
      expect(charge?.creditAmount).toBe(0);
      expect(charge?.chargedAmount).toBe(450_000);
    });

    it('payment.excusedCreditMonthlyCap kreditni cheklaydi', async () => {
      settingsMock.get.mockImplementation((_companyId: number, key: string) => {
        if (key === 'payment.excusedCreditEnabled')
          return Promise.resolve(true);
        if (key === 'payment.excusedCreditMonthlyCap')
          return Promise.resolve(1);
        return Promise.resolve(undefined);
      });
      prismaMock.enrollmentMonthlyCharge.findUnique.mockImplementation(
        ({ where }: any) => {
          const key = where.enrollmentId_periodYear_periodMonth;
          if (key.periodMonth === 9) {
            return Promise.resolve({ excusedLessons: 2 });
          }
          return Promise.resolve(null);
        },
      );

      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 10,
        companyId: 1,
      });

      // 2 ta bor edi, lekin cheklov 1 — faqat 1 tasi shu oyga o'tadi.
      expect(charge?.plannedLessons).toBe(14);
      expect(charge?.perLessonCost).toBe(32_143);
      expect(charge?.creditLessons).toBe(1);
      expect(charge?.creditAmount).toBe(32_143);
      expect(charge?.chargedAmount).toBe(417_857); // 450 000 - 32 143
      // Qolgan 1 tasi KUYMAYDI — keyingi oy ko'rishi uchun shu hisobning
      // o'z uzrli sanog'ida qoladi (regression: avval bu yerda 0 bo'lib,
      // cheklovdan oshgan kredit butunlay yo'qolardi).
      expect(charge?.excusedLessons).toBe(1);
    });

    it('cheklov ustma-ust oylarga SURADI, hech narsa kuymaydi (5 ta, cheklov 2 -> 2, 2, 1)', async () => {
      settingsMock.get.mockImplementation((_companyId: number, key: string) => {
        if (key === 'payment.excusedCreditEnabled')
          return Promise.resolve(true);
        if (key === 'payment.excusedCreditMonthlyCap')
          return Promise.resolve(2);
        return Promise.resolve(undefined);
      });

      // Har `createChargeForEnrollment` chaqiruvi `enrollmentMonthlyCharge.
      // findUnique`ni aniq IKKI marta chaqiradi, shu tartibda: (1) "joriy
      // davr uchun hisob bormi" (har doim yo'q — bu test uchtala oyni ham
      // yangidan hisoblaydi), (2) `carriedCredit()` orqali "o'tgan oy"ning
      // uzrli sanog'i. Har chaqiruvdan oldin shu ikkitasini navbat bilan
      // qo'yib, davrga qarab shoxlanadigan qidiruvga tayanmaymiz — bu yerda
      // aniq nechta va qaysi tartibda chaqirilishi muhim.
      const queueCurrentThenPrevious = (prevExcusedLessons: number) => {
        prismaMock.enrollmentMonthlyCharge.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ excusedLessons: prevExcusedLessons });
      };

      // Oy 1 (sentabr): 5 ta bor, cheklov 2 -> 2 tasi ishlatiladi, 3 tasi
      // suriladi (cheklovdan oshgan qism, hammasi affordable — 14 dars
      // narxi 450 000 buni yutadi).
      queueCurrentThenPrevious(5);
      const charge1 = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });
      expect(charge1?.creditLessons).toBe(2);
      expect(charge1?.excusedLessons).toBe(3);

      // Oy 2 (oktabr): 3 ta bor, cheklov 2 -> 2 tasi ishlatiladi, 1 tasi
      // suriladi.
      queueCurrentThenPrevious(charge1!.excusedLessons);
      const charge2 = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 10,
        companyId: 1,
      });
      expect(charge2?.creditLessons).toBe(2);
      expect(charge2?.excusedLessons).toBe(1);

      // Oy 3 (noyabr): 1 ta qoldi, cheklov 2 dan kam bo'lgani uchun
      // cheklov ishlamaydi — bittasi ham ishlatiladi, qoldiq 0.
      queueCurrentThenPrevious(charge2!.excusedLessons);
      const charge3 = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 11,
        companyId: 1,
      });
      expect(charge3?.creditLessons).toBe(1);
      expect(charge3?.excusedLessons).toBe(0);

      // Jami ishlatilgan: 2 + 2 + 1 = 5 — boshlang'ich 5 tadan bittasi
      // ham yo'qolmagan.
      expect(
        (charge1?.creditLessons ?? 0) +
          (charge2?.creditLessons ?? 0) +
          (charge3?.creditLessons ?? 0),
      ).toBe(5);
    });

    it('LESSON_PACK kursini butunlay chetlab o`tadi', async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment({
          group: {
            ...enrollment().group,
            course: {
              price: 450_000,
              paymentModel: 'LESSON_PACK',
              lessonPaymentCount: 12,
            },
          },
        }),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });
      expect(charge).toBeNull();
      expect(txWriteMock.chargeMonthlyFee).not.toHaveBeenCalled();
    });

    it('PAUSED guruhga hisob yozmaydi', async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment({
          group: { ...enrollment().group, statusEnum: 'PAUSED' },
        }),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });
      expect(charge).toBeNull();
    });

    it('FROZEN yozilishga hisob yozmaydi', async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment({ status: 'FROZEN' }),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });
      expect(charge).toBeNull();
    });

    it('oyda birorta dars bo`lmasa hisob yozmaydi', async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment({
          group: { ...enrollment().group, exactDays: [] },
        }),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });
      expect(charge).toBeNull();
    });

    it('ikkinchi marta chaqirilganda yangi qator yozmaydi (idempotent)', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        status: 'CHARGED',
      });

      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });

      expect(charge?.id).toBe('chg-1');
      expect(txWriteMock.chargeMonthlyFee).not.toHaveBeenCalled();
    });

    it('BEKOR QILINGAN oyni qayta hisoblaydi (yangi qator emas, o`shanisi)', async () => {
      // Admin sentabr hisobini bekor qildi -> `REVERSED`. Cron/qorovul o'sha
      // oyni QAYTA yozishi kerak: aks holda 450 000 so'mlik oy bepul qolardi.
      lastChargeRow = { id: 'chg-1', status: 'REVERSED' };
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        status: 'REVERSED',
      });

      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });

      expect(prismaMock.enrollmentMonthlyCharge.create).not.toHaveBeenCalled();
      expect(txWriteMock.chargeMonthlyFee).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 450_000 }),
        tx,
      );
      expect(charge).toMatchObject({
        id: 'chg-1',
        status: 'CHARGED',
        chargedAmount: 450_000,
        transactionId: 'txn-1',
      });
    });

    it('bayram kunlarini rejadan chiqaradi va dars narxini oshiradi', async () => {
      // 1-sentabr 2026 — seshanba, ya'ni rejadagi kunlardan biri.
      // `buildHolidayDateSet` `date` va `endDate` ikkalasini o'qiydi, shu
      // sababli bir kunlik bayram uchun ham ikkalasini beramiz.
      prismaMock.holiday.findMany.mockResolvedValueOnce([
        {
          date: new Date('2026-09-01T00:00:00Z'),
          endDate: new Date('2026-09-01T00:00:00Z'),
        },
      ]);

      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });

      expect(charge?.plannedLessons).toBe(12);
      expect(charge?.perLessonCost).toBe(37_500); // 450 000 / 12
      expect(charge?.chargedAmount).toBe(450_000); // oy narxi o'zgarmaydi
    });
  });

  describe('createChargeForEnrollment — chegirma', () => {
    const baseParams = {
      enrollment: enrollment(),
      periodYear: 2026,
      periodMonth: 9,
      companyId: 1,
    };

    it('50% chegirmali o`quvchidan yarim pul yechadi', async () => {
      // Sentabr 13 dars, 450 000 -> chegirmasiz 450 000, 50% bilan 225 000.
      const charge = await service.createChargeForEnrollment(tx, {
        ...baseParams,
        discountPercent: 50,
      });
      expect(charge?.chargedAmount).toBe(225_000);
    });

    it('perLessonCost ni CHEGIRMASIZ saqlaydi — o`qituvchi haqi kamaymaydi', async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        ...baseParams,
        discountPercent: 50,
      });
      expect(charge?.perLessonCost).toBe(34_615); // 450 000 / 13, chegirmasiz
      expect(charge?.discountPercent).toBe(50);
    });

    it('kreditni CHEGIRMALI narxda hisoblaydi', async () => {
      // O'tgan oydan (avgust) 2 ta uzrli dars. 50% chegirmali o'quvchi
      // uchun bitta dars 17 308 turadi (34 615 ning yarmi), 34 615 emas.
      prismaMock.enrollmentMonthlyCharge.findUnique.mockImplementation(
        ({ where }: any) => {
          const key = where.enrollmentId_periodYear_periodMonth;
          if (key.periodMonth === 8) {
            return Promise.resolve({ excusedLessons: 2 });
          }
          return Promise.resolve(null);
        },
      );

      const charge = await service.createChargeForEnrollment(tx, {
        ...baseParams,
        discountPercent: 50,
      });
      expect(charge?.creditAmount).toBe(34_616); // 2 x 17 308
      expect(charge?.chargedAmount).toBe(190_384); // 225 000 - 34 616
    });

    it('chegirmasiz o`quvchi uchun hech narsa o`zgarmaydi', async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        ...baseParams,
        discountPercent: 0,
      });
      expect(charge?.chargedAmount).toBe(450_000);
      expect(charge?.discountPercent).toBe(0);
    });

    it('100% chegirma nol to`lov beradi, lekin hisob qatori YARATILADI', async () => {
      // Qator kerak: o'qituvchi haqi va uzrli dars krediti shunga yoziladi.
      const charge = await service.createChargeForEnrollment(tx, {
        ...baseParams,
        discountPercent: 100,
      });
      expect(charge?.chargedAmount).toBe(0);
      expect(charge?.perLessonCost).toBe(34_615);
    });

    it('chegirma metadata sifatida chargeMonthlyFee ga o`tadi', async () => {
      await service.createChargeForEnrollment(tx, {
        ...baseParams,
        discountPercent: 50,
      });
      expect(txWriteMock.chargeMonthlyFee).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 225_000,
          discountPercent: 50,
          fullAmount: 450_000,
        }),
        tx,
      );
    });
  });

  describe('createChargesForPeriod', () => {
    // `createChargeForEnrollment` o'zi yuqorida to'liq test qilingan — bu
    // yerda uni stub qilamiz, faqat ko'p yozilishni aylantirish va xatoni
    // izolyatsiya qilish mantig'ini tekshiramiz.
    let chargeSpy: jest.SpyInstance;

    beforeEach(() => {
      chargeSpy = jest.spyOn(service, 'createChargeForEnrollment');
    });

    afterEach(() => {
      chargeSpy.mockRestore();
    });

    const enr = (id: string) => enrollment({ id });

    it('so`rov joriy davr uchun hisobi yo`q yozilishlarnigina qaytaradi', async () => {
      prismaMock.enrollment.findMany.mockResolvedValueOnce([]);

      await service.createChargesForPeriod({
        companyId: 1,
        periodYear: 2026,
        periodMonth: 10,
      });

      const call = prismaMock.enrollment.findMany.mock.calls[0][0];
      expect(call.where.monthlyCharges).toEqual({
        // `status` shart: bekor qilingan hisob yozilishni qamrovdan
        // chiqarmasligi kerak, aks holda o'sha oy qayta yozilmasdi.
        none: { periodYear: 2026, periodMonth: 10, status: 'CHARGED' },
      });
      expect(call.where.status).toBe('ACTIVE');
      expect(call.where.student).toEqual({ deletedAt: null, status: 'ACTIVE' });
    });

    it('har yozilishni alohida tranzaksiyada yozadi — bittasi yiqilsa qolganlari yiqilmaydi', async () => {
      prismaMock.enrollment.findMany.mockResolvedValueOnce([
        enr('enr-a'),
        enr('enr-b'),
        enr('enr-c'),
      ]);
      chargeSpy
        .mockResolvedValueOnce({ id: 'chg-a', chargedAmount: 450_000 })
        .mockRejectedValueOnce(new Error('B yiqildi'))
        .mockResolvedValueOnce({ id: 'chg-c', chargedAmount: 450_000 });

      const res = await service.createChargesForPeriod({
        companyId: 1,
        periodYear: 2026,
        periodMonth: 10,
      });

      expect(res.created).toBe(2);
      expect(res.skipped).toBe(1);
      expect(chargeSpy).toHaveBeenCalledTimes(3);
    });

    it('yaratilgan hisoblarning summasini qaytaradi', async () => {
      prismaMock.enrollment.findMany.mockResolvedValueOnce([
        enr('enr-a'),
        enr('enr-b'),
      ]);
      chargeSpy
        .mockResolvedValueOnce({ id: 'chg-a', chargedAmount: 450_000 })
        .mockResolvedValueOnce({ id: 'chg-b', chargedAmount: 450_000 });

      const res = await service.createChargesForPeriod({
        companyId: 1,
        periodYear: 2026,
        periodMonth: 10,
      });

      expect(res.totalCharged).toBe(900_000); // 2 x 450 000
      expect(res.created).toBe(2);
    });

    it('hisob kerak bo`lmasa (masalan oyda dars yo`q) skipped sifatida sanaydi, xato yozmaydi', async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      prismaMock.enrollment.findMany.mockResolvedValueOnce([enr('enr-a')]);
      chargeSpy.mockResolvedValueOnce(null);

      const res = await service.createChargesForPeriod({
        companyId: 1,
        periodYear: 2026,
        periodMonth: 10,
      });

      expect(res.created).toBe(0);
      expect(res.skipped).toBe(1);
      expect(res.totalCharged).toBe(0);
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('hech qanday yozilish topilmasa bo`sh natija qaytaradi (kunlik qorovul uchun xavfsiz)', async () => {
      prismaMock.enrollment.findMany.mockResolvedValueOnce([]);

      const res = await service.createChargesForPeriod({
        companyId: 1,
        periodYear: 2026,
        periodMonth: 10,
      });

      expect(res).toEqual({ created: 0, skipped: 0, totalCharged: 0 });
      expect(chargeSpy).not.toHaveBeenCalled();
    });

    it('sozlamalarni FILIAL boshiga bir marta o`qiydi — har yozilish uchun emas (Redis o`chganda N+1 to`foniga yo`l qo`ymaslik)', async () => {
      // `chargeSpy` bu yerda ustidan yozilmaydi (haqiqiy implementatsiya
      // ishlaydi) — maqsad settingsMock.get chaqiruvlarini sanash. 3 ta
      // yozilish, lekin faqat 2 ta FARQLI filial (1 va 2) — to'g'ri
      // xatti-harakat: settingsService.get 2 kalit x 2 filial = 4 marta
      // chaqiriladi, 2 kalit x 3 yozilish = 6 marta emas.
      const enrOnBranch = (id: string, branchId: number) =>
        enrollment({
          id,
          group: {
            id: `grp-${branchId}`,
            branchId,
            companyId: 1,
            statusEnum: 'ACTIVE',
            exactDays: ['saturday', 'thursday', 'tuesday'],
            course: {
              price: 450_000,
              paymentModel: 'MONTHLY',
              lessonPaymentCount: 12,
            },
          },
        });
      prismaMock.enrollment.findMany.mockResolvedValueOnce([
        enrOnBranch('enr-a', 1),
        enrOnBranch('enr-b', 1),
        enrOnBranch('enr-c', 2),
      ]);
      // Har yozilish o'z hisobi uchun "mavjudmi" va "o'tgan oy krediti"
      // so'rovlarini qiladi — ikkalasiga ham "yo'q" javob beramiz, faqat
      // to'liq oqim yiqilmasligi kerak (haqiqiy hisob mantig'i tekshirilmayapti).
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue(null);

      await service.createChargesForPeriod({
        companyId: 1,
        periodYear: 2026,
        periodMonth: 10,
      });

      const excusedCreditCalls = settingsMock.get.mock.calls.filter(
        ([, key]: [number, string]) =>
          key === 'payment.excusedCreditEnabled' ||
          key === 'payment.excusedCreditMonthlyCap',
      );
      expect(excusedCreditCalls).toHaveLength(4);
    });
  });

  describe('recordExcusedLesson', () => {
    it('uzrli darsni o`sha oyning hisobiga qo`shadi', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValueOnce({
        id: 'charge-1',
      });

      await service.recordExcusedLesson(tx, {
        enrollmentId: 'enr-1',
        lessonDate: new Date('2026-09-10T00:00:00Z'),
        delta: 1,
      });

      expect(prismaMock.enrollmentMonthlyCharge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { excusedLessons: { increment: 1 } },
        }),
      );
    });

    it('tuzatishda (uzrli -> keldi) sanoqni kamaytiradi', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValueOnce({
        id: 'charge-1',
      });

      await service.recordExcusedLesson(tx, {
        enrollmentId: 'enr-1',
        lessonDate: new Date('2026-09-10T00:00:00Z'),
        delta: -1,
      });

      expect(prismaMock.enrollmentMonthlyCharge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { excusedLessons: { increment: -1 } },
        }),
      );
    });

    it('o`sha oyning hisobi topilmasa jim o`tadi, lekin xatolik jurnalga yoziladi', async () => {
      // Koordinator qarori (5-vazifa sharhidan keyin): kredit bu holatda
      // hech qanday izsiz yo'qolmasligi kerak — hisob shu yerda shoshilinch
      // yaratilmaydi (buni 7-vazifadagi cron o'zi tuzatadi), ammo bo'shliq
      // jurnalda ko'rinib turishi shart.
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.recordExcusedLesson(tx, {
          enrollmentId: 'enr-1',
          lessonDate: new Date('2026-09-10T00:00:00Z'),
          delta: 1,
        }),
      ).resolves.toBeUndefined();

      expect(prismaMock.enrollmentMonthlyCharge.update).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('enr-1'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('2026-09'));
      errorSpy.mockRestore();
    });
  });

  describe('findChargeForLesson', () => {
    it('dars sanasidan davrni chiqarib hisobni topadi', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValueOnce({
        id: 'charge-1',
        status: 'CHARGED',
      });

      const charge = await service.findChargeForLesson(
        tx,
        'enr-1',
        new Date('2026-09-10T00:00:00Z'),
      );

      expect(charge).toEqual({ id: 'charge-1', status: 'CHARGED' });
      expect(
        prismaMock.enrollmentMonthlyCharge.findUnique,
      ).toHaveBeenCalledWith({
        where: {
          enrollmentId_periodYear_periodMonth: {
            enrollmentId: 'enr-1',
            periodYear: 2026,
            periodMonth: 9,
          },
        },
      });
    });

    it('BEKOR QILINGAN hisobni "hisob yo`q" deb ko`rsatadi', async () => {
      // Aks holda o'qituvchi haqi allaqachon teskari qilingan ledger
      // qatoriga bog'lanardi. `null` -> chaqiruvchining `centerFunded`
      // zaxira yo'li ishlaydi.
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValueOnce({
        id: 'charge-1',
        status: 'REVERSED',
      });

      const charge = await service.findChargeForLesson(
        tx,
        'enr-1',
        new Date('2026-09-10T00:00:00Z'),
      );

      expect(charge).toBeNull();
    });
  });

  describe('reverseMonthlyCharge', () => {
    it('pulni qaytaradi VA hisob qatorini REVERSED qiladi', async () => {
      prismaMock.enrollmentMonthlyCharge.findFirst.mockResolvedValueOnce({
        id: 'chg-1',
        status: 'CHARGED',
      });

      const res = await service.reverseMonthlyCharge(tx, {
        transactionId: 'txn-1',
        companyId: 1,
        reason: 'Xato hisoblandi',
        performedById: 7,
      });

      expect(res).toEqual({ chargeId: 'chg-1' });
      expect(txWriteMock.reverseMonthlyFee).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: 'txn-1', companyId: 1 }),
        tx,
      );
      expect(prismaMock.enrollmentMonthlyCharge.update).toHaveBeenCalledWith({
        where: { id: 'chg-1' },
        data: { status: 'REVERSED' },
      });
    });

    it('mos hisob topilmasa PULGA TEGMAYDI', async () => {
      prismaMock.enrollmentMonthlyCharge.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.reverseMonthlyCharge(tx, {
          transactionId: 'txn-yo`q',
          companyId: 1,
          reason: 'Xato hisoblandi',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(txWriteMock.reverseMonthlyFee).not.toHaveBeenCalled();
    });

    it('allaqachon bekor qilingan hisobni ikkinchi marta bekor qilmaydi', async () => {
      prismaMock.enrollmentMonthlyCharge.findFirst.mockResolvedValueOnce({
        id: 'chg-1',
        status: 'REVERSED',
      });

      await expect(
        service.reverseMonthlyCharge(tx, {
          transactionId: 'txn-1',
          companyId: 1,
          reason: 'Xato hisoblandi',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(txWriteMock.reverseMonthlyFee).not.toHaveBeenCalled();
    });
  });

  describe('reverseChargeForDeparture', () => {
    it('o`tmagan darslar ulushini balansga qaytaradi', async () => {
      // 20.09 da chiqdi. Sentabrda 13 dars, 9 tasi o'tgan, 4 tasi qolgan.
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        chargedAmount: 450_000,
        transactionId: 'tx-1',
        status: 'CHARGED',
      });

      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-20T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      });

      expect(res?.refunded).toBe(138_460); // 4 x 34 615
      expect(txWriteMock.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 10453,
          amount: 138_460,
          companyId: 1,
          branchId: 1,
        }),
        tx,
      );
      expect(prismaMock.enrollmentMonthlyCharge.update).toHaveBeenCalledWith({
        where: { id: 'chg-1' },
        data: { coveredLessons: 9, chargedAmount: 311_540 },
      });
    });

    it('oy o`rtasida dars bekor qilinsa ham qaytarilgan summa O`ZGARMAYDI (muzlatilgan sanalar)', async () => {
      // Spec 5.5. Ilgari `lessonsThroughDeparture` JONLI `resolveExcludedDates`
      // dan qayta hisoblanardi: 10-sentabrga bekor qilingan dars qo'shilsa,
      // "ketguncha qoplangan" 9 dan 8 ga tushib, `remaining` 4 dan 5 ga
      // chiqardi — o'quvchiga bo'lib o'tmagan dars uchun ham 34 615 so'm
      // qaytarilardi.
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        coveredDates: [
          '2026-09-01',
          '2026-09-03',
          '2026-09-05',
          '2026-09-08',
          '2026-09-10',
          '2026-09-12',
          '2026-09-15',
          '2026-09-17',
          '2026-09-19',
          '2026-09-22',
          '2026-09-24',
          '2026-09-26',
          '2026-09-29',
        ],
        perLessonCost: 34_615,
        chargedAmount: 450_000,
        transactionId: 'tx-1',
        status: 'CHARGED',
      });
      // Hisob yozilgandan KEYIN qo'shilgan bekor qilish.
      prismaMock.lessonCancellation.findMany.mockResolvedValue([
        { date: new Date('2026-09-10T00:00:00Z') },
      ]);

      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-20T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      });

      expect(res?.refunded).toBe(138_460); // 4 x 34 615, 5 x emas
      // Jonli kalendarga umuman qaralmaydi.
      expect(prismaMock.lessonCancellation.findMany).not.toHaveBeenCalled();
    });

    it('oy oxirida chiqqanda hech narsa qaytarmaydi', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        chargedAmount: 450_000,
        transactionId: 'tx-1',
        status: 'CHARGED',
      });

      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-30T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      });

      expect(res).toBeNull();
      expect(txWriteMock.createAdjustment).not.toHaveBeenCalled();
    });

    it('qaytarilgan summa hech qachon yechilgandan ko`p bo`lmaydi', async () => {
      // Kredit tufayli faqat 5 so'm yechilgan oy: 4 dars ulushi undan katta.
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        chargedAmount: 5,
        transactionId: 'tx-1',
        status: 'CHARGED',
      });

      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-20T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      });

      expect(res?.refunded).toBe(5);
    });

    it('50% chegirmali o`quvchi uchun CHEGIRMALI narxda qaytaradi', async () => {
      // 20.09 da chiqdi, xuddi birinchi testdagi kabi: 13 dars, 9 o'tgan,
      // 4 qolgan. perLessonCost ATAYLAB chegirmasiz (34 615) saqlanadi,
      // lekin qaytarish o'quvchi TO'LAGAN 50% chegirmali narxda bo'lishi
      // kerak: applyDiscount(34 615, 50) = 17 308, 4 x 17 308 = 69 232 —
      // chegirmasiz holatdagi 138 460 ning yarmiga yaqin, ikki barobar EMAS.
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        discountPercent: 50,
        chargedAmount: 225_000,
        transactionId: 'tx-1',
        status: 'CHARGED',
      });

      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-20T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      });

      expect(res?.refunded).toBe(69_232);
      expect(txWriteMock.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 69_232 }),
        tx,
      );
    });

    it('0% chegirmada natija eskisidan farq qilmaydi (fix mavjud qatorlar uchun no-op)', async () => {
      // Xuddi birinchi testdagi stsenariy, faqat endi `discountPercent: 0`
      // ANIQ berilgan — tuzatish chegirmasiz yozilishlarga tegmasligini
      // pinlash uchun.
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        discountPercent: 0,
        chargedAmount: 450_000,
        transactionId: 'tx-1',
        status: 'CHARGED',
      });

      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-20T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      });

      expect(res?.refunded).toBe(138_460); // 4 x 34 615, eskisi bilan bir xil
    });

    it('chegirmali dars narxida ham qaytarish yechilgandan oshmaydi (cap)', async () => {
      // Kredit tufayli faqat 5 so'm yechilgan oy, 50% chegirma bilan ham:
      // 4 x 17 308 = 69 232 ancha katta, lekin chargedAmount=5 qopqog'i
      // ishlashi kerak.
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        discountPercent: 50,
        chargedAmount: 5,
        transactionId: 'tx-1',
        status: 'CHARGED',
      });

      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-20T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      });

      expect(res?.refunded).toBe(5);
    });

    it('hisob topilmasa null qaytaradi', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue(null);
      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-20T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      });
      expect(res).toBeNull();
      expect(txWriteMock.createAdjustment).not.toHaveBeenCalled();
    });

    it('REVERSED holatidagi hisobni qaytarilgan deb hisoblamaydi', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        chargedAmount: 450_000,
        transactionId: 'tx-1',
        status: 'REVERSED',
      });

      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-20T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      });

      expect(res).toBeNull();
      expect(txWriteMock.createAdjustment).not.toHaveBeenCalled();
    });

    it('ikkinchi marta chaqirilganda qayta qaytarmaydi (idempotent)', async () => {
      // Coordinator review finding #1: `remaining` avval kalendardan
      // qayta-qayta hisoblanardi va chaqirilgan safar sayin bir xil summani
      // yana qaytarardi. Bu test HAQIQIY DB holatini simulyatsiya qiladi —
      // findUnique ikkinchi chaqiruvda birinchisining `update`i natijasini
      // ko'rishi kerak (avvalgi testlardagi kabi bir martalik mock emas).
      let chargeRow: any = {
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        chargedAmount: 450_000,
        transactionId: 'tx-1',
        status: 'CHARGED',
      };
      prismaMock.enrollmentMonthlyCharge.findUnique.mockImplementation(() =>
        Promise.resolve({ ...chargeRow }),
      );
      prismaMock.enrollmentMonthlyCharge.update.mockImplementation(
        ({ data }: any) => {
          chargeRow = { ...chargeRow, ...data };
          return Promise.resolve({ ...chargeRow });
        },
      );

      const params = {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-20T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      };

      const first = await service.reverseChargeForDeparture(tx, params);
      const second = await service.reverseChargeForDeparture(tx, params);

      expect(first?.refunded).toBe(138_460); // 4 x 34 615
      expect(second).toBeNull(); // nothing left to reconcile the 2nd time
      expect(txWriteMock.createAdjustment).toHaveBeenCalledTimes(1);
      expect(chargeRow.coveredLessons).toBe(9);
      expect(chargeRow.chargedAmount).toBe(311_540);
    });

    it('departureDate bugundan oldingi bo`lsa BadRequestException', async () => {
      // Hazard #2 (coordinator finding #3): backdated chiqish allaqachon
      // o'tilgan (va o'qituvchiga hisoblangan) darslarni ham "qolgan" deb
      // hisoblab qaytarib yuborardi. Yagona chaqiruvchi doim `new Date()`
      // yuboradi, lekin imzo o'zboshimcha `departureDate` qabul qiladi —
      // shu tekshiruv kelajakdagi chaqiruvchilarni jim xatodan himoya qiladi.
      await expect(
        service.reverseChargeForDeparture(tx, {
          enrollmentId: 'enr-1',
          departureDate: new Date('2020-01-01T00:00:00Z'),
          companyId: 1,
          reason: 'Guruhdan chiqdi',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(
        prismaMock.enrollmentMonthlyCharge.findUnique,
      ).not.toHaveBeenCalled();
    });

    it('chaqiruvchi `today` ni o`zi bersa, haqiqiy soat tun yarmidan o`tib ketgan bo`lsa ham backdated deb rad etmaydi', async () => {
      // Round-3 finding: StatusCascadeService `departureDate`ni BIR marta
      // ushlab, o'nlab-yuzlab yozilishni ketma-ket Serializable
      // tranzaksiyalarda ishlaydi — sikl haqiqiy Toshkent yarim tunidan
      // o'tib ketishi mumkin. Agar bu funksiya HAR safar o'zi `new Date()`
      // hisoblasa, sikl o'rtasida "bugun" bir kunga siljib, hali bitta ham
      // marta ishlanmagan (lekin haqiqatda backdated BO'LMAGAN)
      // `departureDate`ni noto'g'ri rad etardi. `today` tashqaridan
      // berilganda — hatto haqiqiy vaqt ancha oldinga ketgan bo'lsa ham —
      // faqat SHU qiymatga qarab qaror qilinadi.
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        chargedAmount: 450_000,
        transactionId: 'tx-1',
        status: 'CHARGED',
      });

      // departureDate haqiqiy devorli soatdan (2026-09-02) ANCHA oldin —
      // `today` berilmasa, bu backdated deb rad etilardi.
      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2020-01-01T00:00:00Z'),
        today: '2020-01-01', // chaqiruvchining o'z, bir marta ushlangan soati
        companyId: 1,
        reason: 'Guruhdan chiqdi',
      });

      expect(res).not.toBeNull();
    });
  });

  describe("markaz qoplagani hisob yozilganda o'z-o'zidan tozalanadi", () => {
    /**
     * 12 talik yo'lda `isCenterTopUp` keyingi to'lov darsni yopganda
     * `createAccrual({ centerFunded: false })` orqali tozalanadi. Oylik
     * yo'lda o'tgan darsga hech qachon qayta accrual yozilmaydi, shuning
     * uchun bayroq abadiy yoqilgan qolib, «Markaz qopladi» raqamlari
     * markaz undirib bo'lgan pulni ham qarz qilib ko'rsatardi.
     */
    it("davrning markaz qoplagan accrual'larini «undirildi» ga o'tkazadi", async () => {
      await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });

      expect(prismaMock.salaryAccrual.updateMany).toHaveBeenCalledTimes(1);
      const call = prismaMock.salaryAccrual.updateMany.mock.calls[0][0];

      expect(call.where).toEqual({
        companyId: 1,
        studentId: 10453,
        groupId: 'grp-1',
        isCenterTopUp: true,
        // `@db.Date` — surilmagan UTC chegaralari, yuqorisi OCHIQ.
        lessonDate: {
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lt: new Date('2026-10-01T00:00:00.000Z'),
        },
      });
      // FAQAT bayroq: `wasCenterTopUp` yopishqoq bo'lib qoladi, `amount` ga
      // tegilmaydi.
      expect(call.data).toEqual({ isCenterTopUp: false });
      expect(Object.keys(call.data)).not.toContain('wasCenterTopUp');
      expect(Object.keys(call.data)).not.toContain('amount');
    });

    it('dekabrda keyingi yilga to`g`ri o`tadi', async () => {
      await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 12,
        companyId: 1,
      });

      expect(
        prismaMock.salaryAccrual.updateMany.mock.calls[0][0].where.lessonDate,
      ).toEqual({
        gte: new Date('2026-12-01T00:00:00.000Z'),
        lt: new Date('2027-01-01T00:00:00.000Z'),
      });
    });

    it('PUL QIMIRLAMAYDI — ledger va o`qituvchi balansiga tegilmaydi', async () => {
      await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });

      // Bayroq almashishi accrual'ni QAYTA yozmaydi: `createAccrual` ham,
      // uning ichidagi `applyAccrualToBalance` ham umuman ishga tushmaydi,
      // shuning uchun ikkinchi SALARY_ACCRUAL Transaction ham,
      // `User.balance` o'zgarishi ham bo'lishi mumkin emas. Ayni shu sabab
      // `lesson-billing.service.ts` dagi «reversalsiz qayta narxlama»
      // invarianti ham buzilmaydi.
      expect(prismaMock.salaryAccrual.update).toBeUndefined();
      expect(prismaMock.salaryAccrual.upsert).toBeUndefined();
      expect(prismaMock.transaction).toBeUndefined();
      expect(prismaMock.user).toBeUndefined();
      // O'quvchidan yechish faqat BIR marta — oylik hisobning o'zi.
      expect(txWriteMock.chargeMonthlyFee).toHaveBeenCalledTimes(1);
    });

    it("hisob yozilmagan oyda (dars yo'q) bayroqqa ham tegilmaydi", async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        // O'quvchi oy tugagandan KEYIN qo'shilgan: qoplangan dars 0,
        // shuning uchun hisob umuman yozilmaydi.
        enrollment: enrollment({
          startDate: new Date('2026-10-15T00:00:00Z'),
        }),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });

      expect(charge).toBeNull();
      expect(prismaMock.salaryAccrual.updateMany).not.toHaveBeenCalled();
    });

    it("allaqachon KUCHDAGI hisob qayta tozalamaydi (idempotent yo'l)", async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValueOnce({
        id: 'charge-1',
        status: 'CHARGED',
      });

      await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });

      expect(prismaMock.salaryAccrual.updateMany).not.toHaveBeenCalled();
    });
  });
});
