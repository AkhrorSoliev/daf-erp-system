import { raqamOf, shakllantir, type JangUnitRow } from './daf-media-jang.shape';

const url = (k: string | null) => (k ? `https://r2.example/${k}` : null);

function savol(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    sourceId: 'jang-a1-u02-001',
    kind: 'CHOOSE',
    prompt: 'p',
    options: ['a', 'b'],
    answer: 'a',
    akzeptiert: [],
    audioKey: null,
    audioStartMs: null,
    audioEndMs: null,
    status: 'DRAFT',
    ...over,
  };
}

function unit(over: Partial<JangUnitRow> = {}): JangUnitRow {
  return {
    id: 2,
    code: 'u02',
    order: 2,
    titleUz: 'Oila',
    titleDe: 'Familie',
    level: 'A1',
    battleQuestions: [],
    ...over,
  } as JangUnitRow;
}

describe('raqamOf', () => {
  it('sourceId oxiridagi uch raqamni qaytaradi', () => {
    expect(raqamOf('jang-a1-u02-023')).toBe('023');
  });
  it('kutilmagan shaklda butun qiymatni qaytaradi', () => {
    expect(raqamOf('x')).toBe('x');
  });
});

describe('shakllantir', () => {
  it('savolsiz unitni tashlab yuboradi', () => {
    expect(shakllantir([unit()], url)).toEqual([]);
  });

  it('fayl nomini level va tartibdan chiqaradi', () => {
    const r = shakllantir([unit({ battleQuestions: [savol()] as any })], url);
    expect(r[0].fayl).toBe('a1-u02.json');
    expect(r[0].unitId).toBe(2);
  });

  it('fayl nomi code emas, level va order dan chiqadi (code order dan farq qilsa ham)', () => {
    const r = shakllantir(
      [
        unit({
          order: 6,
          code: 'u05',
          battleQuestions: [savol()] as any,
        }),
      ],
      url,
    );
    expect(r[0].code).toBe('u05');
    expect(r[0].fayl).toBe('a1-u06.json');
  });

  it('savollarni sourceId bo`yicha tartiblaydi', () => {
    const r = shakllantir(
      [
        unit({
          battleQuestions: [
            savol({ id: 2, sourceId: 'jang-a1-u02-010' }),
            savol({ id: 1, sourceId: 'jang-a1-u02-002' }),
          ] as any,
        }),
      ],
      url,
    );
    expect(r[0].questions.map((q) => q.raqam)).toEqual(['002', '010']);
  });

  it('turi va holati bo`yicha sanaydi', () => {
    const r = shakllantir(
      [
        unit({
          battleQuestions: [
            savol({
              sourceId: 'jang-a1-u02-001',
              kind: 'CHOOSE',
              status: 'APPROVED',
            }),
            savol({ sourceId: 'jang-a1-u02-002', kind: 'TYPE' }),
            savol({ sourceId: 'jang-a1-u02-003', kind: 'LISTEN' }),
            savol({ sourceId: 'jang-a1-u02-004', kind: 'LISTEN' }),
          ] as any,
        }),
      ],
      url,
    );
    expect(r[0].counts).toEqual({
      jami: 4,
      tasdiqlangan: 1,
      qoralama: 3,
      choose: 1,
      type: 1,
      listen: 2,
    });
  });

  it('audio kalitini manzilga aylantiradi, xom kalitni chiqarmaydi', () => {
    const r = shakllantir(
      [
        unit({
          battleQuestions: [
            savol({
              kind: 'LISTEN',
              audioKey: 'daf/a.mp3',
              audioStartMs: 100,
              audioEndMs: 900,
            }),
          ] as any,
        }),
      ],
      url,
    );
    const q = r[0].questions[0];
    expect(q.audio).toEqual({
      url: 'https://r2.example/daf/a.mp3',
      startMs: 100,
      endMs: 900,
    });
    expect(JSON.stringify(q)).not.toContain('audioKey');
  });

  it('kalit yoki manzil bo`lmasa audio null', () => {
    const r = shakllantir(
      [
        unit({
          battleQuestions: [
            savol({ sourceId: 'jang-a1-u02-001' }),
            savol({ sourceId: 'jang-a1-u02-002', audioKey: 'k' }),
          ] as any,
        }),
      ],
      () => null,
    );
    expect(r[0].questions.map((q) => q.audio)).toEqual([null, null]);
  });
});
