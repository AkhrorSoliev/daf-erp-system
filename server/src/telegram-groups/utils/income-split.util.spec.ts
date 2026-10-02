import { buildIncomeSplitLines, sharesOf100 } from './income-split.util';

/** `formatSum` groups digits with non-breaking spaces; read them as a human does. */
const NBSP = String.fromCharCode(160);
const plain = (lines: string[]) => lines.map((l) => l.split(NBSP).join(' '));

describe('buildIncomeSplitLines', () => {
  it('splits the income into this-month vs old-debt, oldest months listed too', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 42_500_000,
        currentMonth: 31_200_000,
        advance: 0,
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

  it('prints an old-debt total the month rows below it add up to', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 10_000_000,
        currentMonth: 4_000_000,
        advance: 0,
        lateTotal: 6_000_000,
        late: [
          { label: 'Iyul 2026', amount: 4_500_000 },
          { label: 'Iyun 2026', amount: 1_500_000 },
        ],
      }),
    );
    const sum = lines
      .slice(2)
      .map((l) =>
        Number(l.match(/<b>([\d ]+) so'm<\/b>/)![1].replace(/ /g, '')),
      )
      .reduce((a, b) => a + b, 0);

    expect(lines[1]).toContain("6 000 000 so'm");
    expect(sum).toBe(6_000_000);
  });

  it('keeps the two percentages at exactly 100', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 3,
        currentMonth: 1,
        advance: 0,
        lateTotal: 2,
        late: [{ label: 'Iyul 2026', amount: 2 }],
      }),
    );
    expect(lines[0]).toContain('(33%)');
    expect(lines[1]).toContain('(67%)');
  });

  it('prints the advance between this month and old debt, the three shares summing to 100', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 42_500_000,
        currentMonth: 21_200_000,
        advance: 10_000_000,
        lateTotal: 11_300_000,
        late: [
          { label: 'Avgust 2026', amount: 7_900_000 },
          { label: 'Iyul 2026', amount: 3_400_000 },
        ],
      }),
    );

    expect(lines).toEqual([
      "   Shu oy uchun: <b>21 200 000 so'm</b> (50%)",
      "   Oldindan (keyingi oy uchun): <b>10 000 000 so'm</b> (23%)",
      "   Eski qarzlar uchun: <b>11 300 000 so'm</b> (27%)",
      "      Avgust 2026 — <b>7 900 000 so'm</b>",
      "      Iyul 2026 — <b>3 400 000 so'm</b>",
    ]);
  });

  it('leaves out a part that is 0', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 6_000_000,
        currentMonth: 0,
        advance: 5_000_000,
        lateTotal: 1_000_000,
        late: [{ label: 'Avgust 2026', amount: 1_000_000 }],
      }),
    );

    expect(lines).toEqual([
      "   Oldindan (keyingi oy uchun): <b>5 000 000 so'm</b> (83%)",
      "   Eski qarzlar uchun: <b>1 000 000 so'm</b> (17%)",
      "      Avgust 2026 — <b>1 000 000 so'm</b>",
    ]);
  });

  it('an advance with no old debt is two lines, not «Hammasi shu oy uchun»', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 5_000_000,
        currentMonth: 4_000_000,
        advance: 1_000_000,
        lateTotal: 0,
        late: [],
      }),
    );

    expect(lines).toEqual([
      "   Shu oy uchun: <b>4 000 000 so'm</b> (80%)",
      "   Oldindan (keyingi oy uchun): <b>1 000 000 so'm</b> (20%)",
    ]);
  });

  it('says so in one line when there is neither advance nor old debt', () => {
    const lines = buildIncomeSplitLines({
      total: 5_000_000,
      currentMonth: 5_000_000,
      advance: 0,
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
        advance: 0,
        lateTotal: 0,
        late: [],
      }),
    ).toEqual([]);
  });
});

describe('sharesOf100', () => {
  it('gives whole shares that always add up to 100', () => {
    expect(sharesOf100([1, 1, 1])).toEqual([34, 33, 33]);
    expect(sharesOf100([21_200_000, 10_000_000, 11_300_000])).toEqual([
      50, 23, 27,
    ]);
  });

  it('gives a part that is 0 a share of 0', () => {
    expect(sharesOf100([0, 5, 0])).toEqual([0, 100, 0]);
  });

  it('is all zeros when there is nothing to share', () => {
    expect(sharesOf100([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
