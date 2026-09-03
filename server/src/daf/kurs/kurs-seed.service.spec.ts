import { KursSeedService } from './kurs-seed.service';
import type { KursFile } from './kurs.types';

function kurs(): KursFile {
  return {
    level: 'A1',
    units: [
      {
        order: 1,
        code: 'u01',
        titleDe: 'Hallo!',
        titleUz: 'Salom!',
        theme: 'tanishuv',
        sections: [
          { order: 1, code: 'u01-s1', titleDe: 'A', titleUz: 'A', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
          { order: 2, code: 'u01-s2', titleDe: 'B', titleUz: 'B', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
        ],
      },
    ],
  };
}

/** Prisma o'rniga eng kichik soxta obyekt — baza kerak emas. */
function fakePrisma() {
  const unitRows = new Map<string, { id: number }>();
  const sectionRows = new Map<string, { id: number }>();
  const lessonRows = new Map<string, { id: number }>();
  const retired: string[] = [];
  let seq = 0;

  return {
    retired,
    unitRows,
    sectionRows,
    lessonRows,
    dafUnit: {
      upsert: jest.fn(async ({ where }: any) => {
        const key = where.code as string;
        if (!unitRows.has(key)) unitRows.set(key, { id: ++seq });
        return unitRows.get(key);
      }),
      findMany: jest.fn(async () => [{ id: 99, code: 'dib-01' }]),
      update: jest.fn(async ({ where }: any) => {
        retired.push(String(where.id));
        return { id: where.id };
      }),
    },
    dafSection: {
      upsert: jest.fn(async ({ where }: any) => {
        const key = where.code as string;
        if (!sectionRows.has(key)) sectionRows.set(key, { id: ++seq });
        return sectionRows.get(key);
      }),
    },
    dafLesson: {
      upsert: jest.fn(async ({ where }: any) => {
        const key = where.sourceId as string;
        if (!lessonRows.has(key)) lessonRows.set(key, { id: ++seq });
        return lessonRows.get(key);
      }),
    },
  };
}

describe('KursSeedService', () => {
  it('unit, bo`lim va seanslarni yozadi', async () => {
    const prisma = fakePrisma();
    const report = await new KursSeedService(prisma as any).seed(kurs());

    // 2 bo'lim × 2 dars + 1 o'tish + 1 yakun = 6
    expect(report).toEqual({ units: 1, sections: 2, lessons: 6, retired: 1 });
  });

  it('xaritada yo`q eski A1 bo`limini nafaqaga chiqaradi', async () => {
    const prisma = fakePrisma();
    await new KursSeedService(prisma as any).seed(kurs());

    expect(prisma.dafUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99 },
        data: expect.objectContaining({ retiredAt: expect.any(Date) }),
      }),
    );
  });

  it('qayta yuritilganda takrorlamaydi', async () => {
    const prisma = fakePrisma();
    const service = new KursSeedService(prisma as any);
    await service.seed(kurs());
    await service.seed(kurs());

    expect(prisma.unitRows.size).toBe(1);
    expect(prisma.sectionRows.size).toBe(2);
    expect(prisma.lessonRows.size).toBe(6);
  });

  it('bo`limni unitga bog`laydi', async () => {
    const prisma = fakePrisma();
    await new KursSeedService(prisma as any).seed(kurs());

    const call = prisma.dafSection.upsert.mock.calls[0][0] as any;
    expect(call.create.unitId).toBe(1);
    expect(call.create.code).toBe('u01-s1');
  });
});
