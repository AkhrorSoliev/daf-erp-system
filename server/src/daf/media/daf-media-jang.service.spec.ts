import { DafMediaJangService } from './daf-media-jang.service';

const config = {
  get: (k: string) =>
    k === 'R2_PUBLIC_URL' ? 'https://r2.example/' : undefined,
};

function savolRow(over: Record<string, unknown> = {}) {
  return {
    id: 9,
    sourceId: 'jang-a1-u02-001',
    kind: 'LISTEN',
    prompt: 'p',
    options: [],
    answer: 'Mutter',
    akzeptiert: [],
    audioKey: 'daf/m.mp3',
    audioStartMs: null,
    audioEndMs: null,
    status: 'DRAFT',
    ...over,
  };
}

function unitRow(questions: unknown[]) {
  return {
    id: 2,
    code: 'u02',
    order: 2,
    level: 'A1',
    titleUz: 'Oila',
    titleDe: 'Familie',
    battleQuestions: questions,
  };
}

describe('DafMediaJangService', () => {
  it('bitta so`rovda unit+savollarni oladi va level, order bo`yicha tartiblaydi', async () => {
    const findMany = jest.fn(async (_arg: unknown) => [unitRow([savolRow()])]);
    const prisma = { dafUnit: { findMany } };
    const r = await new DafMediaJangService(
      prisma as any,
      config as any,
    ).jang();

    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0] as any;
    expect(arg.orderBy).toEqual([{ level: 'asc' }, { order: 'asc' }]);
    expect(arg.where).toEqual({
      retiredAt: null,
      battleQuestions: { some: {} },
    });
    expect(arg.include.battleQuestions.orderBy).toEqual({ sourceId: 'asc' });

    expect(r.units).toHaveLength(1);
    expect(r.units[0].questions[0].audio).toEqual({
      url: 'https://r2.example/daf/m.mp3',
      startMs: null,
      endMs: null,
    });
  });

  it('R2_PUBLIC_URL bo`lmasa audio null', async () => {
    const prisma = {
      dafUnit: { findMany: jest.fn(async () => [unitRow([savolRow()])]) },
    };
    const r = await new DafMediaJangService(
      prisma as any,
      { get: () => undefined } as any,
    ).jang();
    expect(r.units[0].questions[0].audio).toBeNull();
  });
});
