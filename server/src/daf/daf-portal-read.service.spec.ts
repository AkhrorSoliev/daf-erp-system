import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
    const path = await service.getLevels();

    expect(path.map((p) => p.label)).toEqual(['A1', 'A2', 'B1']);
    expect(path[0].units).toHaveLength(1);
    expect(path[2].units).toEqual([]);
  });

  // Nafaqaga chiqarilgan eski DiB unitlari (A1 migratsiyasi) yo'lga
  // chiqmasligi kerak: ular `order = -id`ga o'tkazilgan, o'sish
  // tartibida saralanganda birinchi bo'lib chiqib, o'quvchining A1
  // yo'lini teskari aylantirardi.
  it("nafaqaga chiqarilgan unitni so'ramaydi", async () => {
    await service.getLevels();

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
    const unit = await service.getUnit(1);

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
    await expect(service.getUnit(99)).rejects.toBeInstanceOf(NotFoundException);
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
    await expect(service.getUnit(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  // Seans tartibi `order`dan olinadi, `tier`dan emas: yangi A1
  // xaritasining darslarida `tier` null, faqat `order` to'ldirilgan.
  // `tier` bo'yicha saralash 15–18 seansni tasodifiy tartibda qaytarardi.
  it("bosqichlarni `order` bo'yicha so'raydi, `tier` bo'yicha emas", async () => {
    await service.getUnit(1);

    const orderBy = prisma.dafLesson.findMany.mock.calls[0][0].orderBy as {
      order?: string;
      tier?: string;
    };
    expect(orderBy).toEqual({ order: 'asc' });
  });
});
