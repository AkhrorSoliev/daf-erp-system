import { EnrollmentStatus, GroupStatus, PaymentModel } from '@prisma/client';
import type { ChargeableEnrollment } from '../../src/billing/monthly-charge.service';
import {
  applyMigrationForStudent,
  ApplyMigrationDeps,
  EnrollmentToMigrate,
} from './monthly-migration-apply';

const PERIOD_GTE = new Date('2026-09-01T00:00:00.000Z');
const PERIOD_LT = new Date('2026-10-01T00:00:00.000Z');

/** `makeDeps` ning standart `refundPrepaidToBalance` javobi. */
const DEFAULT_REFUND = 187_500;

type EnrollmentOverride = Partial<Omit<EnrollmentToMigrate, 'enrollment'>> & {
  enrollment?: Partial<ChargeableEnrollment>;
};

function makeEnrollment(over: EnrollmentOverride = {}): EnrollmentToMigrate {
  const enrollment: ChargeableEnrollment = {
    id: 'enr-1',
    studentId: 10453,
    groupId: 'grp-1',
    status: EnrollmentStatus.ACTIVE,
    startDate: null,
    group: {
      id: 'grp-1',
      branchId: 1,
      companyId: 1,
      statusEnum: GroupStatus.ACTIVE,
      exactDays: ['MON', 'WED'],
      course: { price: 450_000, paymentModel: PaymentModel.LESSON_PACK },
    },
    ...over.enrollment,
  };
  return {
    courseId: 'course-1',
    discountPercent: 0,
    chargeable: true,
    expectedPrepaidRefund: DEFAULT_REFUND,
    prepaidCoveredByReversal: 0,
    expectedCarriedIn: { lessons: 0, value: 0 },
    ...over,
    enrollment,
  };
}

/** Minimal mock of the tx client — only the model methods this module calls. */
function makeTx(over: Record<string, unknown> = {}) {
  return {
    student: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ balance: -120_000 }),
    },
    transaction: {
      findMany: jest.fn().mockResolvedValue([]),
      // Prepaid'ni qoplab turgan batch — standart: yo'q.
      findFirst: jest.fn().mockResolvedValue(null),
    },
    enrollment: {
      update: jest.fn().mockResolvedValue({}),
    },
    course: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    enrollmentMonthlyCharge: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    attendance: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    lessonTeacherOverride: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    groupTeacher: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeDeps(over: Partial<ApplyMigrationDeps> = {}): ApplyMigrationDeps {
  return {
    reverseTransaction: jest.fn().mockResolvedValue({ amount: 40_000 }),
    refundPrepaidToBalance: jest
      .fn()
      .mockResolvedValue({ refunded: 187_500, lessons: 5 }),
    createChargeForEnrollment: jest.fn().mockResolvedValue({
      chargedAmount: 450_000,
      perLessonCost: 34_615,
      transactionId: 'tx-charge-1',
      // 13 ATAYLAB — kursning `lessonPaymentCount`i (12) emas. Bo'luvchi
      // uzatilmay qolsa `createAccrual` 12 ga tushadi va pastdagi test
      // yiqiladi.
      plannedLessons: 13,
    }),
    reverseAccrualForAttendance: jest.fn().mockResolvedValue(null),
    createAccrual: jest.fn().mockResolvedValue({ id: 'accrual-1' }),
    computeCarriedIn: jest
      .fn()
      .mockResolvedValue({ lessons: 0, value: 0, batches: [] }),
    createAdjustment: jest.fn().mockResolvedValue({ id: 'adj-1' }),
    ...over,
  };
}

describe('applyMigrationForStudent', () => {
  it("baland yo'l: reverse -> refund -> nol -> MONTHLY -> hisob -> accrual, va balans formulasi tekshiriladi", async () => {
    const tx = makeTx({
      transaction: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ded-1' }]),
        // Prepaid'ni qoplagan batch AVGUSTdan — shu sababli prepaid
        // alohida qaytariladi (davr ichidagi batch bo'lganda qaytarilmasdi).
        findFirst: jest.fn().mockResolvedValue({
          id: 'ded-aug',
          createdAt: new Date('2026-08-04T09:00:00.000Z'),
        }),
      },
      attendance: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'att-1', date: new Date('2026-09-02'), groupId: 'grp-1' },
          ]),
      },
      groupTeacher: {
        findMany: jest.fn().mockResolvedValue([{ teacherId: 777 }]),
      },
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -120_000 }) // oldBalance
          // -120000 + 187500 (prepaid) + 40000 (reversed) - 450000 (charge)
          .mockResolvedValueOnce({ balance: -342_500 }), // newBalance
      },
    });
    const deps = makeDeps();

    const result = await applyMigrationForStudent({
      tx,
      deps,
      studentId: 10453,
      companyId: 1,
      performedById: 999,
      periodYear: 2026,
      periodMonth: 9,
      periodGte: PERIOD_GTE,
      periodLt: PERIOD_LT,
      enrollments: [makeEnrollment()],
    });

    expect(result).toEqual({
      studentId: 10453,
      oldBalance: -120_000,
      prepaidRefund: 187_500,
      carriedInCredit: 0,
      reversedSeptember: 40_000,
      monthlyCharge: 450_000,
      newBalance: -342_500,
      reversedDeductionCount: 1,
      accrualsRecomputed: 1,
      accrualsSkipped: 0,
      carriedInHeld: 0,
      chargesCreated: 1,
      chargesSkipped: 0,
      skippedEnrollmentIds: [],
    });

    // Tartib: prepaid qaytarish AVVAL, teskari qilish keyin. Teskarisi
    // `prepaidRefundValue`ni metadatasiz teskari qatorga tushirib, chegirmasiz
    // (2x) narxni qaytarardi — fayl boshidagi izohga qarang.
    const reverseCall = (deps.reverseTransaction as jest.Mock).mock
      .invocationCallOrder[0];
    const refundCall = (deps.refundPrepaidToBalance as jest.Mock).mock
      .invocationCallOrder[0];
    expect(refundCall).toBeLessThan(reverseCall);

    // Accrual: AVVAL reverse, KEYIN create — shart (accrueMonthlySalary sharhi).
    const accrualReverseCall = (deps.reverseAccrualForAttendance as jest.Mock)
      .mock.invocationCallOrder[0];
    const accrualCreateCall = (deps.createAccrual as jest.Mock).mock
      .invocationCallOrder[0];
    expect(accrualReverseCall).toBeLessThan(accrualCreateCall);

    // C1: kurs bayrog'iga bu yerda TEGILMAYDI. `Course.paymentModel` KURS
    // darajasidagi maydon — uni bitta o'quvchining tranzaksiyasida
    // almashtirish ishlab turgan backendni o'sha kursdagi hali ko'chmagan
    // ~300 yozilishga qarshi qurollantirardi (kunlik qorovul har biriga
    // to'liq oylik hisob yozardi). Bayroqni `migrate-to-monthly.ts` ning
    // yakuniy `flipCoursesToMonthly` qadami qo'yadi.
    expect(tx.course.updateMany).not.toHaveBeenCalled();

    // Hisoblagichlar nolga.
    expect(tx.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { prepaidLessonsRemaining: 0, cycleLessonIndex: 0 },
    });
  });

  // ── Oylik bo'luvchi: ledger CEOga ko'rsatilgan hisobot bilan bir xil
  // raqamni yozishi shart ────────────────────────────────────────────────
  it("accrual oyning muzlatilgan dars soniga bo'linadi, kursdagi 12 ga emas", async () => {
    const tx = makeTx({
      transaction: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ded-1' }]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'ded-aug',
          createdAt: new Date('2026-08-04T09:00:00.000Z'),
        }),
      },
      attendance: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'att-1', date: new Date('2026-09-02'), groupId: 'grp-1' },
          ]),
      },
      groupTeacher: {
        findMany: jest.fn().mockResolvedValue([{ teacherId: 777 }]),
      },
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -120_000 })
          .mockResolvedValueOnce({ balance: -342_500 }),
      },
    });
    const deps = makeDeps();

    await applyMigrationForStudent({
      tx,
      deps,
      studentId: 10453,
      companyId: 1,
      performedById: 999,
      periodYear: 2026,
      periodMonth: 9,
      periodGte: PERIOD_GTE,
      periodLt: PERIOD_LT,
      enrollments: [makeEnrollment()],
    });

    // `FIXED_PER_STUDENT` stavkasi shu bo'luvchiga bo'linadi. Uzatilmasa
    // `createAccrual` kursning `lessonPaymentCount`iga (12) tushadi — o'shanda
    // 13 darslik oyda ustoz bir oylik stavkadan 8.3% ko'p olardi, migratsiya
    // hisoboti esa (`migrate-to-monthly.ts`: `perLessonAccrual(version,
    // newPerLesson, plannedLessons)`) CEOga BOSHQA summani ko'rsatardi.
    expect(deps.createAccrual).toHaveBeenCalledTimes(1);
    const accrualArgs = (deps.createAccrual as jest.Mock).mock.calls[0][0];
    expect(accrualArgs.lessonDivisor).toBe(13);
    expect(accrualArgs.perLessonCost).toBe(34_615);
    expect(accrualArgs.teacherId).toBe(777);
  });

  it("qayta ishga tushirish (resume): hammasi allaqachon bajarilgan bo'lsa, ikkinchi marta hisoblamaydi", async () => {
    const tx = makeTx({
      // reverseTransaction uchun qator topilmadi (allaqachon teskari).
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      // Hisob allaqachon mavjud.
      enrollmentMonthlyCharge: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing-charge' }),
      },
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -342_500 })
          .mockResolvedValueOnce({ balance: -342_500 }), // o'zgarmagan
      },
    });
    const deps = makeDeps({
      // prepaid allaqachon 0 -> no-op.
      refundPrepaidToBalance: jest.fn().mockResolvedValue(null),
      // createChargeForEnrollment servisning o'zi ham mavjud yozuvni qaytaradi.
      createChargeForEnrollment: jest.fn().mockResolvedValue({
        chargedAmount: 450_000,
        perLessonCost: 34_615,
        transactionId: 'tx-charge-1',
        plannedLessons: 13,
      }),
    });

    const result = await applyMigrationForStudent({
      tx,
      deps,
      studentId: 10453,
      companyId: 1,
      periodYear: 2026,
      periodMonth: 9,
      periodGte: PERIOD_GTE,
      periodLt: PERIOD_LT,
      enrollments: [makeEnrollment({ expectedPrepaidRefund: 0 })],
    });

    expect(result.reversedSeptember).toBe(0);
    expect(result.prepaidRefund).toBe(0);
    // Allaqachon mavjud hisob — bu ishga tushirishda YANGI pul harakatlanmadi.
    expect(result.monthlyCharge).toBe(0);
    expect(result.accrualsRecomputed).toBe(0);
    expect(result.newBalance).toBe(result.oldBalance);
    // Accrual qadami umuman ishga tushmagan (yangi hisob emas).
    expect(deps.reverseAccrualForAttendance).not.toHaveBeenCalled();
    expect(deps.createAccrual).not.toHaveBeenCalled();
  });

  it("chegirma to'g'ridan-to'g'ri uzatiladi, 0'ga defolt qilinmaydi", async () => {
    const tx = makeTx({
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -120_000 })
          // -120000 + 187500 (refund) + 0 (reversed) - 450000 (charge)
          .mockResolvedValueOnce({ balance: -382_500 }),
      },
    });
    const deps = makeDeps();

    await applyMigrationForStudent({
      tx,
      deps,
      studentId: 10698,
      companyId: 1,
      periodYear: 2026,
      periodMonth: 9,
      periodGte: PERIOD_GTE,
      periodLt: PERIOD_LT,
      enrollments: [makeEnrollment({ discountPercent: 50 })],
    });

    expect(deps.createChargeForEnrollment).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ discountPercent: 50 }),
    );
  });

  it("balans formulasi mos kelmasa — qattiq xato, tavsif ichida o'quvchi ID bor", async () => {
    const tx = makeTx({
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -120_000 })
          // Kutilganidan boshqa qiymat — biror joyda balansga chetdan tegilgan.
          .mockResolvedValueOnce({ balance: -999_999 }),
      },
    });
    const deps = makeDeps({
      refundPrepaidToBalance: jest.fn().mockResolvedValue(null),
    });

    await expect(
      applyMigrationForStudent({
        tx,
        deps,
        studentId: 10453,
        companyId: 1,
        periodYear: 2026,
        periodMonth: 9,
        periodGte: PERIOD_GTE,
        periodLt: PERIOD_LT,
        enrollments: [makeEnrollment({ expectedPrepaidRefund: 0 })],
      }),
    ).rejects.toThrow(/O'quvchi 10453/);
  });

  it("bir nechta yozilishni bitta o'quvchida yig'adi (ikki guruh, ikki kurs)", async () => {
    const tx = makeTx({
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: 0 })
          .mockResolvedValueOnce({ balance: -900_000 }), // 0 + 0 - (450k+450k)
      },
    });
    const deps = makeDeps({
      refundPrepaidToBalance: jest.fn().mockResolvedValue(null),
      createChargeForEnrollment: jest.fn().mockResolvedValue({
        chargedAmount: 450_000,
        perLessonCost: 34_615,
        transactionId: 'tx-x',
        plannedLessons: 13,
      }),
    });

    const result = await applyMigrationForStudent({
      tx,
      deps,
      studentId: 10453,
      companyId: 1,
      periodYear: 2026,
      periodMonth: 9,
      periodGte: PERIOD_GTE,
      periodLt: PERIOD_LT,
      enrollments: [
        makeEnrollment({
          enrollment: { id: 'enr-1', groupId: 'grp-1' },
          courseId: 'course-1',
          expectedPrepaidRefund: 0,
        }),
        makeEnrollment({
          enrollment: { id: 'enr-2', groupId: 'grp-2' },
          courseId: 'course-2',
          expectedPrepaidRefund: 0,
        }),
      ],
    });

    expect(result.monthlyCharge).toBe(900_000);
    // C1: ikkala kursning bayrog'i ham bu yerda emas, yakuniy qadamda.
    expect(tx.course.updateMany).not.toHaveBeenCalled();
  });
  // ── C2: prepaid qaytarish AVVAL, va davr ichidagi batch ikki marta
  // qaytarilmaydi ────────────────────────────────────────────────────────
  it("davr ICHIDAGI batch prepaid'ni qoplagan bo'lsa — prepaid alohida qaytarilmaydi (bekor qilish uni allaqachon qaytaradi)", async () => {
    const tx = makeTx({
      transaction: {
        // Sentabr yechimi bekor qilinadi: +450 000 balansga qaytadi.
        findMany: jest.fn().mockResolvedValue([{ id: 'ded-sep' }]),
        // ...va prepaid'ni qoplab turgan batch AYNAN o'sha davr ichidagi qator.
        findFirst: jest.fn().mockResolvedValue({
          id: 'ded-sep',
          createdAt: new Date('2026-09-02T09:00:00.000Z'),
        }),
      },
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: 0 })
          // 0 + 0 (prepaid YO'Q) + 450000 (bekor) - 450000 (hisob)
          .mockResolvedValueOnce({ balance: 0 }),
      },
    });
    const deps = makeDeps({
      reverseTransaction: jest.fn().mockResolvedValue({ amount: 450_000 }),
    });

    const result = await applyMigrationForStudent({
      tx,
      deps,
      studentId: 10453,
      companyId: 1,
      periodYear: 2026,
      periodMonth: 9,
      periodGte: PERIOD_GTE,
      periodLt: PERIOD_LT,
      enrollments: [
        makeEnrollment({
          expectedPrepaidRefund: 0,
          prepaidCoveredByReversal: 206_250,
        }),
      ],
    });

    expect(deps.refundPrepaidToBalance).not.toHaveBeenCalled();
    expect(result.prepaidRefund).toBe(0);
    expect(result.reversedSeptember).toBe(450_000);
    // Hisoblagich baribir nolga tushadi — pul bekor qilish orqali qaytdi.
    expect(tx.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { prepaidLessonsRemaining: 0, cycleLessonIndex: 0 },
    });
  });

  it('bashorat qilingan prepaid summasi bilan haqiqiy summa farq qilsa — qattiq xato', async () => {
    const tx = makeTx({
      student: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ balance: 0 }),
      },
    });
    const deps = makeDeps();

    await expect(
      applyMigrationForStudent({
        tx,
        deps,
        studentId: 10453,
        companyId: 1,
        periodYear: 2026,
        periodMonth: 9,
        periodGte: PERIOD_GTE,
        periodLt: PERIOD_LT,
        // Bashorat 206 250 dedi, servis 187 500 qaytardi.
        enrollments: [makeEnrollment({ expectedPrepaidRefund: 206_250 })],
      }),
    ).rejects.toThrow(/prepaid qaytarish bashorati 206250/);
  });

  // ── I2: PAUSED guruh ──────────────────────────────────────────────────
  it("PAUSED guruh (chargeable=false): bekor qilinmaydi, hisob yozilmaydi, lekin prepaid qaytariladi va kurs MONTHLY'ga o'tadi", async () => {
    const tx = makeTx({
      transaction: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ded-sep' }]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'ded-sep',
          createdAt: new Date('2026-09-02T09:00:00.000Z'),
        }),
      },
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -50_000 })
          // -50000 + 187500 (prepaid) + 0 (bekor yo'q) - 0 (hisob yo'q)
          .mockResolvedValueOnce({ balance: 137_500 }),
      },
    });
    const deps = makeDeps();

    const result = await applyMigrationForStudent({
      tx,
      deps,
      studentId: 10453,
      companyId: 1,
      periodYear: 2026,
      periodMonth: 9,
      periodGte: PERIOD_GTE,
      periodLt: PERIOD_LT,
      enrollments: [
        makeEnrollment({
          chargeable: false,
          enrollment: {
            group: {
              id: 'grp-1',
              branchId: 1,
              companyId: 1,
              statusEnum: GroupStatus.PAUSED,
              exactDays: ['MON', 'WED'],
              course: {
                price: 450_000,
                paymentModel: PaymentModel.LESSON_PACK,
              },
            },
          },
        }),
      ],
    });

    expect(deps.reverseTransaction).not.toHaveBeenCalled();
    expect(deps.createChargeForEnrollment).not.toHaveBeenCalled();
    expect(result.reversedSeptember).toBe(0);
    expect(result.monthlyCharge).toBe(0);
    expect(result.prepaidRefund).toBe(DEFAULT_REFUND);
    expect(result.chargesCreated).toBe(0);
    expect(result.chargesSkipped).toBe(1);
    // Hisobsiz qolgan yozilish NOMMA-NOM qaytariladi: yakuniy kurs bayrog'i
    // qadami "bu kursda hisobsiz yozilish bormi" degan savolni shu ro'yxat
    // bilan to'g'ri javoblaydi (aks holda PAUSED guruh bayroqni abadiy
    // bloklardi).
    expect(result.skippedEnrollmentIds).toEqual(['enr-1']);
    expect(tx.course.updateMany).not.toHaveBeenCalled();
  });

  // ── I4: `createAccrual` jim `null` qaytarmasligi kerak ────────────────
  it('createAccrual null qaytarsa — qattiq xato (aks holda eski accrual bekor qilinib, yangisi yozilmasdi)', async () => {
    const tx = makeTx({
      attendance: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'att-1', date: new Date('2026-09-02'), groupId: 'grp-1' },
          ]),
      },
      groupTeacher: {
        findMany: jest.fn().mockResolvedValue([{ teacherId: 777 }]),
      },
      student: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ balance: 0 }),
      },
    });
    const deps = makeDeps({
      // The old accrual WAS reversed — a null create now loses the pay.
      reverseAccrualForAttendance: jest
        .fn()
        .mockResolvedValue({ id: 'accrual-old' }),
      createAccrual: jest.fn().mockResolvedValue(null),
    });

    await expect(
      applyMigrationForStudent({
        tx,
        deps,
        studentId: 10453,
        companyId: 1,
        periodYear: 2026,
        periodMonth: 9,
        periodGte: PERIOD_GTE,
        periodLt: PERIOD_LT,
        enrollments: [makeEnrollment()],
      }),
    ).rejects.toThrow(/createAccrual null qaytardi/);
  });

  it('leaves a lesson unpaid, as before, when there was nothing to reverse and no rate', async () => {
    // A teacher whose rate starts after the lesson: the old model wrote no
    // accrual for it, and createAccrual still finds no rate. Nothing is lost,
    // so the student must not fail — a failed student also keeps the whole
    // course from switching to MONTHLY.
    const tx = makeTx({
      attendance: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'att-1', date: new Date('2026-09-02'), groupId: 'grp-1' },
          ]),
      },
      groupTeacher: {
        findMany: jest.fn().mockResolvedValue([{ teacherId: 777 }]),
      },
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: 0 })
          .mockResolvedValueOnce({ balance: -262_500 }), // 0 + 187 500 - 450 000
      },
    });
    const deps = makeDeps({
      reverseAccrualForAttendance: jest.fn().mockResolvedValue(null),
      createAccrual: jest.fn().mockResolvedValue(null),
    });

    const result = await applyMigrationForStudent({
      tx,
      deps,
      studentId: 10453,
      companyId: 1,
      periodYear: 2026,
      periodMonth: 9,
      periodGte: PERIOD_GTE,
      periodLt: PERIOD_LT,
      enrollments: [makeEnrollment()],
    });

    expect(result.accrualsRecomputed).toBe(0);
    expect(result.accrualsSkipped).toBe(1);
  });

  it("oylik hisobda ledger qatori (transactionId) bo'lmasa — accrual qadamiga umuman kirilmaydi", async () => {
    const tx = makeTx({
      attendance: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'att-1', date: new Date('2026-09-02'), groupId: 'grp-1' },
          ]),
      },
      groupTeacher: {
        findMany: jest.fn().mockResolvedValue([{ teacherId: 777 }]),
      },
      student: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ balance: 0 }),
      },
    });
    const deps = makeDeps({
      createChargeForEnrollment: jest.fn().mockResolvedValue({
        chargedAmount: 450_000,
        perLessonCost: 34_615,
        transactionId: null,
        plannedLessons: 13,
      }),
    });

    await expect(
      applyMigrationForStudent({
        tx,
        deps,
        studentId: 10453,
        companyId: 1,
        periodYear: 2026,
        periodMonth: 9,
        periodGte: PERIOD_GTE,
        periodLt: PERIOD_LT,
        enrollments: [makeEnrollment()],
      }),
    ).rejects.toThrow(/ledger qatori \(transactionId\) yo'q/);
    expect(deps.reverseAccrualForAttendance).not.toHaveBeenCalled();
  });
  it("prepaid o'tkazib yuborilgan, lekin qoplaydi deb hisoblangan batch bekor qilinganlar ichida YO'Q — qattiq xato", async () => {
    const tx = makeTx({
      transaction: {
        // Davr ichida BOSHQA qator bekor qilinadi...
        findMany: jest.fn().mockResolvedValue([{ id: 'ded-boshqa' }]),
        // ...prepaid'ni qoplaydi deb hisoblangani esa 'ded-sep'.
        findFirst: jest.fn().mockResolvedValue({
          id: 'ded-sep',
          createdAt: new Date('2026-09-02T09:00:00.000Z'),
        }),
      },
      student: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ balance: 0 }),
      },
    });
    const deps = makeDeps();

    await expect(
      applyMigrationForStudent({
        tx,
        deps,
        studentId: 10453,
        companyId: 1,
        periodYear: 2026,
        periodMonth: 9,
        periodGte: PERIOD_GTE,
        periodLt: PERIOD_LT,
        enrollments: [
          makeEnrollment({
            expectedPrepaidRefund: 0,
            prepaidCoveredByReversal: 206_250,
          }),
        ],
      }),
    ).rejects.toThrow(/bekor qilinganlar ichida YO'Q/);
  });

  it("bekor qilish qaytargan summa qaytarilmagan prepaid'dan kam — qattiq xato", async () => {
    const tx = makeTx({
      transaction: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ded-sep' }]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'ded-sep',
          createdAt: new Date('2026-09-02T09:00:00.000Z'),
        }),
      },
      student: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ balance: 0 }),
      },
    });
    const deps = makeDeps({
      // Batch bekor qilindi, lekin atigi 100 000 qaytdi.
      reverseTransaction: jest.fn().mockResolvedValue({ amount: 100_000 }),
    });

    await expect(
      applyMigrationForStudent({
        tx,
        deps,
        studentId: 10453,
        companyId: 1,
        periodYear: 2026,
        periodMonth: 9,
        periodGte: PERIOD_GTE,
        periodLt: PERIOD_LT,
        enrollments: [
          makeEnrollment({
            expectedPrepaidRefund: 0,
            prepaidCoveredByReversal: 206_250,
          }),
        ],
      }),
    ).rejects.toThrow(/farq o'quvchidan yo'qolardi/);
  });
});

/** The standard single-student call; tests override single fields on it. */
function studentParams(
  tx: ReturnType<typeof makeTx>,
  deps: ApplyMigrationDeps,
  enrollments: EnrollmentToMigrate[],
) {
  return {
    tx,
    deps,
    studentId: 10453,
    companyId: 1,
    performedById: 999,
    periodYear: 2026,
    periodMonth: 9,
    periodGte: PERIOD_GTE,
    periodLt: PERIOD_LT,
    enrollments,
  };
}

describe('carried-in lessons (paid by a pack bought before the month)', () => {
  const CARRIED = {
    lessons: 4,
    value: 150_000,
    batches: [{ deductionId: 'ded-aug', lessons: 4, value: 150_000 }],
  };

  it('credits them once, next to the fresh charge, and counts them in the balance check', async () => {
    const tx = makeTx({
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -120_000 })
          // -120 000 + 187 500 prepaid + 150 000 carried-in - 450 000 charge
          .mockResolvedValueOnce({ balance: -232_500 }),
      },
    });
    const deps = makeDeps({
      computeCarriedIn: jest.fn().mockResolvedValue(CARRIED),
    });

    const result = await applyMigrationForStudent(
      studentParams(tx, deps, [
        makeEnrollment({ expectedCarriedIn: { lessons: 4, value: 150_000 } }),
      ]),
    );

    expect(deps.createAdjustment).toHaveBeenCalledTimes(1);
    expect(deps.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 10453,
        amount: 150_000,
        branchId: 1,
        companyId: 1,
        performedById: 999,
        metadata: expect.objectContaining({
          marker: 'overcharge-monthly-carried-in',
          migration: 'monthly-carried-in',
          period: '2026-09',
          enrollmentId: 'enr-1',
          lessons: 4,
        }),
      }),
      tx,
    );
    expect(result.carriedInCredit).toBe(150_000);
    expect(result.newBalance).toBe(-232_500);
  });

  it('aborts before writing anything when the recount differs from the dry-run', async () => {
    const tx = makeTx();
    const deps = makeDeps({
      computeCarriedIn: jest.fn().mockResolvedValue(CARRIED),
    });

    await expect(
      applyMigrationForStudent(
        studentParams(tx, deps, [
          makeEnrollment({ expectedCarriedIn: { lessons: 4, value: 149_999 } }),
        ]),
      ),
    ).rejects.toThrow(/avgust darslari/);
    expect(deps.refundPrepaidToBalance).not.toHaveBeenCalled();
    expect(deps.reverseTransaction).not.toHaveBeenCalled();
    expect(deps.createChargeForEnrollment).not.toHaveBeenCalled();
    expect(deps.createAdjustment).not.toHaveBeenCalled();
  });

  it('does not credit a PAUSED enrollment (it keeps its pack billing)', async () => {
    const tx = makeTx({
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -120_000 })
          .mockResolvedValueOnce({ balance: 67_500 }), // -120 000 + 187 500
      },
    });
    const deps = makeDeps({
      computeCarriedIn: jest.fn().mockResolvedValue(CARRIED),
    });

    await applyMigrationForStudent(
      studentParams(tx, deps, [makeEnrollment({ chargeable: false })]),
    );

    expect(deps.computeCarriedIn).not.toHaveBeenCalled();
    expect(deps.createAdjustment).not.toHaveBeenCalled();
  });

  it('does not credit when the charge already existed', async () => {
    const tx = makeTx({
      enrollmentMonthlyCharge: {
        findUnique: jest.fn().mockResolvedValue({ id: 'chg-existing' }),
      },
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -120_000 })
          .mockResolvedValueOnce({ balance: 67_500 }), // -120 000 + 187 500
      },
    });
    const deps = makeDeps({
      computeCarriedIn: jest.fn().mockResolvedValue(CARRIED),
    });

    await applyMigrationForStudent(
      studentParams(tx, deps, [
        makeEnrollment({ expectedCarriedIn: { lessons: 4, value: 150_000 } }),
      ]),
    );

    expect(deps.createAdjustment).not.toHaveBeenCalled();
  });
});

describe('re-pricing reads lessons by Tashkent calendar days', () => {
  it('bounds Attendance.date by UTC-midnight dates, not the Tashkent-shifted instants', async () => {
    const tx = makeTx({
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -120_000 })
          .mockResolvedValueOnce({ balance: -382_500 }), // -120 000 + 187 500 - 450 000
      },
    });

    await applyMigrationForStudent({
      ...studentParams(tx, makeDeps(), [makeEnrollment()]),
      // What migrate-to-monthly.ts really passes: 00:00 Tashkent on 01.09
      // and on 01.10 — right for Transaction.createdAt, wrong for a date.
      periodGte: new Date('2026-08-31T19:00:00.000Z'),
      periodLt: new Date('2026-09-30T19:00:00.000Z'),
    });

    // Compared with a @db.Date column those instants mean ">= 31 August" and
    // "< 30 September" (server/CLAUDE.md, "Day boundaries").
    expect(tx.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lt: new Date('2026-10-01T00:00:00.000Z'),
          },
        }),
      }),
    );
  });
});

describe('reversal counter-rows are never packs', () => {
  it('neither funds the prepaid nor gets reversed by step 2', async () => {
    // reverseTransaction writes its counter-row with the original's type,
    // enrollment and reversedAt = null. Reversing it again throws ("already
    // reversed"), which failed the student and blocked the course flip.
    const tx = makeTx({
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -120_000 })
          .mockResolvedValueOnce({ balance: -382_500 }), // -120 000 + 187 500 - 450 000
      },
    });

    await applyMigrationForStudent(
      studentParams(tx, makeDeps(), [makeEnrollment()]),
    );

    const notACounterRow = expect.objectContaining({
      where: expect.objectContaining({
        reversedAt: null,
        reversedTransactionId: null,
      }),
    });
    expect(tx.transaction.findFirst).toHaveBeenCalledWith(notACounterRow);
    expect(tx.transaction.findMany).toHaveBeenCalledWith(notACounterRow);
  });
});

describe('a withheld carried-in credit', () => {
  it('is counted for the report and never written', async () => {
    // The ledger suggests 4 lessons / 150 000, but the room disagreed with
    // the counter (a freeze refund), so carried-in-lessons.ts withheld it.
    const tx = makeTx({
      student: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ balance: -120_000 })
          .mockResolvedValueOnce({ balance: -382_500 }), // -120 000 + 187 500 - 450 000
      },
    });
    const deps = makeDeps({
      computeCarriedIn: jest.fn().mockResolvedValue({
        lessons: 0,
        value: 0,
        batches: [],
        review: {
          lessons: 4,
          value: 150_000,
          room: 10,
          prepaidLessonsRemaining: 6,
        },
        earlyLessonsInMonthPacks: 0,
      }),
    });

    const result = await applyMigrationForStudent(
      studentParams(tx, deps, [makeEnrollment()]),
    );

    expect(deps.createAdjustment).not.toHaveBeenCalled();
    expect(result.carriedInCredit).toBe(0);
    expect(result.carriedInHeld).toBe(150_000);
  });
});
