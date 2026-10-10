import { buildTaskLine } from './task-line.util';

describe('buildTaskLine — spec §4 screen 5', () => {
  it('no line while nothing is overdue', () => {
    expect(buildTaskLine({ open: 12, overdue: 0, leader: null })).toBeNull();
  });
  it('open, overdue and who is most behind', () => {
    expect(
      buildTaskLine({
        open: 12,
        overdue: 4,
        leader: { name: 'Aziz Rahimov', overdue: 3 },
      }),
    ).toBe(
      "📋 Topshiriqlar: ochiq <b>12</b>, muddati o'tgan <b>4</b>. Eng ko'p kechikkan: Aziz Rahimov — <b>3</b>",
    );
  });
  it('without a name when the person is gone; a name is HTML-escaped', () => {
    expect(buildTaskLine({ open: 2, overdue: 1, leader: null })).toBe(
      "📋 Topshiriqlar: ochiq <b>2</b>, muddati o'tgan <b>1</b>.",
    );
    expect(
      buildTaskLine({
        open: 2,
        overdue: 1,
        leader: { name: 'A <b>', overdue: 1 },
      }),
    ).toContain('A &lt;b&gt;');
  });
});
