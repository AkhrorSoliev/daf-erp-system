import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DafDrillService } from './daf-drill.service';

const LEXEMES = [
  { id: 1, de: 'Hallo!', uz: 'Salom!', audioStartMs: 3580, audioEndMs: 4270 },
  {
    id: 2,
    de: 'Guten Tag!',
    uz: 'Xayrli kun!',
    audioStartMs: 10270,
    audioEndMs: 11150,
  },
  {
    id: 3,
    de: 'Tschüss!',
    uz: 'Xayr!',
    audioStartMs: 20550,
    audioEndMs: 21130,
  },
  {
    id: 4,
    de: 'Bis bald!',
    uz: 'Ko`rishguncha!',
    audioStartMs: null,
    audioEndMs: null,
  },
];

describe('DafDrillService', () => {
  let service: DafDrillService;
  let prisma: {
    dafLesson: { findUnique: jest.Mock };
    dafLexeme: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      dafLesson: { findUnique: jest.fn().mockResolvedValue({ id: 3 }) },
      dafLexeme: {
        findMany: jest
          .fn()
          .mockImplementation((args: { select?: Record<string, boolean> }) =>
            args.select?.audioKey
              ? LEXEMES.map((l) => ({ id: l.id, audioKey: 'dib/audio/x.mp3' }))
              : LEXEMES,
          ),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        DafDrillService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://pub-x.r2.dev' },
        },
      ],
    }).compile();

    service = module.get(DafDrillService);
  });

  // ENG MUHIM TEKSHIRUV: to'g'ri javob mijozga yuborilmaydi. Yuborilsa,
  // uni brauzerning tarmoq oynasida ko'rish mumkin bo'lardi.
  it("savollarda to'g'ri javob bo'lmaydi", async () => {
    for (const q of await service.getDrill(3)) {
      expect(q).not.toHaveProperty('answer');
      expect(q).not.toHaveProperty('lexemeId');
    }
  });

  // Savollar barqaror bo'lishi SHART: `check` savolni qayta tug'ib,
  // o'sha o'rindagi javobni oladi. Tasodifiy ketma-ketlikda ikkinchi
  // tug'ilish boshqa savol berardi va har javob xato chiqardi.
  it('savollar ketma-ketligi barqaror', async () => {
    const a = await service.getDrill(3);
    const b = await service.getDrill(3);
    expect(b.map((q) => q.prompt)).toEqual(a.map((q) => q.prompt));
    expect(b.map((q) => q.options.join())).toEqual(
      a.map((q) => q.options.join()),
    );
  });

  it("to'g'ri javobni qabul qiladi", async () => {
    const qs = await service.getDrill(3);
    const i = qs.findIndex((q) => q.kind === 'WORD_TO_UZ');
    const lex = LEXEMES.find((l) => l.de === qs[i].prompt)!;

    const r = await service.check(3, i, lex.uz);
    expect(r.isCorrect).toBe(true);
  });

  it('xato javobni rad etadi va to`g`risini qaytaradi', async () => {
    const qs = await service.getDrill(3);
    const i = qs.findIndex((q) => q.kind === 'WORD_TO_UZ');

    const r = await service.check(3, i, 'butunlay boshqa javob');
    expect(r.isCorrect).toBe(false);
    expect(r.answer).toBeTruthy();
  });

  // Audio oralig'i savol bilan birga keladi — mijoz butun faylni emas,
  // faqat o'sha bo'lakni o'ynatadi.
  it('tinglash savoliga audio oralig`ini beradi', async () => {
    const q = (await service.getDrill(3)).find(
      (x) => x.kind === 'AUDIO_TO_WORD',
    );
    expect(q!.audio).toMatchObject({
      url: 'https://pub-x.r2.dev/dib/audio/x.mp3',
      startMs: expect.any(Number),
      endMs: expect.any(Number),
    });
  });

  it("mavjud bo'lmagan darsda 404 beradi", async () => {
    prisma.dafLesson.findUnique.mockResolvedValue(null);
    await expect(service.getDrill(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("mavjud bo'lmagan savolda 400 beradi", async () => {
    await expect(service.check(3, 999, 'x')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
