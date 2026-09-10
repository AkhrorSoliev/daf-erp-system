import { Test } from '@nestjs/testing';
import { Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DafPortalReadService } from './daf-portal-read.service';

describe('DafPortalReadService', () => {
  let service: DafPortalReadService;
  let prisma: {
    dafUnit: { findMany: jest.Mock; findUnique: jest.Mock };
    dafLesson: { findMany: jest.Mock; findUnique: jest.Mock };
    dafLexeme: { findMany: jest.Mock };
    dafGrammar: { findMany: jest.Mock };
    dafExercise: { findMany: jest.Mock };
    dafSection: { findMany: jest.Mock };
    dafLessonProgress: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      dafUnit: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            level: 'A1',
            order: 1,
            titleUz: 'Tanishuv',
            titleDe: 'Kennenlernen',
            _count: { lessons: 14 },
          },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          level: 'A1',
          order: 1,
          titleUz: 'Tanishuv',
          titleDe: 'Kennenlernen',
          retiredAt: null,
        }),
      },
      dafLesson: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 3,
            order: 1,
            tier: 1,
            titleDe: 'Begrüßungen',
            titleUz: 'Salomlashish',
            _count: { lexemes: 16, exercises: 0 },
          },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          order: 1,
          tier: 1,
          titleDe: 'Begrüßungen',
          titleUz: 'Salomlashish',
          unit: { id: 1, titleUz: 'Tanishuv', level: 'A1' },
          grammar: null,
        }),
      },
      dafLexeme: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 5,
            de: 'Hallo!',
            uz: 'Salom!',
            sectionTitleDe: 'Begrüßungen',
            audioKey: 'dib/audio/a.mp3',
            imageKey: null,
          },
        ]),
      },
      dafGrammar: { findMany: jest.fn().mockResolvedValue([]) },
      dafSection: { findMany: jest.fn().mockResolvedValue([]) },
      dafLessonProgress: { findMany: jest.fn().mockResolvedValue([]) },
      dafExercise: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            kind: 'MC',
            prompt: 'Wir haben ___',
            options: ['a', 'b'],
            answerStatus: 'FROM_SOURCE',
            grammarId: 2,
          },
        ]),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        DafPortalReadService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://pub-x.r2.dev' },
        },
      ],
    }).compile();

    service = module.get(DafPortalReadService);
  });

  // Bo'limi yo'q daraja ham qaytariladi: o'quvchi butun yo'lni ko'rishi
  // kerak. Bo'sh darajani yashirish «B1 umuman yo'q» degan taassurot
  // qoldirardi.
  //
  // Daraja uchta: `A1.1`/`A1.2` bo'linishi manbaning yorlig'i edi, yo'lda
  // esa o'quvchining bosqichi turadi.
  it("bo'sh darajani ham yo'lda qoldiradi", async () => {
    const path = await service.getLevels(55);

    expect(path.map((p) => p.label)).toEqual(['A1', 'A2', 'B1']);
    expect(path[0].units).toHaveLength(1);
    expect(path[2].units).toEqual([]);
  });

  // Nafaqaga chiqarilgan eski DiB unitlari (A1 migratsiyasi) yo'lga
  // chiqmasligi kerak: ular `order = -id`ga o'tkazilgan, o'sish
  // tartibida saralanganda birinchi bo'lib chiqib, o'quvchining A1
  // yo'lini teskari aylantirardi.
  it("nafaqaga chiqarilgan unitni so'ramaydi", async () => {
    await service.getLevels(55);

    const where = prisma.dafUnit.findMany.mock.calls[0][0].where as {
      retiredAt: null;
    };
    expect(where.retiredAt).toBeNull();
  });

  // ENG MUHIM TEKSHIRUV: to'g'ri javob mijozga yuborilmaydi. Yuborilsa,
  // uni brauzerning tarmoq oynasida ko'rish mumkin bo'lardi va mashqning
  // ham, keyingi reytingning ham ma'nosi qolmasdi.
  it("mashq ro'yxatida javob yuborilmaydi", async () => {
    const lesson = await service.getLesson(3);

    for (const ex of lesson.exercises) {
      expect(ex).not.toHaveProperty('answers');
      expect(ex).not.toHaveProperty('slots');
    }
    const select = prisma.dafExercise.findMany.mock.calls[0][0]
      .select as Record<string, boolean>;
    expect(select.answers).toBeUndefined();
  });

  // Nafaqadagi mashq ro'yxatda ko'rinmaydi, lekin bazada qoladi: unga
  // ishora qiluvchi urinish tarixi saqlanadi.
  it("nafaqaga chiqarilgan mashqni so'ramaydi", async () => {
    await service.getLesson(3);

    const where = prisma.dafExercise.findMany.mock.calls[0][0].where as {
      retiredAt: null;
    };
    expect(where.retiredAt).toBeNull();
  });

  // Media baytlari bazada emas — jadvalda faqat R2 kaliti turadi, manzil
  // o'qishda quriladi.
  it('R2 kalitini ommaviy manzilga aylantiradi', async () => {
    const lesson = await service.getLesson(3);
    expect(lesson.lexemes[0].audioUrl).toBe(
      'https://pub-x.r2.dev/dib/audio/a.mp3',
    );
    expect(lesson.lexemes[0].imageUrl).toBeNull();
  });

  // Bo'lim ekrani lug'at ham, mashq ham qaytarmaydi — bo'limda 30–50 so'z
  // va o'nlab mashq bor, ya'ni bitta ekranga sig'maydi. Kontent
  // bosqichning ichida.
  it("bo'lim faqat bosqichlar ro'yxatini beradi", async () => {
    const unit = await service.getUnit(1, 55);

    expect(unit).not.toHaveProperty('lexemes');
    expect(unit).not.toHaveProperty('exercises');
    expect(unit.lessons[0]).toMatchObject({
      tier: 1,
      titleUz: 'Salomlashish',
      wordCount: 16,
    });
  });

  it("mavjud bo'lmagan bo'limda 404 beradi", async () => {
    prisma.dafUnit.findUnique.mockResolvedValue(null);
    await expect(service.getUnit(99, 55)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // Nafaqaga chiqarilgan unit `getLevels`da ko'rinmaydi — uning ID'siga
  // to'g'ridan-to'g'ri kirish ham xuddi shu "topilmadi"ni berishi kerak,
  // aks holda havola orqali eski DiB bo'limi hali ham ochilaverardi.
  it("nafaqaga chiqarilgan bo'limda ham 404 beradi", async () => {
    prisma.dafUnit.findUnique.mockResolvedValue({
      id: 1,
      level: 'A1',
      order: -1,
      titleUz: 'Eski',
      titleDe: 'Alt',
      retiredAt: new Date('2026-08-01'),
    });
    await expect(service.getUnit(1, 55)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // Seans tartibi `order`dan olinadi, `tier`dan emas: yangi A1
  // xaritasining darslarida `tier` null, faqat `order` to'ldirilgan.
  // `tier` bo'yicha saralash 15–18 seansni tasodifiy tartibda qaytarardi.
  it("bosqichlarni `order` bo'yicha so'raydi, `tier` bo'yicha emas", async () => {
    await service.getUnit(1, 55);

    const orderBy = prisma.dafLesson.findMany.mock.calls[0][0].orderBy as {
      order?: string;
      tier?: string;
    };
    expect(orderBy).toEqual({ order: 'asc' });
  });
});

/**
 * Soxta prisma — faqat kerakli metod ustidan yoziladi, qolgani xavfsiz
 * standart qiymat qaytaradi. `getUnit` uchun `dafUnit.findUnique` doim
 * haqiqiy (nafaqaga chiqmagan) unit qaytaradi, aks holda har bir test
 * uni ham qayta yozishga majbur bo'lardi.
 */
function fakePrisma() {
  return {
    dafUnit: {
      findMany: jest.fn<Promise<any[]>, any[]>(async () => []),
      findUnique: jest.fn<Promise<any>, any[]>(async () => ({
        id: 1,
        level: 'A1',
        order: 1,
        titleUz: 'Test',
        titleDe: 'Test',
        retiredAt: null,
      })),
    },
    dafLesson: { findMany: jest.fn<Promise<any[]>, any[]>(async () => []) },
    dafSection: { findMany: jest.fn<Promise<any[]>, any[]>(async () => []) },
    dafLessonProgress: {
      findMany: jest.fn<Promise<any[]>, any[]>(async () => []),
    },
  };
}

const svc = (prisma: any) =>
  new DafPortalReadService(prisma, { get: () => null } as any);

describe('getLevels — ilgarilash', () => {
  it('har unitga tugallangan seans sonini qo`shadi', async () => {
    const prisma = fakePrisma();
    prisma.dafUnit.findMany = jest.fn(async () => [
      {
        id: 1,
        level: 'A1',
        order: 1,
        titleUz: 'Salom',
        titleDe: 'Hallo',
        _count: { lessons: 18 },
      },
      {
        id: 2,
        level: 'A1',
        order: 2,
        titleUz: 'Oila',
        titleDe: 'Familie',
        _count: { lessons: 0 },
      },
    ]);
    // Ilgarilash endi BITTA so'rovdan olinadi (`lessonId` orqali), doneCount
    // shuning uchun `lessons` ro'yxati bilan bog'langan holda hisoblanadi —
    // shuning uchun unit 1ning darslari ham shu yerda beriladi.
    prisma.dafLesson.findMany = jest.fn(async () => [
      {
        id: 101,
        unitId: 1,
        order: 1,
        tier: null,
        kind: 'SECTION_A',
        sectionId: null,
        titleDe: 'a',
        titleUz: 'a',
        _count: { lexemes: 0, exercises: 0 },
      },
      {
        id: 102,
        unitId: 1,
        order: 2,
        tier: null,
        kind: 'SECTION_A',
        sectionId: null,
        titleDe: 'b',
        titleUz: 'b',
        _count: { lexemes: 0, exercises: 0 },
      },
      {
        id: 103,
        unitId: 1,
        order: 3,
        tier: null,
        kind: 'SECTION_A',
        sectionId: null,
        titleDe: 'c',
        titleUz: 'c',
        _count: { lexemes: 0, exercises: 0 },
      },
    ]);
    prisma.dafLessonProgress.findMany = jest.fn(async () => [
      {
        lessonId: 101,
        completedAt: new Date('2026-09-01'),
        bestScore: 12,
        runs: 1,
      },
      {
        lessonId: 102,
        completedAt: new Date('2026-09-01'),
        bestScore: 12,
        runs: 1,
      },
      {
        lessonId: 103,
        completedAt: new Date('2026-09-01'),
        bestScore: 12,
        runs: 1,
      },
    ]);
    const levels = await svc(prisma).getLevels(55);
    const a1 = levels.find((l) => l.level === 'A1')!;
    expect(a1.units[0].doneCount).toBe(3);
    expect(a1.units[0].lessonCount).toBe(18);
    expect(a1.units[1].doneCount).toBe(0);
  });

  it('tugallanmagan urinish doneCount`ga qo`shilmaydi', async () => {
    // Bu aynan brief ogohlantirgan xavf: agar TUGALLANMAGAN seans ham
    // "bajarilgan" deb sanalsa, yo'l sahifasi o'quvchi hali tugatmagan
    // unitni ochiq deb ko'rsatardi. `completedAt: null` qatori
    // xotiradagi guruhlashda (`if (!f.completedAt) continue;`)
    // chetlab o'tilishi kerak.
    const prisma = fakePrisma();
    prisma.dafUnit.findMany = jest.fn(async () => [
      {
        id: 1,
        level: 'A1',
        order: 1,
        titleUz: 'Salom',
        titleDe: 'Hallo',
        _count: { lessons: 2 },
      },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      {
        id: 201,
        unitId: 1,
        order: 1,
        tier: null,
        kind: 'SECTION_A',
        sectionId: null,
        titleDe: 'a',
        titleUz: 'a',
        _count: { lexemes: 0, exercises: 0 },
      },
      {
        id: 202,
        unitId: 1,
        order: 2,
        tier: null,
        kind: 'SECTION_A',
        sectionId: null,
        titleDe: 'b',
        titleUz: 'b',
        _count: { lexemes: 0, exercises: 0 },
      },
    ]);
    prisma.dafLessonProgress.findMany = jest.fn(async () => [
      {
        lessonId: 201,
        completedAt: new Date('2026-09-01'),
        bestScore: 12,
        runs: 1,
      },
      // Boshlangan, lekin tugallanmagan urinish — `completedAt: null`.
      { lessonId: 202, completedAt: null, bestScore: 4, runs: 1 },
    ]);
    const levels = await svc(prisma).getLevels(55);
    const a1 = levels.find((l) => l.level === 'A1')!;
    expect(a1.units[0].doneCount).toBe(1);
  });

  it('faqat SHU o`quvchining ilgarilashini so`raydi', async () => {
    const prisma = fakePrisma();
    await svc(prisma).getLevels(55);
    const where = prisma.dafLessonProgress.findMany.mock.calls[0][0].where;
    expect(where.studentId).toBe(55);
  });
});

describe('getLevels — yo`l uchun bo`limlar', () => {
  it('har unitga bo`limlarni va ularning seanslarini qo`shadi', async () => {
    const prisma = fakePrisma();
    prisma.dafUnit.findMany = jest.fn(async () => [
      {
        id: 1,
        level: 'A1',
        order: 1,
        titleUz: 'Salom',
        titleDe: 'Hallo',
        _count: { lessons: 2 },
      },
    ]);
    prisma.dafSection.findMany = jest.fn(async () => [
      {
        id: 10,
        unitId: 1,
        order: 1,
        code: 'u01-s1',
        titleUz: 'Bir',
        titleDe: 'Eins',
      },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      {
        id: 100,
        unitId: 1,
        order: 1,
        tier: null,
        kind: 'SECTION_A',
        sectionId: 10,
        titleDe: 'A',
        titleUz: 'A',
        _count: { lexemes: 0, exercises: 0 },
      },
      {
        id: 109,
        unitId: 1,
        order: 9,
        tier: null,
        kind: 'UNIT_TEST',
        sectionId: null,
        titleDe: 'T',
        titleUz: 'Sinov',
        _count: { lexemes: 0, exercises: 0 },
      },
    ]);
    const levels = await svc(prisma).getLevels(55);
    const unit = levels.find((l) => l.level === 'A1')!.units[0] as any;
    expect(unit.sections[0].lessons.map((l: any) => l.id)).toEqual([100]);
    expect(unit.finalTest.id).toBe(109);
  });

  it('ilgarilash har seansga yopishtiriladi', async () => {
    const prisma = fakePrisma();
    prisma.dafUnit.findMany = jest.fn(async () => [
      {
        id: 1,
        level: 'A1',
        order: 1,
        titleUz: 'Salom',
        titleDe: 'Hallo',
        _count: { lessons: 1 },
      },
    ]);
    prisma.dafSection.findMany = jest.fn(async () => [
      {
        id: 10,
        unitId: 1,
        order: 1,
        code: 'u01-s1',
        titleUz: 'Bir',
        titleDe: 'Eins',
      },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      {
        id: 100,
        unitId: 1,
        order: 1,
        tier: null,
        kind: 'SECTION_A',
        sectionId: 10,
        titleDe: 'A',
        titleUz: 'A',
        _count: { lexemes: 0, exercises: 0 },
      },
    ]);
    prisma.dafLessonProgress.findMany = jest.fn(async () => [
      {
        lessonId: 100,
        completedAt: new Date('2026-09-01'),
        bestScore: 11,
        runs: 2,
      },
    ]);
    const levels = await svc(prisma).getLevels(55);
    const s = (levels.find((l) => l.level === 'A1')!.units[0] as any)
      .sections[0].lessons[0];
    expect(s.bestScore).toBe(11);
    expect(s.completedAt).not.toBeNull();
  });

  it('kontenti yo`q daraja bo`sh units bilan qaytadi', async () => {
    const levels = await svc(fakePrisma()).getLevels(55);
    expect(levels.map((l) => l.level)).toEqual(['A1', 'A2', 'B1']);
    expect(levels.every((l) => Array.isArray(l.units))).toBe(true);
  });

  it('so`rovlar unit soniga qarab KO`PAYMAYDI', async () => {
    // N+1 bo'lsa 12 unitda 24 ta so'rov ketardi.
    const prisma = fakePrisma();
    prisma.dafUnit.findMany = jest.fn(async () => [
      {
        id: 1,
        level: 'A1',
        order: 1,
        titleUz: 'a',
        titleDe: 'a',
        _count: { lessons: 1 },
      },
      {
        id: 2,
        level: 'A1',
        order: 2,
        titleUz: 'b',
        titleDe: 'b',
        _count: { lessons: 1 },
      },
      {
        id: 3,
        level: 'A1',
        order: 3,
        titleUz: 'c',
        titleDe: 'c',
        _count: { lessons: 1 },
      },
    ]);
    await svc(prisma).getLevels(55);
    expect(prisma.dafSection.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dafLesson.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('getUnit — bo`limlar va ilgarilash', () => {
  it('darslarni bo`lim bo`yicha guruhlaydi, tartibda', async () => {
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => [
      { id: 20, order: 2, code: 'u01-s2', titleUz: 'Ikki', titleDe: 'Zwei' },
      { id: 10, order: 1, code: 'u01-s1', titleUz: 'Bir', titleDe: 'Eins' },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      {
        id: 1,
        order: 1,
        tier: null,
        kind: 'SECTION_A',
        sectionId: 10,
        titleDe: 'A',
        titleUz: 'A',
        _count: { lexemes: 5, exercises: 0 },
      },
      {
        id: 2,
        order: 2,
        kind: 'SECTION_B',
        sectionId: 10,
        tier: null,
        titleDe: 'B',
        titleUz: 'B',
        _count: { lexemes: 0, exercises: 0 },
      },
      {
        id: 3,
        order: 3,
        kind: 'BRIDGE',
        sectionId: 20,
        tier: null,
        titleDe: 'C',
        titleUz: 'C',
        _count: { lexemes: 0, exercises: 0 },
      },
    ]);
    const unit = await svc(prisma).getUnit(1, 55);
    expect(unit.sections.map((s: any) => s.order)).toEqual([1, 2]);
    expect(unit.sections[0].lessons.map((l: any) => l.id)).toEqual([1, 2]);
    expect(unit.sections[1].lessons.map((l: any) => l.id)).toEqual([3]);
  });

  it('yakuniy sinovni alohida chiqaradi, bo`limlar ichida emas', async () => {
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => [
      { id: 10, order: 1, code: 'u01-s1', titleUz: 'Bir', titleDe: 'Eins' },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      {
        id: 1,
        order: 1,
        kind: 'SECTION_A',
        sectionId: 10,
        tier: null,
        titleDe: 'A',
        titleUz: 'A',
        _count: { lexemes: 0, exercises: 0 },
      },
      {
        id: 9,
        order: 9,
        kind: 'UNIT_TEST',
        sectionId: null,
        tier: null,
        titleDe: 'Test',
        titleUz: 'Sinov',
        _count: { lexemes: 0, exercises: 0 },
      },
    ]);
    const unit = await svc(prisma).getUnit(1, 55);
    expect(unit.finalTest!.id).toBe(9);
    expect(
      unit.sections.flatMap((s: any) => s.lessons).map((l: any) => l.id),
    ).toEqual([1]);
  });

  it('yakuniy sinov yo`q bo`lsa null', async () => {
    const prisma = fakePrisma();
    prisma.dafLesson.findMany = jest.fn(async () => []);
    const unit = await svc(prisma).getUnit(1, 55);
    expect(unit.finalTest).toBeNull();
  });

  it('bo`limi yo`q eski DiB darsi yo`qolmaydi', async () => {
    // Eski 20 ta DiB uniti nafaqaga chiqarilgan, lekin ularning darslari
    // hali ham `sectionId: null`. Guruhlash ularni tushirib qoldirmasligi
    // kerak — `lessons` yassi ro'yxati saqlanadi.
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => []);
    prisma.dafLesson.findMany = jest.fn(async () => [
      {
        id: 5,
        order: 1,
        kind: null,
        sectionId: null,
        tier: 2,
        titleDe: 'Alt',
        titleUz: null,
        _count: { lexemes: 3, exercises: 4 },
      },
    ]);
    const unit = await svc(prisma).getUnit(1, 55);
    expect(unit.lessons.map((l: any) => l.id)).toEqual([5]);
    expect(unit.sections).toEqual([]);
    expect(unit.finalTest).toBeNull();
  });

  it('bo`limi bor unitda sectionId`si yo`q dars ogohlantiradi (Finding M12)', async () => {
    // Bu holat yuqoridagi testdan farq qiladi: u yerda unitda UMUMAN
    // bo'lim yo'q (seeding me'yori), bu yerda esa unitda BOSHQA darslar
    // bo'limga ega — demak bu dars uchun `sectionId: null` seeding
    // xatosi va u sahifada UMUMAN ko'rinmay qoladi (bo'lim guruhlari uni
    // tashlab ketadi, yassi ro'yxat esa faqat `sections` bo'sh bo'lganda
    // ko'rsatiladi). Bunday xato sukut saqlab yo'qolib ketmasligi kerak.
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => [
      { id: 10, order: 1, code: 'u01-s1', titleUz: 'Bir', titleDe: 'Eins' },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      {
        id: 1,
        order: 1,
        kind: 'SECTION_A',
        sectionId: 10,
        tier: null,
        titleDe: 'A',
        titleUz: 'A',
        _count: { lexemes: 0, exercises: 0 },
      },
      {
        id: 2,
        order: 2,
        kind: 'SECTION_A',
        sectionId: null,
        tier: null,
        titleDe: 'Yetim',
        titleUz: 'Yetim',
        _count: { lexemes: 0, exercises: 0 },
      },
    ]);
    const unit = await svc(prisma).getUnit(1, 55);
    // Dars hamon bo'lim guruhlarida ko'rinmaydi — bu xulq o'zgarmadi.
    expect(
      unit.sections.flatMap((s: any) => s.lessons).map((l: any) => l.id),
    ).toEqual([1]);
    // Lekin endi bu XATO SUKUT SAQLAMAYDI.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dars 2'));
    warnSpy.mockRestore();
  });

  it('bitta unitda ikkinchi UNIT_TEST paydo bo`lsa ogohlantiradi (Finding M12)', async () => {
    // `finalTest` ni `.find()` bilan tanlash faqat BIRINCHISINI oladi —
    // ikkinchi UNIT_TEST qatori bo'lsa, u yakuniy sinov sifatida hech
    // qachon ko'rinmaydi. Bu seeding xatosi ogohlantirishsiz yo'qolib
    // ketmasligi kerak.
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => []);
    prisma.dafLesson.findMany = jest.fn(async () => [
      {
        id: 9,
        order: 9,
        kind: 'UNIT_TEST',
        sectionId: null,
        tier: null,
        titleDe: 'Test',
        titleUz: 'Sinov',
        _count: { lexemes: 0, exercises: 0 },
      },
      {
        id: 10,
        order: 10,
        kind: 'UNIT_TEST',
        sectionId: null,
        tier: null,
        titleDe: 'Test2',
        titleUz: 'Sinov2',
        _count: { lexemes: 0, exercises: 0 },
      },
    ]);
    const unit = await svc(prisma).getUnit(1, 55);
    expect(unit.finalTest!.id).toBe(9);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('UNIT_TEST'));
    warnSpy.mockRestore();
  });

  it('har darsga o`quvchining ilgarilashini yopishtiradi', async () => {
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => [
      { id: 10, order: 1, code: 'u01-s1', titleUz: 'Bir', titleDe: 'Eins' },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      {
        id: 1,
        order: 1,
        kind: 'SECTION_A',
        sectionId: 10,
        tier: null,
        titleDe: 'A',
        titleUz: 'A',
        _count: { lexemes: 0, exercises: 0 },
      },
      {
        id: 2,
        order: 2,
        kind: 'SECTION_B',
        sectionId: 10,
        tier: null,
        titleDe: 'B',
        titleUz: 'B',
        _count: { lexemes: 0, exercises: 0 },
      },
    ]);
    prisma.dafLessonProgress.findMany = jest.fn(async () => [
      {
        lessonId: 1,
        completedAt: new Date('2026-09-01'),
        bestScore: 11,
        runs: 2,
      },
    ]);
    const unit = await svc(prisma).getUnit(1, 55);
    const [a, b] = unit.sections[0].lessons;
    expect(a.bestScore).toBe(11);
    expect(a.runs).toBe(2);
    expect(a.completedAt).not.toBeNull();
    expect(b.bestScore).toBe(0);
    expect(b.runs).toBe(0);
    expect(b.completedAt).toBeNull();
  });
});
