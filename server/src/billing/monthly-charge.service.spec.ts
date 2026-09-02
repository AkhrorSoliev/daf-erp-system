import { BadRequestException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ChargeableEnrollment,
  MonthlyChargeService,
} from './monthly-charge.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsWriteService } from '../transactions/transactions-write.service';

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
      },
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthlyChargeService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TransactionsWriteService, useValue: txWriteMock },
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
        none: { periodYear: 2026, periodMonth: 10 },
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
      });

      const charge = await service.findChargeForLesson(
        tx,
        'enr-1',
        new Date('2026-09-10T00:00:00Z'),
      );

      expect(charge).toEqual({ id: 'charge-1' });
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
  });
});
