import { buildIncomeSplitLines } from './income-split.util';

/** `formatSum` groups digits with non-breaking spaces; read them as a human does. */
const NBSP = String.fromCharCode(160);
const plain = (lines: string[]) => lines.map((l) => l.split(NBSP).join(' '));

describe('buildIncomeSplitLines', () => {
  it('splits the income into this-month vs old-debt, oldest months listed too', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 42_500_000,
        currentMonth: 31_200_000,
        lateTotal: 11_300_000,
        late: [
          { label: 'Avgust 2026', amount: 7_900_000 },
          { label: 'Iyul 2026', amount: 2_600_000 },
          { label: 'Iyun 2026', amount: 800_000 },
        ],
      }),
    );

    expect(lines).toEqual([
      "   Shu oy uchun: <b>31 200 000 so'm</b> (73%)",
      "   Eski qarzlar uchun: <b>11 300 000 so'm</b> (27%)",
      "      Avgust 2026 — <b>7 900 000 so'm</b>",
      "      Iyul 2026 — <b>2 600 000 so'm</b>",
      "      Iyun 2026 — <b>800 000 so'm</b>",
    ]);
  });

  it('keeps the two percentages at exactly 100', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 3,
        currentMonth: 1,
        lateTotal: 2,
        late: [{ label: 'Iyul 2026', amount: 2 }],
      }),
    );
    // 33% + 67%, not two independently-rounded shares that miss 100.
    expect(lines[0]).toContain('(33%)');
    expect(lines[1]).toContain('(67%)');
  });

  it('says so in one line when no old debt was settled', () => {
    const lines = buildIncomeSplitLines({
      total: 5_000_000,
      currentMonth: 5_000_000,
      lateTotal: 0,
      late: [],
    });
    expect(lines).toEqual([
      "   Hammasi shu oy uchun — eski qarz uchun to'lov yo'q",
    ]);
  });

  it('prints nothing when there is no income to split', () => {
    expect(
      buildIncomeSplitLines({
        total: 0,
        currentMonth: 0,
        lateTotal: 0,
        late: [],
      }),
    ).toEqual([]);
  });
});
