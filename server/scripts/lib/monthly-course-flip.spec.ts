import { PaymentModel, PrismaClient } from '@prisma/client';
import { flipCoursesToMonthly } from './monthly-course-flip';

/**
 * C1 — `Course.paymentModel` migratsiyaning ENG XAVFLI bitta qatori.
 *
 * Avval u har bir o'quvchining tranzaksiyasi ichida turardi: birinchi
 * o'quvchi commit bo'lgan lahzada ishlab turgan backend o'sha kursdagi hali
 * ko'chmagan ~300 yozilishni MONTHLY deb ko'ra boshlardi, kunlik qorovul
 * esa har biriga to'liq oylik hisob yozardi. Bu testlar bayroqni
 * bloklaydigan shartni qotirib qo'yadi.
 */
describe('flipCoursesToMonthly', () => {
  const makePrisma = (over: {
    course?: { id: string; name: string; paymentModel: PaymentModel } | null;
    remaining?: number;
  }) => {
    const course =
      over.course === undefined
        ? {
            id: 'course-1',
            name: 'Standart',
            paymentModel: PaymentModel.LESSON_PACK,
          }
        : over.course;
    return {
      course: {
        findUnique: jest.fn().mockResolvedValue(course),
        update: jest.fn().mockResolvedValue({}),
      },
      enrollment: {
        count: jest.fn().mockResolvedValue(over.remaining ?? 0),
      },
    } as unknown as PrismaClient;
  };

  it('hisobsiz yozilish qolmagan kursni MONTHLY qiladi', async () => {
    const prisma = makePrisma({ remaining: 0 });

    const res = await flipCoursesToMonthly({
      prisma,
      courseIds: ['course-1'],
      skippedEnrollmentIds: [],
      year: 2026,
      month: 9,
    });

    expect(res.flipped).toEqual(['Standart']);
    expect(res.blocked).toEqual([]);
    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: { paymentModel: PaymentModel.MONTHLY },
    });
  });

  it('bitta hisobsiz yozilish qolsa ham bayroqni ALMASHTIRMAYDI', async () => {
    // Aynan shu holat 135 mln so'mlik xatoni yasardi.
    const prisma = makePrisma({ remaining: 297 });

    const res = await flipCoursesToMonthly({
      prisma,
      courseIds: ['course-1'],
      skippedEnrollmentIds: [],
      year: 2026,
      month: 9,
    });

    expect(res.flipped).toEqual([]);
    expect(res.blocked).toEqual([
      { courseId: 'course-1', courseName: 'Standart', remaining: 297 },
    ]);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it('so`rov aynan qorovulning qamrovi — bilib o`tkazib yuborilganlar chiqariladi', async () => {
    const prisma = makePrisma({ remaining: 0 });

    await flipCoursesToMonthly({
      prisma,
      courseIds: ['course-1'],
      skippedEnrollmentIds: ['enr-paused-1', 'enr-nodays-2'],
      year: 2026,
      month: 9,
    });

    const where = (prisma.enrollment.count as jest.Mock).mock.calls[0][0].where;
    // PAUSED guruh va "oyda dars kuni yo'q" yozilishlar hech qachon hisob
    // olmaydi — ular ro'yxatda qolsa bayroq ABADIY bloklanardi.
    expect(where.id).toEqual({
      notIn: ['enr-paused-1', 'enr-nodays-2'],
    });
    // Qorovulning so'rovi bilan bir xil filtrlar (faqat `paymentModel` yo'q).
    expect(where.status).toBe('ACTIVE');
    expect(where.group).toEqual({
      deletedAt: null,
      statusEnum: 'ACTIVE',
      courseId: 'course-1',
      course: { deletedAt: null },
    });
    expect(where.student).toEqual({ deletedAt: null, status: 'ACTIVE' });
    expect(where.monthlyCharges).toEqual({
      none: { periodYear: 2026, periodMonth: 9, status: 'CHARGED' },
    });
  });

  it('allaqachon MONTHLY bo`lgan kursga qayta yozmaydi', async () => {
    const prisma = makePrisma({
      course: {
        id: 'course-1',
        name: 'Standart',
        paymentModel: PaymentModel.MONTHLY,
      },
      remaining: 0,
    });

    const res = await flipCoursesToMonthly({
      prisma,
      courseIds: ['course-1'],
      skippedEnrollmentIds: [],
      year: 2026,
      month: 9,
    });

    expect(res.flipped).toEqual(['Standart']);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it('kurs topilmasa bloklaydi (jim o`tkazib yubormaydi)', async () => {
    const prisma = makePrisma({ course: null });

    const res = await flipCoursesToMonthly({
      prisma,
      courseIds: ['course-yo`q'],
      skippedEnrollmentIds: [],
      year: 2026,
      month: 9,
    });

    expect(res.flipped).toEqual([]);
    expect(res.blocked).toHaveLength(1);
    expect(prisma.enrollment.count).not.toHaveBeenCalled();
  });
});
