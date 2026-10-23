import { bugunBoshmi, maqsadniSaqla } from './maqsad';

function fake(opts: { due: number; ochiqDars: boolean }) {
  return {
    dafLexemeState: { count: jest.fn(async () => opts.due) },
    dafLesson: {
      findFirst: jest.fn(async () => (opts.ochiqDars ? { id: 7 } : null)),
    },
  } as any;
}

describe('bugunBoshmi', () => {
  it("muddati kelgan so'z bor — bosh emas, dars so'rovi o'qilmaydi", async () => {
    const prisma = fake({ due: 2, ochiqDars: false });
    expect(await bugunBoshmi(prisma, 55)).toBe(false);
    expect(prisma.dafLesson.findFirst).not.toHaveBeenCalled();
  });

  it('son tayyor berilsa qayta sanalmaydi', async () => {
    const prisma = fake({ due: 0, ochiqDars: true });
    expect(await bugunBoshmi(prisma, 55, 4)).toBe(false);
    expect(prisma.dafLexemeState.count).not.toHaveBeenCalled();
    expect(prisma.dafLesson.findFirst).not.toHaveBeenCalled();
  });

  it("so'z yo'q, ochiq dars bor — bosh emas (yangi so'z ball beradi)", async () => {
    expect(await bugunBoshmi(fake({ due: 0, ochiqDars: true }), 55, 0)).toBe(
      false,
    );
  });

  it("so'z yo'q va ochiq dars yo'q — bosh", async () => {
    expect(await bugunBoshmi(fake({ due: 0, ochiqDars: false }), 55)).toBe(
      true,
    );
  });

  it("ochiq dars — yo'ldagi qulf zanjiri bilan bir xil to'plam", async () => {
    const prisma = fake({ due: 0, ochiqDars: false });
    await bugunBoshmi(prisma, 55, 0);
    expect(prisma.dafLesson.findFirst).toHaveBeenCalledWith({
      where: {
        unit: {
          retiredAt: null,
          lexemes: { some: { core: true, sectionId: { not: null } } },
        },
        OR: [{ sectionId: { not: null } }, { kind: 'UNIT_TEST' }],
        progress: { none: { studentId: 55, completedAt: { not: null } } },
      },
      select: { id: true },
    });
  });
});

describe('maqsadniSaqla', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-10-19T09:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  function prismaFor(bugungiBall: number) {
    return {
      dafStudentSetting: { upsert: jest.fn(async () => ({})) },
      dafStudentDay: {
        aggregate: jest.fn(async () => ({ _sum: { points: bugungiBall } })),
      },
      dafLexemeState: { count: jest.fn(async () => 2) },
      dafLesson: { findFirst: jest.fn(async () => ({ id: 1 })) },
    } as any;
  }

  it('upsert bilan saqlaydi — ikki parallel bosish ham bitta qator', async () => {
    const prisma = prismaFor(30);
    await maqsadniSaqla(prisma, 55, 1, 'JIDDIY');
    expect(prisma.dafStudentSetting.upsert).toHaveBeenCalledWith({
      where: { studentId: 55 },
      create: { studentId: 55, companyId: 1, dailyGoal: 'JIDDIY' },
      update: { dailyGoal: 'JIDDIY' },
    });
  });

  it('darrov kuchga kiradi: yangi maqsad bugungi ball bilan qaytadi', async () => {
    const prisma = prismaFor(45);
    expect(await maqsadniSaqla(prisma, 55, 1, 'YENGIL')).toEqual({
      daraja: 'YENGIL',
      ball: 40,
      hozir: 45,
      bajarildi: true,
      bosh: false,
    });
    expect(prisma.dafStudentDay.aggregate).toHaveBeenCalledWith({
      where: { studentId: 55, day: new Date('2026-10-19T00:00:00.000Z') },
      _sum: { points: true },
    });
  });
});
