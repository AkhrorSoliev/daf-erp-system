import { buildMonthChargesLines } from './month-charges-lines.util';
import { formatSum } from './format.util';

const october = {
  month: '2026-10',
  charged: 159_300_000,
  paid: 122_310_000,
  unpaid: 36_990_000,
  paidPct: 76.8,
  students: 219,
  unpaidStudents: 98,
};

describe('buildMonthChargesLines', () => {
  it("prints hisoblandi, to'landi with its share, and qoldi", () => {
    expect(buildMonthChargesLines(october)).toEqual([
      `• Bu oy hisoblandi: <b>${formatSum(159_300_000)}</b>`,
      `• To'landi: <b>${formatSum(122_310_000)}</b> (<b>76.8%</b>)`,
      `• Qoldi: <b>${formatSum(36_990_000)}</b>`,
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
      unpaid: 159_300_000,
      paidPct: 0,
    });

    expect(lines[1]).toBe(`• To'landi: <b>${formatSum(0)}</b> (<b>0%</b>)`);
  });
});
