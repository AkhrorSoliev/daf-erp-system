import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JangService } from './jang.service';

jest.mock('../nishon/nishon-berish', () => ({
  grantBadges: jest.fn().mockResolvedValue(['JANG_10']),
}));

const T0 = new Date('2026-10-27T06:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const BOT = Array.from({ length: 6 }, (_, i) => ({ togri: i < 3, ms: 5000 }));

function yasa(
  jang: Record<string, unknown> | null,
  o: { javoblar?: { correct: boolean; ms: number }[] } = {},
) {
  const prisma = {
    dafBattle: {
      findFirst: jest.fn().mockResolvedValue(jang),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(10),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ correctCount: 4, totalMs: 30_000 }),
    },
    dafBattleQuestion: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ kind: 'TYPE', answer: 'Tschüss', akzeptiert: [] }),
    },
    dafBattleAnswer: {
      create: jest.fn().mockReturnValue('create-op'),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue(o.javoblar ?? []),
      findUnique: jest.fn().mockResolvedValue({ correct: true, ms: 4000 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const config = { get: () => 'on' };
  return { prisma, servis: new JangService(prisma as never, config as never) };
}

const ochiqJang = (o: Record<string, unknown> = {}) => ({
  id: 55,
  status: 'OPEN',
  questionIds: [1, 2, 3, 4, 5, 6],
  lastActivityAt: T0,
  opponent: 'BOT',
  ghostBattleId: null,
  botAnswers: BOT,
  _count: { answers: 0 },
  ...o,
});

describe('JangService.javob', () => {
  it('boshqaning jangi — 404', async () => {
    const { servis } = yasa(null);
    await expect(
      servis.javob(10, 55, { pozitsiya: 0, javob: 'x' }, at(1000)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("vaqtida to'g'ri javob, vaqt server o'lchagan", async () => {
    const { servis, prisma } = yasa(ochiqJang());
    const r = await servis.javob(
      10,
      55,
      { pozitsiya: 0, javob: 'tschuess' },
      at(4200),
    );
    expect(r).toEqual({
      togri: true,
      togriJavob: 'Tschüss',
      raqib: { togri: true, ms: 5000 },
    });
    expect(prisma.dafBattleAnswer.create).toHaveBeenCalledWith({
      data: {
        battleId: 55,
        questionId: 1,
        position: 0,
        given: 'tschuess',
        correct: true,
        ms: 4200,
      },
    });
  });
  it("12 soniyadan kech — to'g'ri bo'lsa ham xato, ms 10000", async () => {
    const { servis, prisma } = yasa(ochiqJang());
    const r = await servis.javob(
      10,
      55,
      { pozitsiya: 0, javob: 'Tschüss' },
      at(12_500),
    );
    expect(r.togri).toBe(false);
    expect(prisma.dafBattleAnswer.create.mock.calls[0][0].data.ms).toBe(10_000);
  });
  it('60 soniyadan keyin — tashlab ketilgan, 409', async () => {
    const { servis, prisma } = yasa(ochiqJang());
    await expect(
      servis.javob(10, 55, { pozitsiya: 0, javob: 'x' }, at(61_000)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.dafBattle.update).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { status: 'ABANDONED' },
    });
  });
  it('tartibsiz pozitsiya — 400', async () => {
    const { servis } = yasa(ochiqJang({ _count: { answers: 2 } }));
    await expect(
      servis.javob(10, 55, { pozitsiya: 0, javob: 'x' }, at(1000)),
    ).rejects.toThrow('tartibi');
  });
  it('ikki marta yuborilgan javob — 409', async () => {
    const { servis, prisma } = yasa(ochiqJang());
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    await expect(
      servis.javob(10, 55, { pozitsiya: 0, javob: 'x' }, at(1000)),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('ruh jangi — ruhning shu pozitsiyadagi javobi', async () => {
    const { servis, prisma } = yasa(
      ochiqJang({ opponent: 'GHOST', ghostBattleId: 900, botAnswers: null }),
    );
    const r = await servis.javob(
      10,
      55,
      { pozitsiya: 0, javob: 'x' },
      at(1000),
    );
    expect(prisma.dafBattleAnswer.findUnique).toHaveBeenCalledWith({
      where: { battleId_position: { battleId: 900, position: 0 } },
      select: { correct: true, ms: true },
    });
    expect(r.raqib).toEqual({ togri: true, ms: 4000 });
  });
});

describe('JangService.yakun', () => {
  const javoblar = [
    ...Array.from({ length: 4 }, () => ({ correct: true, ms: 3000 })),
    ...Array.from({ length: 2 }, () => ({ correct: false, ms: 10_000 })),
  ];
  it("bot bilan: 4 > 3 — g'alaba, nishon beriladi", async () => {
    const { servis, prisma } = yasa(ochiqJang({ _count: { answers: 6 } }), {
      javoblar,
    });
    const r = await servis.yakun(10, 1, 55, at(40_000));
    expect(r).toEqual({
      natija: 'WIN',
      men: { togri: 4, ms: 32_000 },
      raqib: { togri: 3, ms: 30_000 },
      yangiNishonlar: ['JANG_10'],
    });
    expect(prisma.dafBattleAnswer.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(prisma.dafBattle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55, status: 'OPEN' } }),
    );
  });
  it("DONE yozilganda finishedAt ham qo'yiladi (NULL tartibni buzmasin)", async () => {
    const { servis, prisma } = yasa(ochiqJang({ _count: { answers: 6 } }), {
      javoblar,
    });
    await servis.yakun(10, 1, 55, at(40_000));
    expect(prisma.dafBattle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DONE',
          finishedAt: at(40_000),
        }),
      }),
    );
  });
  it("ruh bilan: teng to'g'ri, ruh tezroq — mag'lubiyat", async () => {
    const { servis } = yasa(
      ochiqJang({
        opponent: 'GHOST',
        ghostBattleId: 900,
        botAnswers: null,
        _count: { answers: 6 },
      }),
      {
        javoblar: javoblar.map((j) => ({
          ...j,
          ms: j.correct ? 6000 : 10_000,
        })),
      },
    );
    const r = await servis.yakun(10, 1, 55, at(60_000));
    expect(r.natija).toBe('LOSS');
    expect(r.yangiNishonlar).toEqual([]);
  });
  it('allaqachon tugagan — saqlangan natija, qayta yozilmaydi', async () => {
    const { servis, prisma } = yasa(
      ochiqJang({
        status: 'DONE',
        result: 'DRAW',
        correctCount: 3,
        totalMs: 20_000,
        opponentCorrect: 3,
        opponentMs: 20_000,
      }),
    );
    const r = await servis.yakun(10, 1, 55, at(1000));
    expect(r.natija).toBe('DRAW');
    expect(prisma.dafBattle.updateMany).not.toHaveBeenCalled();
  });
  it("yarim qolib 60 s o'tgan — tashlab ketilgan, 409", async () => {
    const { servis } = yasa(ochiqJang({ _count: { answers: 2 } }));
    await expect(servis.yakun(10, 1, 55, at(70_000))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
