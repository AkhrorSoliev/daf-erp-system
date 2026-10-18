import { bugunBoshmi } from './maqsad';

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
