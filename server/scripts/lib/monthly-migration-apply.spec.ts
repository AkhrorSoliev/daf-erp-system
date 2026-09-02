import { PaymentModel } from '@prisma/client';
import {
  applyMigrationForStudent,
  ApplyMigrationDeps,
  EnrollmentToMigrate,
} from './monthly-migration-apply';

const PERIOD_GTE = new Date('2026-09-01T00:00:00.000Z');
const PERIOD_LT = new Date('2026-10-01T00:00:00.000Z');

function makeEnrollment(over: Partial<EnrollmentToMigrate> = {}) {
  const enrollment = {
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
      exactDays: ['MON', 'WED'],
      course: { price: 450_000, paymentModel: PaymentModel.LESSON_PACK },
    },
    ...(over.enrollment as object),
  };
  return {
    courseId: 'course-1',
    discountPercent: 0,
    ...over,
    enrollment,
  } as EnrollmentToMigrate;
}

/** Minimal mock of the tx client — only the model methods this module calls. */
function makeTx(over: Record<string, unknown> = {}) {
  return {
    student: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ balance: -120_000 }),
    },
    transaction: {
      findMany: jest.fn().mockResolvedValue([]),
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
    }),
    reverseAccrualForAttendance: jest.fn().mockResolvedValue(null),
    createAccrual: jest.fn().mockResolvedValue({}),
    ...over,
  };
}

describe('applyMigrationForStudent', () => {
  it("baland yo'l: reverse -> refund -> nol -> MONTHLY -> hisob -> accrual, va balans formulasi tekshiriladi", async () => {
    const tx = makeTx({
      transaction: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ded-1' }]),
      },
      attendance: {
        findMany: jest.fn().mockResolvedValue([
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
      reversedSeptember: 40_000,
      monthlyCharge: 450_000,
      newBalance: -342_500,
      reversedDeductionCount: 1,
      accrualsRecomputed: 1,
    });

    // Tartib: teskari qilish MUSTAQIL, prepaid qaytarish undan keyin.
    const reverseCall = (deps.reverseTransaction as jest.Mock).mock
      .invocationCallOrder[0];
    const refundCall = (deps.refundPrepaidToBalance as jest.Mock).mock
      .invocationCallOrder[0];
    expect(reverseCall).toBeLessThan(refundCall);

    // Accrual: AVVAL reverse, KEYIN create — shart (accrueMonthlySalary sharhi).
    const accrualReverseCall = (
      deps.reverseAccrualForAttendance as jest.Mock
    ).mock.invocationCallOrder[0];
    const accrualCreateCall = (deps.createAccrual as jest.Mock).mock
      .invocationCallOrder[0];
    expect(accrualReverseCall).toBeLessThan(accrualCreateCall);

    // Kurs MONTHLY'ga o'tkazildi.
    expect(tx.course.updateMany).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: { paymentModel: PaymentModel.MONTHLY },
    });

    // Hisoblagichlar nolga.
    expect(tx.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { prepaidLessonsRemaining: 0, cycleLessonIndex: 0 },
    });
  });

  it("qayta ishga tushirish (resume): hammasi allaqachon bajarilgan bo'lsa, ikkinchi marta hisoblamaydi", async () => {
    const tx = makeTx({
      // reverseTransaction uchun qator topilmadi (allaqachon teskari).
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
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
      enrollments: [makeEnrollment()],
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
        enrollments: [makeEnrollment()],
      }),
    ).rejects.toThrow(/O'quvchi 10453/);
  });

  it("bir nechta yozilishni bitta o'quvchida yig'adi (ikki guruh, ikki kurs)", async () => {
    const tx = makeTx({
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
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
        }),
        makeEnrollment({
          enrollment: { id: 'enr-2', groupId: 'grp-2' },
          courseId: 'course-2',
        }),
      ],
    });

    expect(result.monthlyCharge).toBe(900_000);
    expect(tx.course.updateMany).toHaveBeenCalledTimes(2);
  });
});
