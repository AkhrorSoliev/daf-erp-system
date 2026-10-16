import {
  bestAndWorst,
  byTeacher,
  scoreDistribution,
  sortByAverage,
  totalsOf,
  type RatingRow,
} from './rating-math';

const row = (
  score: number | null,
  teacherIds = [1],
  delivered = true,
): RatingRow => ({
  score,
  delivered,
  teacherIds,
});

describe('totalsOf', () => {
  it('averages only rated rows, one decimal', () => {
    const t = totalsOf([
      row(5),
      row(4),
      row(2),
      row(null),
      row(null, [1], false),
    ]);
    expect(t).toEqual({
      average: 3.7,
      rated: 3,
      delivered: 4,
      responseRate: 75,
      low: 1,
    });
  });

  it('answers null when there is nothing to average', () => {
    expect(totalsOf([])).toEqual({
      average: null,
      rated: 0,
      delivered: 0,
      responseRate: null,
      low: 0,
    });
  });
});

describe('byTeacher', () => {
  it('counts a two-teacher lesson for both', () => {
    const m = byTeacher([row(5, [1, 2]), row(3, [2])]);
    expect(m.get(1)).toMatchObject({ average: 5, rated: 1 });
    expect(m.get(2)).toMatchObject({ average: 4, rated: 2, low: 1 });
  });
});

describe('sortByAverage', () => {
  it('puts the lowest first and the unrated last', () => {
    const sorted = sortByAverage([
      { id: 'a', average: 4.8 },
      { id: 'b', average: null },
      { id: 'c', average: 3.1 },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('scoreDistribution', () => {
  it('counts 1..5 by index and ignores unrated rows', () => {
    expect(
      scoreDistribution([
        { score: 5 },
        { score: 5 },
        { score: 1 },
        { score: 3 },
        { score: null },
      ]),
    ).toEqual([1, 0, 1, 0, 2]);
  });

  it('answers zeros for no rows', () => {
    expect(scoreDistribution([])).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('bestAndWorst', () => {
  const t = (id: string, average: number | null) => ({ id, average });

  it('answers nulls for nobody', () => {
    expect(bestAndWorst([])).toEqual({ best: null, worst: null });
  });

  it('never lists a single teacher as both', () => {
    expect(bestAndWorst([t('a', 4.2)])).toEqual({
      best: t('a', 4.2),
      worst: null,
    });
  });

  it('picks the highest and the lowest average', () => {
    const r = bestAndWorst([t('a', 4.2), t('b', 3.1), t('c', 4.9)]);
    expect(r.best?.id).toBe('c');
    expect(r.worst?.id).toBe('b');
  });

  it('keeps the first of equal averages', () => {
    const r = bestAndWorst([t('a', 4), t('b', 4), t('c', 3), t('d', 3)]);
    expect(r.best?.id).toBe('a');
    expect(r.worst?.id).toBe('c');
  });

  it('has no worst when every average is equal', () => {
    const r = bestAndWorst([t('a', 4), t('b', 4)]);
    expect(r.best?.id).toBe('a');
    expect(r.worst).toBeNull();
  });

  it('ignores unrated teachers', () => {
    expect(bestAndWorst([t('a', null), t('b', 4)])).toEqual({
      best: t('b', 4),
      worst: null,
    });
    const r = bestAndWorst([t('a', null), t('b', 4), t('c', 2)]);
    expect(r.best?.id).toBe('b');
    expect(r.worst?.id).toBe('c');
  });

  it('does not mutate the input', () => {
    const list = [t('a', 4.2), t('b', 3.1), t('c', 4.9)];
    const copy = list.map((x) => ({ ...x }));
    bestAndWorst(list);
    expect(list).toEqual(copy);
  });
});
