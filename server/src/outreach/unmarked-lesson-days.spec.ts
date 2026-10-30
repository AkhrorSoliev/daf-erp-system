import { unmarkedLessonDays } from './unmarked-lesson-days';

const base = {
  coveredDates: ['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09'],
  frozenOutDates: [] as string[],
  heldDays: new Set(['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09']),
  markedDays: new Set(['2026-10-02']),
  from: '2026-10-01',
  to: '2026-10-09',
};

describe('unmarkedLessonDays', () => {
  it('belgisiz qolgan, o‘tgan dars kunlarini qaytaradi', () => {
    expect(unmarkedLessonDays(base)).toEqual(['2026-10-05', '2026-10-07']);
  });

  it('bugun va undan keyingi kunlarni sanamaydi (to — kiritilmagan)', () => {
    expect(unmarkedLessonDays({ ...base, to: '2026-10-07' })).toEqual([
      '2026-10-05',
    ]);
  });

  it('hisobdan qaytarilgan kunni sanamaydi', () => {
    expect(
      unmarkedLessonDays({ ...base, frozenOutDates: ['2026-10-05'] }),
    ).toEqual(['2026-10-07']);
  });

  it('guruhda hech kimga davomat olinmagan kunni sanamaydi', () => {
    expect(
      unmarkedLessonDays({
        ...base,
        heldDays: new Set(['2026-10-02', '2026-10-07']),
      }),
    ).toEqual(['2026-10-07']);
  });

  it('har qanday holatdagi davomat qatori bor kunni sanamaydi', () => {
    expect(
      unmarkedLessonDays({
        ...base,
        markedDays: new Set(['2026-10-02', '2026-10-05', '2026-10-07']),
      }),
    ).toEqual([]);
  });

  it('from dan oldingi kunni sanamaydi va ikki oy hisobi takrorlansa bir marta sanaydi', () => {
    expect(
      unmarkedLessonDays({
        ...base,
        coveredDates: ['2026-09-30', '2026-10-05', '2026-10-05'],
        heldDays: new Set(['2026-09-30', '2026-10-05']),
        markedDays: new Set(),
      }),
    ).toEqual(['2026-10-05']);
  });
});
