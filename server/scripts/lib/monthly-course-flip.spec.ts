import { PaymentModel, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  flipCoursesToMonthly,
  flipDefaultModelSettingToMonthly,
} from './monthly-course-flip';

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

/**
 * Kurs bayrog'i migratsiyaning yarmi — ikkinchi yarmi `payment.defaultModel`.
 *
 * `flipCoursesToMonthly` faqat MAVJUD kurslarni ko'chiradi. Cutover'dan
 * keyin ochilgan YANGI kurs modelni sozlamadan oladi
 * (`CoursesService.create`), uning kodlangan boshlang'ichi esa ataylab
 * `LESSON_PACK`. Sozlama qo'lda qolsa, `--apply` toza tugagandan keyin
 * ochilgan birinchi kurs 12 talik paketda qolardi: kunlik cron unga oylik
 * hisob yozmaydi va o'sha guruh oylik hisob/qarz hisobotlarida umuman
 * ko'rinmaydi — jim, uzoq yashaydigan xato. Shuning uchun bayroq va
 * sozlama BITTA qadamda almashadi.
 */
describe('flipDefaultModelSettingToMonthly', () => {
  type Row = { id: number; branchId: number | null; value: unknown };

  const makePrisma = (rowsPerCall: Row[][]) => {
    const findMany = jest.fn();
    for (const rows of rowsPerCall) findMany.mockResolvedValueOnce(rows);
    return {
      setting: {
        findMany,
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaClient;
  };

  it("qator yo'q bo'lsa kompaniya darajasida MONTHLY yozadi", async () => {
    const prisma = makePrisma([[]]);

    const res = await flipDefaultModelSettingToMonthly({
      prisma,
      companyIds: [1001],
    });

    expect(res.written).toEqual([1001]);
    expect(res.alreadyMonthly).toEqual([]);
    expect(prisma.setting.create).toHaveBeenCalledWith({
      data: {
        companyId: 1001,
        branchId: null,
        key: 'payment.defaultModel',
        value: PaymentModel.MONTHLY,
      },
    });
    expect(prisma.setting.update).not.toHaveBeenCalled();
  });

  it('mavjud LESSON_PACK qatorini id bo`yicha yangilaydi (upsert emas)', async () => {
    // `@@unique([companyId, branchId, key])` da `branchId = null` Postgres
    // uchun har doim "boshqa" qiymat — `upsert` har ishga tushishda YANGI
    // qator yasab, kompaniya qiymatini ikkilantirib yuborardi.
    const prisma = makePrisma([
      [{ id: 7, branchId: null, value: PaymentModel.LESSON_PACK }],
    ]);

    const res = await flipDefaultModelSettingToMonthly({
      prisma,
      companyIds: [1001],
    });

    expect(res.written).toEqual([1001]);
    expect(prisma.setting.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { value: PaymentModel.MONTHLY },
    });
    expect(prisma.setting.create).not.toHaveBeenCalled();
  });

  it('allaqachon MONTHLY bo`lsa qayta yozmaydi', async () => {
    const prisma = makePrisma([
      [{ id: 7, branchId: null, value: PaymentModel.MONTHLY }],
    ]);

    const res = await flipDefaultModelSettingToMonthly({
      prisma,
      companyIds: [1001],
    });

    expect(res.written).toEqual([]);
    expect(res.alreadyMonthly).toEqual([1001]);
    expect(prisma.setting.update).not.toHaveBeenCalled();
    expect(prisma.setting.create).not.toHaveBeenCalled();
  });

  it('filialning MONTHLY bo`lmagan qiymatini BALAND aytadi va tegmaydi', async () => {
    // Filial qiymati kompaniya qiymatidan USTUN — jim qoldirilsa o'sha
    // filialda ochilgan yangi kurs paketda qolaverardi. Skript uni o'zi
    // o'chirmaydi (CEO qarori), lekin ekranda ko'rsatadi.
    const prisma = makePrisma([
      [
        { id: 7, branchId: null, value: PaymentModel.LESSON_PACK },
        { id: 8, branchId: 5, value: PaymentModel.LESSON_PACK },
      ],
    ]);

    const res = await flipDefaultModelSettingToMonthly({
      prisma,
      companyIds: [1001],
    });

    expect(res.branchOverrides).toEqual([
      { companyId: 1001, branchId: 5, value: PaymentModel.LESSON_PACK },
    ]);
    expect(res.written).toEqual([1001]);
    // Faqat kompaniya qatori yangilandi, filial qatori o'z holicha qoldi.
    expect(prisma.setting.update).toHaveBeenCalledTimes(1);
    expect(prisma.setting.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { value: PaymentModel.MONTHLY },
    });
  });

  it('allaqachon MONTHLY bo`lgan filial qatori ogohlantirish bermaydi', async () => {
    const prisma = makePrisma([
      [
        { id: 7, branchId: null, value: PaymentModel.LESSON_PACK },
        { id: 8, branchId: 5, value: PaymentModel.MONTHLY },
      ],
    ]);

    const res = await flipDefaultModelSettingToMonthly({
      prisma,
      companyIds: [1001],
    });

    expect(res.branchOverrides).toEqual([]);
  });

  it('har bir kompaniyaga alohida yozadi', async () => {
    const prisma = makePrisma([
      [],
      [{ id: 9, branchId: null, value: PaymentModel.MONTHLY }],
    ]);

    const res = await flipDefaultModelSettingToMonthly({
      prisma,
      companyIds: [1001, 1002],
    });

    expect(res.written).toEqual([1001]);
    expect(res.alreadyMonthly).toEqual([1002]);
    expect(prisma.setting.findMany).toHaveBeenCalledTimes(2);
    expect(
      (prisma.setting.findMany as jest.Mock).mock.calls.map(
        (c) => c[0].where.companyId,
      ),
    ).toEqual([1001, 1002]);
  });
});

/**
 * Yuqoridagi funksiya yozilgani yetmaydi — u `migrate-to-monthly.ts` ning
 * TOZA yakun shoxida chaqirilishi kerak. Skriptni testga import qilib
 * bo'lmaydi (fayl oxirida `run(main)` bor — import qilish uni ISHGA
 * TUSHIRARDI), shuning uchun manba matni o'qiladi; naqsh repo'da bor
 * (`src/common/finance/per-lesson-price.single-source.spec.ts`).
 */
describe('migrate-to-monthly — yakuniy qadam IKKALA bayroqni ham almashtiradi', () => {
  const src = readFileSync(
    join(__dirname, '..', 'migrate-to-monthly.ts'),
    'utf8',
  );

  const courseFlipAt = src.indexOf('const flip = await flipCoursesToMonthly(');
  const blockedCheckAt = src.indexOf('if (flip.blocked.length > 0) {');
  const settingFlipAt = src.indexOf('await flipDefaultModelSettingToMonthly({');
  const failGateAt = src.indexOf("section('TEKSHIRUV YIQILDI')");

  it('sozlamani ham almashtiradi — aks holda kafolat qo`lda bosiladigan tugmaga qolardi', () => {
    expect(settingFlipAt).toBeGreaterThan(-1);
  });

  it('chaqiruv kurs bayrog`i BLOKLANMAGAN shoxida turadi', () => {
    // `--limit` bilan ham, tekshiruvlar yiqilganda ham, bloklangan kurs
    // qolganda ham sozlama almashmasligi kerak: yarim ko'chgan bazada
    // yangi kurs oylik bo'lib tug'ilsa, hali paketda turgan kursdoshlari
    // bilan bir guruhda ikki xil hisob-kitob paydo bo'lardi.
    expect(courseFlipAt).toBeGreaterThan(-1);
    expect(blockedCheckAt).toBeGreaterThan(courseFlipAt);
    expect(settingFlipAt).toBeGreaterThan(blockedCheckAt);
    expect(settingFlipAt).toBeLessThan(failGateAt);
  });

  it('muvaffaqiyat xabari sozlamani ham nomlab aytadi', () => {
    const epilogue = src.slice(src.indexOf('Migratsiya tugadi.'));
    expect(epilogue).toContain('payment.defaultModel');
  });
});
