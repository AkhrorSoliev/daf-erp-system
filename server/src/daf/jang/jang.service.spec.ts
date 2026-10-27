import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JangService } from './jang.service';

const HOZIR = new Date('2026-10-27T06:00:00Z'); // 11:00 Toshkent

function yasa(
  o: {
    flag?: string;
    darslar?: { unitId: number; progress: unknown[] }[];
    bugun?: number;
    savollar?: { id: number; kind: string }[];
    oldingi?: number;
    ruhNomzodlari?: { id: number; studentId: number; questionIds: number[] }[];
    egaTarixi?: { studentId: number; correctCount: number }[];
    tasdiqlangan?: number;
    toliqOchiq?: { id: number } | null;
  } = {},
) {
  const savolQatori = (id: number) => ({
    id,
    kind: 'CHOOSE',
    prompt: `S${id}`,
    options: ['a', 'b', 'c'],
    audioKey: null,
    audioStartMs: null,
    audioEndMs: null,
  });
  const prisma = {
    dafLesson: {
      findMany: jest
        .fn()
        .mockResolvedValue(o.darslar ?? [{ unitId: 1, progress: [{ id: 1 }] }]),
    },
    dafBattleQuestion: {
      findMany: jest.fn(async (q: { where: { id?: { in: number[] } } }) =>
        q.where.id ? q.where.id.in.map(savolQatori) : (o.savollar ?? []),
      ),
      count: jest.fn().mockResolvedValue(o.tasdiqlangan ?? 30),
    },
    dafBattle: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn(
        async (q: {
          where: { createdAt?: unknown; status?: unknown; result?: unknown };
        }) => {
          if (q.where.createdAt) return o.bugun ?? 0;
          if (q.where.status) return o.oldingi ?? 0;
          return 0;
        },
      ),
      findMany: jest.fn(
        async (q: {
          where: { companyId?: number; studentId?: unknown };
          select: Record<string, unknown>;
        }) => {
          if (q.where.companyId !== undefined) return o.ruhNomzodlari ?? [];
          if (typeof q.where.studentId === 'object') return o.egaTarixi ?? [];
          return [];
        },
      ),
      findFirst: jest.fn().mockResolvedValue(o.toliqOchiq ?? null),
      create: jest.fn().mockResolvedValue({ id: 55 }),
    },
    student: {
      findUnique: jest.fn().mockResolvedValue({
        firstName: 'Sevinch',
        lastName: 'Tanieva',
        photo: null,
      }),
    },
  };
  const config = {
    get: (k: string) =>
      k === 'DAF_JANG' ? (o.flag ?? 'on') : 'https://cdn.test',
  };
  return { prisma, servis: new JangService(prisma as never, config as never) };
}

const olti = [1, 2, 3, 4, 5, 6].map((id) => ({ id, kind: 'CHOOSE' }));

describe('JangService.holat', () => {
  it("o'chiq — hammasi nol", async () => {
    const { servis } = yasa({ flag: 'off' });
    expect(await servis.holat(10, HOZIR)).toEqual({
      yoqilgan: false,
      ochiq: false,
      bugunQoldi: 0,
      golibSoni: 0,
      seriya: 0,
    });
  });
  it('yoqilgan — bugun qolgan jang', async () => {
    const { servis } = yasa({ bugun: 2 });
    expect(await servis.holat(10, HOZIR)).toMatchObject({
      yoqilgan: true,
      ochiq: true,
      bugunQoldi: 3,
    });
  });
  it("tasdiqlangan savol 5 ta — ochiq:false, qolgani o'zgarmaydi", async () => {
    const { servis } = yasa({ bugun: 2, tasdiqlangan: 5 });
    expect(await servis.holat(10, HOZIR)).toMatchObject({
      yoqilgan: true,
      ochiq: false,
      bugunQoldi: 3,
    });
  });
  it('tasdiqlangan savol 6 ta — ochiq:true', async () => {
    const { servis } = yasa({ tasdiqlangan: 6 });
    expect((await servis.holat(10, HOZIR)).ochiq).toBe(true);
  });
});

describe('JangService.boshla', () => {
  it("o'chiq — 404", async () => {
    const { servis } = yasa({ flag: 'off' });
    await expect(servis.boshla(10, 1, HOZIR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('kunlik chegara — 400', async () => {
    const { servis } = yasa({ bugun: 5, savollar: olti });
    await expect(servis.boshla(10, 1, HOZIR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it("o'tilgan unit yo'q — 400", async () => {
    const { servis } = yasa({
      darslar: [{ unitId: 1, progress: [] }],
      savollar: olti,
    });
    await expect(servis.boshla(10, 1, HOZIR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it("ruh yo'q — bot, javobsiz savollar, eski OPEN tashlanadi", async () => {
    const { servis, prisma } = yasa({ savollar: olti });
    const r = await servis.boshla(10, 1, HOZIR, () => 0.5);
    expect(prisma.dafBattle.updateMany).toHaveBeenCalledWith({
      where: { studentId: 10, status: 'OPEN' },
      data: { status: 'ABANDONED' },
    });
    expect(r.raqib).toEqual({
      tur: 'BOT',
      studentId: null,
      ism: 'Dafi bot',
      rasm: null,
      golibSoni: null,
    });
    expect(r.savollar).toHaveLength(6);
    expect(r.savollar[0]).not.toHaveProperty('answer');
    const data = prisma.dafBattle.create.mock.calls[0][0].data;
    expect(data.opponent).toBe('BOT');
    expect(data.botAnswers).toHaveLength(6);
    expect(data.lastActivityAt).toEqual(new Date(HOZIR.getTime() + 3000));
  });
  it('mos ruh — uning savollari va ismi', async () => {
    const { servis, prisma } = yasa({
      savollar: olti,
      ruhNomzodlari: [
        { id: 900, studentId: 20, questionIds: [6, 5, 4, 3, 2, 1] },
      ],
    });
    const r = await servis.boshla(10, 1, HOZIR, () => 0.5);
    expect(r.raqib).toMatchObject({
      tur: 'GHOST',
      studentId: 20,
      ism: 'Sevinch T.',
    });
    expect(r.savollar.map((s) => s.prompt)).toEqual([
      'S6',
      'S5',
      'S4',
      'S3',
      'S2',
      'S1',
    ]);
    expect(prisma.dafBattle.create.mock.calls[0][0].data.ghostBattleId).toBe(
      900,
    );
  });
  it("har 3-jang — ruh bo'lsa ham bot", async () => {
    const { servis } = yasa({
      savollar: olti,
      oldingi: 2,
      ruhNomzodlari: [
        { id: 900, studentId: 20, questionIds: [1, 2, 3, 4, 5, 6] },
      ],
    });
    expect((await servis.boshla(10, 1, HOZIR)).raqib.tur).toBe('BOT');
  });
  it("to'liq javoblangan OPEN jang eskisini tashlashdan OLDIN yakunlanadi", async () => {
    const { servis, prisma } = yasa({
      savollar: olti,
      toliqOchiq: { id: 77 },
    });
    const yakun = jest.spyOn(servis, 'yakun').mockResolvedValue({} as never);
    await servis.boshla(10, 1, HOZIR, () => 0.5);
    expect(prisma.dafBattle.findFirst).toHaveBeenCalledWith({
      where: {
        studentId: 10,
        status: 'OPEN',
        answers: { some: { position: 5 } },
      },
      select: { id: true },
    });
    expect(yakun).toHaveBeenCalledWith(10, 1, 77, HOZIR);
    expect(yakun.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.dafBattle.updateMany.mock.invocationCallOrder[0],
    );
  });
  it('yakun xato bersa ham boshla davom etadi', async () => {
    const { servis, prisma } = yasa({
      savollar: olti,
      toliqOchiq: { id: 77 },
    });
    jest.spyOn(servis, 'yakun').mockRejectedValue(new Error('tarmoq'));
    const r = await servis.boshla(10, 1, HOZIR, () => 0.5);
    expect(r.jangId).toBe(55);
    expect(prisma.dafBattle.updateMany).toHaveBeenCalled();
  });
  it('savol yetmasa — 409', async () => {
    const { servis } = yasa({ savollar: olti.slice(0, 4) });
    await expect(servis.boshla(10, 1, HOZIR)).rejects.toThrow('yetarli emas');
  });
});
