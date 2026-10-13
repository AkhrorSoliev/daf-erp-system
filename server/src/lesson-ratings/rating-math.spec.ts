import {
  byTeacher,
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
