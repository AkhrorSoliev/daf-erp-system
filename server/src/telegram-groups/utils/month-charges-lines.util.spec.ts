import { buildMonthChargesLines } from './month-charges-lines.util';
import { formatSum } from './format.util';

const october = {
  month: '2026-10',
  charged: 177_000_000,
  paid: 135_900_000,
  unpaid: 41_100_000,
  paidPct: 76.8,
  students: 237,
};

describe('buildMonthChargesLines', () => {
  it("prints hisoblandi, to'landi with its share, and qoldi", () => {
    expect(buildMonthChargesLines(october)).toEqual([
      `• Bu oy hisoblandi: <b>${formatSum(177_000_000)}</b>`,
      `• To'landi: <b>${formatSum(135_900_000)}</b> (<b>76.8%</b>)`,
      `• Qoldi: <b>${formatSum(41_100_000)}</b>`,
    ]);
  });

  it("prints no share when nothing was charged, and never the word 'null'", () => {
    const lines = buildMonthChargesLines({
      ...october,
      charged: 0,
      paid: 0,
      unpaid: 0,
      paidPct: null,
      students: 0,
    });

    expect(lines[1]).toBe(`• To'landi: <b>${formatSum(0)}</b>`);
    expect(lines.join('\n')).not.toContain('null');
  });

  it('prints a 0% share when something was charged and nothing is paid', () => {
    // 0 is a real reading, not "no share": a truthiness check would drop it.
    const lines = buildMonthChargesLines({
      ...october,
      paid: 0,
      unpaid: 177_000_000,
      paidPct: 0,
    });

    expect(lines[1]).toBe(`• To'landi: <b>${formatSum(0)}</b> (<b>0%</b>)`);
  });
});
