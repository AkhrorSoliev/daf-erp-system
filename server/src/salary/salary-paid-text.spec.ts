import { salaryPaidText } from './salary-paid-text';

const base = { firstName: 'Madina', month: '2026-09', paidDay: '2026-10-05' };

describe('salaryPaidText', () => {
  it('with advances, cash and card', () => {
    expect(
      salaryPaidText({
        ...base,
        gross: 9_840_000,
        advances: 2_000_000,
        net: 7_840_000,
        cash: 5_000_000,
        card: 2_840_000,
      }),
    ).toBe(
      [
        '<b>✅ Sentabr oyligingiz berildi</b>',
        '',
        'Hurmatli Madina!',
        '',
        "Sentabr 2026 uchun hisoblandi: <b>9 840 000 so'm</b>",
        "Avans ushlandi: <b>2 000 000 so'm</b>",
        "Berildi: <b>7 840 000 so'm</b> — naqd 5 000 000, kartaga 2 840 000",
        'Sana: <b>05.10.2026</b>',
        '',
        "Batafsil — tizimdagi «Ish haqi» bo'limida.",
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('without advances, cash only', () => {
    expect(
      salaryPaidText({
        ...base,
        firstName: 'Sardor',
        gross: 3_000_000,
        advances: 0,
        net: 3_000_000,
        cash: 3_000_000,
        card: 0,
      }),
    ).toBe(
      [
        '<b>✅ Sentabr oyligingiz berildi</b>',
        '',
        'Hurmatli Sardor!',
        '',
        "Sentabr 2026 uchun: <b>3 000 000 so'm</b> — naqd",
        'Sana: <b>05.10.2026</b>',
        '',
        "Batafsil — tizimdagi «Ish haqi» bo'limida.",
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('card only reads «— kartaga»; no movement reads nothing', () => {
    expect(
      salaryPaidText({
        ...base,
        gross: 1_000_000,
        advances: 0,
        net: 1_000_000,
        cash: 0,
        card: 1_000_000,
      }),
    ).toContain("Sentabr 2026 uchun: <b>1 000 000 so'm</b> — kartaga\n");
    expect(
      salaryPaidText({
        ...base,
        gross: 500_000,
        advances: 500_000,
        net: 0,
        cash: 0,
        card: 0,
      }),
    ).toContain("Berildi: <b>0 so'm</b>\n");
  });

  it('escapes the name', () => {
    expect(
      salaryPaidText({
        ...base,
        firstName: '<A&B>',
        gross: 1,
        advances: 0,
        net: 1,
        cash: 1,
        card: 0,
      }),
    ).toContain('Hurmatli &lt;A&amp;B&gt;!');
  });
});
