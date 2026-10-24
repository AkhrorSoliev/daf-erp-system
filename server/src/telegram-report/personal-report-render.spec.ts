import type { DailyReportData } from '../telegram-groups/telegram-group-daily-report.service';
import {
  renderPersonalReport,
  type ReportUnit,
} from './personal-report-render';
import { shortSum } from './personal-report-metrics';
import { tashkentClock } from './report-clock';

const nb = (s: string) => s.replace(/\u00a0/g, ' ');

function data(over: Partial<DailyReportData> = {}): DailyReportData {
  return {
    branchIds: [1],
    todayLabel: '16.10.2026',
    todayDate: new Date('2026-10-16T00:00:00Z'),
    monthKey: '2026-10',
    companyName: 'DaF',
    scopeLabel: null,
    todayIncome: 4_200_000,
    todayIncomeCount: 9,
    todayPaymentsByMethod: [],
    todaySpend: 300_000,
    todayNet: 3_900_000,
    todayNewStudents: 3,
    departedToday: 1,
    netMovement: 2,
    newLeadsToday: 5,
    convertedLeadsToday: 0,
    present: 90,
    late: 1,
    absent: 9,
    excused: 0,
    attendancePct: 91,
    attendanceDenom: 100,
    lessonsToday: 18,
    activeStudents: 420,
    debtSplit: {
      studying: {
        total: 27_700_000,
        count: 40,
        currentMonth: 20_000_000,
        currentMonthCount: 30,
        older: 7_700_000,
        olderCount: 10,
      },
      notStudying: {
        total: 3_000_000,
        count: 9,
        currentMonth: 0,
        byKind: {
          ungrouped: { total: 0, count: 0 },
          frozen: { total: 3_000_000, count: 9 },
          left: { total: 0, count: 0 },
        },
      },
    },
    yesterdaySnapshot: { totalDebt: 28_100_000, debtorCount: 41 },
    totalDebt: 27_700_000,
    debtorCount: 40,
    mtdIncome: 160_000_000,
    mtdExpense: 40_000_000,
    mtdAdvance: 0,
    mtdCashNet: 120_000_000,
    attribution: null,
    canonicalNet: 32_000_000,
    expectedValue: null,
    monthCharges: null,
    salary: null,
    taskLine: null,
    flags: ["• Qaytarilgan to'lov: <b>350 000 so'm</b> (1 ta)"],
    light: { emoji: '🟢', subtitle: 'Kun yakuni: yaxshi' },
    ...over,
  };
}

const farg: ReportUnit = { label: "Farg'ona", data: data({ branchIds: [1] }) };
const nam: ReportUnit = {
  label: 'Namangan',
  data: data({
    branchIds: [2],
    todayIncome: 800_000,
    attendancePct: 88,
    totalDebt: 1_200_000,
    debtSplit: {
      ...data().debtSplit,
      studying: { ...data().debtSplit.studying, total: 1_200_000 },
    },
    yesterdaySnapshot: null,
    flags: [],
  }),
};
const total = data({
  branchIds: null,
  todayIncome: 5_000_000,
  attendancePct: 90,
});
const base = { dateLabel: '16.10', asOf: '18:30' };

describe('shortSum', () => {
  it("mln with one decimal from 100 000, so'm below", () => {
    expect(shortSum(4_200_000)).toBe('4,2 mln');
    expect(shortSum(150_000)).toBe('0,2 mln');
    expect(nb(shortSum(85_000))).toBe("85 000 so'm");
    expect(shortSum(-2_000_000)).toBe('-2,0 mln');
  });
});

describe('tashkentClock', () => {
  it('reads the Tashkent wall clock', () => {
    expect(tashkentClock(new Date('2026-10-16T13:30:00Z'))).toEqual({
      date: '16.10',
      time: '18:30',
    });
  });
});

describe('renderPersonalReport', () => {
  it('BY_SECTION: one line per metric, branches inline, then jami', () => {
    const text = nb(
      renderPersonalReport({
        ...base,
        layout: 'BY_SECTION',
        sections: ['TODAY_MONEY'],
        units: [farg, nam],
        total,
      }),
    );
    expect(text).toContain('📊 <b>16.10 — 18:30 holati</b>');
    expect(text).toContain(
      "💰 Tushum: Farg'ona 4,2 mln · Namangan 0,8 mln · jami 5,0 mln",
    );
  });

  it('BY_SECTION with one unit has no branch names', () => {
    const text = nb(
      renderPersonalReport({
        ...base,
        layout: 'BY_SECTION',
        sections: ['LESSONS'],
        units: [farg],
        total: null,
      }),
    );
    expect(text).toContain('✅ Davomat: 91%');
    expect(text).not.toContain("Farg'ona");
  });

  it('prints the debt arrow only for a single-branch or company-wide unit', () => {
    const text = nb(
      renderPersonalReport({
        ...base,
        layout: 'BY_SECTION',
        sections: ['DEBT'],
        units: [farg],
        total: null,
      }),
    );
    expect(text).toContain('📌 Qarz: 27,7 mln (▼0,4 mln)');
    const subset = data({ branchIds: [1, 2] });
    const t2 = nb(
      renderPersonalReport({
        ...base,
        layout: 'TOTAL_ONLY',
        sections: ['DEBT'],
        units: [],
        total: subset,
      }),
    );
    expect(t2).toContain('📌 Qarz: 27,7 mln');
    expect(t2).not.toContain('▼');
  });

  it('TABLE: aligned <pre> block with a Jami column', () => {
    const text = nb(
      renderPersonalReport({
        ...base,
        layout: 'TABLE',
        sections: ['TODAY_MONEY', 'LESSONS'],
        units: [farg, nam],
        total,
      }),
    );
    expect(text).toContain('<pre>');
    expect(text).toMatch(/Farg'ona\s+Namangan\s+Jami/);
    expect(text).toMatch(/Tushum\s+4,2\s+0,8\s+5,0/);
    expect(text).toMatch(/Davomat\s+91%\s+88%\s+90%/);
    expect(text).toContain("<i>Pul — mln so'm</i>");
  });

  it('BY_BRANCH: a block per branch, flags under their own branch', () => {
    const text = nb(
      renderPersonalReport({
        ...base,
        layout: 'BY_BRANCH',
        sections: ['TODAY_MONEY', 'ALERTS'],
        units: [farg, nam],
        total,
      }),
    );
    expect(text).toContain("🏢 <b>Farg'ona</b>");
    expect(text).toContain('🏢 <b>Namangan</b>');
    expect(text).toContain('Σ <b>Jami</b>');
    expect(text.indexOf("Qaytarilgan to'lov")).toBeGreaterThan(
      text.indexOf("🏢 <b>Farg'ona</b>"),
    );
  });

  it('TOTAL_ONLY reads the total alone', () => {
    const text = nb(
      renderPersonalReport({
        ...base,
        layout: 'TOTAL_ONLY',
        sections: ['TODAY_MONEY'],
        units: [farg, nam],
        total,
      }),
    );
    expect(text).toContain('💰 Tushum: 5,0 mln');
    expect(text).not.toContain("Farg'ona");
  });

  it('hides a metric with no value and says so when nothing is left', () => {
    const empty = data({ lessonsToday: 0, attendanceDenom: 0 });
    const text = renderPersonalReport({
      ...base,
      layout: 'BY_SECTION',
      sections: ['LESSONS'],
      units: [{ label: 'X', data: empty }],
      total: null,
    });
    expect(text).toContain("Bugun ma'lumot yo'q");
  });

  it('escapes branch names', () => {
    const text = renderPersonalReport({
      ...base,
      layout: 'BY_BRANCH',
      sections: ['TODAY_MONEY'],
      units: [{ label: 'A&B', data: data() }, nam],
      total,
    });
    expect(text).toContain('A&amp;B');
  });
});
