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
          {
            order: 1,
            code: 'u01-s1',
            titleDe: 'A',
            titleUz: 'A',
            grammar: 'g',
            grammarUz: 'g',
            wordBudget: 10,
          },
          {
            order: 2,
            code: 'u01-s2',
            titleDe: 'B',
            titleUz: 'B',
            grammar: 'g',
            grammarUz: 'g',
            wordBudget: 10,
          },
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

  // Bazada allaqachon turgan, xaritada yo'q eski unit — `retireOld` shuni
  // topib nafaqaga chiqarishi kerak, lekin FAQAT bir marta: ikkinchi
  // yuritishda `retiredAt` allaqachon to'ldirilgan, shuning uchun
  // `findMany({ where: { retiredAt: null } })` uni ENDI qaytarmasligi
  // kerak. Fake buni ANIQ takrorlamasa, "qayta chiqarilmaydi" sinovi
  // hech narsani tekshirmay o'tib ketardi.
  const oldUnits: { id: number; code: string; retiredAt: Date | null }[] = [
    { id: 99, code: 'dib-01', retiredAt: null },
  ];

  return {
    retired,
    unitRows,
    sectionRows,
    lessonRows,
    oldUnits,
    dafUnit: {
      upsert: jest.fn(async ({ where }: any) => {
        const key = where.code as string;
        if (!unitRows.has(key)) unitRows.set(key, { id: ++seq });
        return unitRows.get(key);
      }),
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.retiredAt === null) {
          return oldUnits.filter((u) => u.retiredAt === null);
        }
        return oldUnits;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: number };
          data: { retiredAt?: Date };
        }) => {
          retired.push(String(where.id));
          const row = oldUnits.find((u) => u.id === where.id);
          if (row) row.retiredAt = data.retiredAt ?? new Date();
          return { id: where.id };
        },
      ),
    },
    dafSection: {
      upsert: jest.fn(async ({ where }: any) => {
        const key = where.code as string;
        if (!sectionRows.has(key)) sectionRows.set(key, { id: ++seq });
        return sectionRows.get(key);
      }),
      /** Sinovlar buzilgan holatni sinash uchun bu yerni qayta yozadi. */
      findMany: jest.fn(async () => [] as { code: string }[]),
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

  // Allaqachon nafaqadagi qator ikkinchi marta "nafaqaga chiqarilgan"
  // deb sanalmasligi kerak — `retireOld` `retiredAt: null` bo'yicha
  // so'raydi, va bir marta belgilangan qator ENDI shu ro'yxatga tushmaydi.
  it('qayta yuritilganda nafaqaga chiqarishni takrorlamaydi', async () => {
    const prisma = fakePrisma();
    const service = new KursSeedService(prisma as any);

    const first = await service.seed(kurs());
    const second = await service.seed(kurs());

    expect(first.retired).toBe(1);
    expect(second.retired).toBe(0);
  });

  it('bo`limni unitga bog`laydi', async () => {
    const prisma = fakePrisma();
    await new KursSeedService(prisma as any).seed(kurs());

    const call = prisma.dafSection.upsert.mock.calls[0][0] as any;
    expect(call.create.unitId).toBe(1);
    expect(call.create.code).toBe('u01-s1');
  });

  it('bo`lim seansini o`z bo`limiga, yakunini null`ga bog`laydi', async () => {
    const prisma = fakePrisma();
    await new KursSeedService(prisma as any).seed(kurs());

    const bId = prisma.sectionRows.get('u01-s2')!.id;
    const calls = prisma.dafLesson.upsert.mock.calls.map((c: any) => c[0]);

    // ikkinchi bo'limning "tanishuv" darsi (u01-s02-a) shu bo'limga bog'lanishi kerak
    const sectionACall = calls.find(
      (c: any) => c.create.sourceId === 'u01-s02-a',
    );
    expect(sectionACall.create.sectionId).toBe(bId);
    expect(sectionACall.update.sectionId).toBe(bId);

    // unit yakuni (u01-test) hech qaysi bo'limga bog'lanmaydi
    const testCall = calls.find((c: any) => c.create.sourceId === 'u01-test');
    expect(testCall.create.sectionId).toBeNull();
    expect(testCall.update.sectionId).toBeNull();
  });

  it('bazada xaritada yo`q bo`lim kodi qolgan bo`lsa, rad etadi', async () => {
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => [
      { code: 'u01-s1' },
      { code: 'u01-eski' },
    ]);

    let error: unknown;
    try {
      await new KursSeedService(prisma as any).seed(kurs());
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('u01'); // qaysi unit
    expect(message).toContain('u01-eski'); // qaysi kod yetim qoldi
  });
});
