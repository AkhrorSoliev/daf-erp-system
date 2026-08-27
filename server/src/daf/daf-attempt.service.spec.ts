import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DafAttemptService } from './daf-attempt.service';

const CTX = { studentId: 10001, companyId: 1 };

describe('DafAttemptService', () => {
  let service: DafAttemptService;
  let prisma: {
    dafExercise: { findUnique: jest.Mock };
    dafAttempt: { create: jest.Mock };
    studentBranch: { findFirst: jest.Mock };
    enrollment: { findFirst: jest.Mock };
  };

  const exercise = (over: Record<string, unknown> = {}) => ({
    id: 7,
    answers: ['a. einen Präsidenten'],
    answerStatus: 'FROM_SOURCE',
    retiredAt: null,
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      dafExercise: { findUnique: jest.fn().mockResolvedValue(exercise()) },
      dafAttempt: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 3 }),
      },
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({ groupId: 'g-9' }),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        DafAttemptService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DafAttemptService);
  });

  // Tekshiruv SERVERDA. To'g'ri javobni mijozga oldindan yuborish uni
  // tarmoq oynasida ko'rinadigan qilardi.
  it('javobni serverda tekshiradi', async () => {
    const r = await service.record(
      { exerciseId: 7, given: 'a. einen Präsidenten' },
      CTX,
    );
    expect(r.isCorrect).toBe(true);
  });

  // Xato javob ham yoziladi: o'qituvchiga eng kerakli signal aynan shu —
  // guruh qaysi mashqda qoqilyapti.
  it('xato javobni ham yozadi', async () => {
    const r = await service.record(
      { exerciseId: 7, given: 'b. den Präsident' },
      CTX,
    );

    expect(r.isCorrect).toBe(false);
    const data = prisma.dafAttempt.create.mock.calls[0][0].data as {
      isCorrect: boolean;
      given: string;
    };
    expect(data.isCorrect).toBe(false);
    expect(data.given).toBe('b. den Präsident');
  });

  // Filial va guruh YOZISH PAYTIDA muhrlanadi. Jonli bog'lanishdan
  // o'qilsa, o'quvchi ko'chganda o'tgan oyning natijalari yangi filialga
  // ko'chib o'tardi.
  it('filial va guruhni urinish qatoriga muhrlaydi', async () => {
    await service.record({ exerciseId: 7, given: 'x' }, CTX);

    const data = prisma.dafAttempt.create.mock.calls[0][0].data as {
      branchId: number;
      groupId: string;
      companyId: number;
    };
    expect(data).toMatchObject({ branchId: 3, groupId: 'g-9', companyId: 1 });
  });

  // Filiali topilmagan o'quvchi ham mashq yechishi kerak: urinish o'quv
  // faoliyati, pul harakati emas. Fail-closed bo'lish o'quvchini
  // to'sib qo'yardi.
  it('filiali topilmasa ham urinishni yozadi', async () => {
    prisma.studentBranch.findFirst.mockResolvedValue(null);
    prisma.enrollment.findFirst.mockResolvedValue(null);

    await service.record({ exerciseId: 7, given: 'x' }, CTX);

    const data = prisma.dafAttempt.create.mock.calls[0][0].data as {
      branchId: number | null;
      groupId: string | null;
    };
    expect(data.branchId).toBeNull();
    expect(data.groupId).toBeNull();
  });

  // Ochiq javobli mashqda «to'g'ri javob» tushunchasi yo'q — manba uni
  // bermagan, chunki to'g'ri javob bitta emas. Uni «xato» deb belgilash
  // o'quvchini adashtiradi.
  it('OPEN mashqqa javob yuborishni rad etadi', async () => {
    prisma.dafExercise.findUnique.mockResolvedValue(
      exercise({ answerStatus: 'OPEN', answers: [null] }),
    );

    await expect(
      service.record({ exerciseId: 7, given: 'x' }, CTX),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dafAttempt.create).not.toHaveBeenCalled();
  });

  // Nafaqadagi mashq o'quv yo'lining qismi emas: unga ball berish
  // reytingni manbadan yo'qolgan kontentga bog'lardi.
  it('nafaqaga chiqarilgan mashqqa urinish yozmaydi', async () => {
    prisma.dafExercise.findUnique.mockResolvedValue(
      exercise({ retiredAt: new Date() }),
    );

    await expect(
      service.record({ exerciseId: 7, given: 'x' }, CTX),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("mavjud bo'lmagan mashqda 404 beradi", async () => {
    prisma.dafExercise.findUnique.mockResolvedValue(null);

    await expect(
      service.record({ exerciseId: 99, given: 'x' }, CTX),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // To'g'ri javob urinishdan KEYIN qaytariladi — o'quvchi xato qilganda
  // nimani bilmaganini ko'rishi kerak.
  it('javobni urinishdan keyin qaytaradi', async () => {
    const r = await service.record({ exerciseId: 7, given: 'xato' }, CTX);
    expect(r.correctAnswers).toEqual(['a. einen Präsidenten']);
  });
});
