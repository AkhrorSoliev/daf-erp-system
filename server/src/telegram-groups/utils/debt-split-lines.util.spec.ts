import type { DebtSplit } from '../../reports/debt-split';
import { buildDebtSplitLines } from './debt-split-lines.util';
import { formatNumber, formatSum } from './format.util';

// 12 studying debtors owe 3 600 000 (1 500 000 of it this month's charges), 7
// others owe 900 000. `formatSum` / `formatNumber`, not literals: their
// thousands separator is a non-breaking space.
const split: DebtSplit = {
  studying: {
    total: 3_600_000,
    count: 12,
    currentMonth: 1_500_000,
    currentMonthCount: 0,
    older: 2_100_000,
    olderCount: 5,
  },
  notStudying: {
    total: 900_000,
    count: 7,
    currentMonth: 0,
    byKind: {
      ungrouped: { total: 300_000, count: 2 },
      frozen: { total: 400_000, count: 3 },
      left: { total: 200_000, count: 2 },
    },
  },
};

const studyingLine = `• O'qiyotganlar qarzi: <b>${formatNumber(12)}</b> ta — <b>${formatSum(3_600_000)}</b>`;
const splitLine = `   🟡 shu oy ${formatSum(1_500_000)} · 🔴 eski qarz ${formatSum(2_100_000)}`;
const notStudyingLine = `• O'qimayotganlar qarzi: <b>${formatNumber(7)}</b> ta — <b>${formatSum(900_000)}</b>`;

describe('buildDebtSplitLines', () => {
  it('prints the three lines with their verbatim labels, in the 21:00 shape', () => {
    expect(buildDebtSplitLines(split)).toEqual([
      studyingLine,
      splitLine,
      notStudyingLine,
    ]);
  });

  it('puts the suffix — the 21:00 ▲/▼ — on the first line only', () => {
    const suffix = '  (bugun ▲ 500 000 · +2)';

    expect(buildDebtSplitLines(split, { studyingSuffix: suffix })).toEqual([
      studyingLine + suffix,
      splitLine,
      notStudyingLine,
    ]);
  });

  it('leaves the shu oy / eski qarz line out when nobody studying owes', () => {
    const lines = buildDebtSplitLines({
      studying: {
        total: 0,
        count: 0,
        currentMonth: 0,
        currentMonthCount: 0,
        older: 0,
        olderCount: 0,
      },
      notStudying: split.notStudying,
    });

    expect(lines).toEqual([
      `• O'qiyotganlar qarzi: <b>${formatNumber(0)}</b> ta — <b>${formatSum(0)}</b>`,
      notStudyingLine,
    ]);
  });

  it('prints the same lines without bullets for a surface that has none', () => {
    expect(buildDebtSplitLines(split, { bullet: '' })).toEqual([
      studyingLine.slice('• '.length),
      splitLine,
      notStudyingLine.slice('• '.length),
    ]);
  });

  it('never adds the two numbers', () => {
    const text = buildDebtSplitLines(split).join('\n');

    expect(text).not.toContain(formatNumber(3_600_000 + 900_000));
    expect(text).not.toContain('Jami');
  });
});
