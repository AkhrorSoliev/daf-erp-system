import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryMonthlyService } from '../salary/salary-monthly.service';
import { ReportsService } from '../reports/reports.service';
import type { DebtSplit } from '../reports/debt-split';
import { TelegramGroupDailyReportService } from './telegram-group-daily-report.service';
import { formatNumber, formatSum } from './utils/format.util';

/**
 * State the fake Prisma reads from. Each field maps to one metric so a test
 * can tweak a single number without re-stubbing the whole client. Mocks
 * differentiate the two-call models (student.count, payment.aggregate,
 * expense.aggregate, attendance.groupBy, lead.count, enrollment.findMany) by
 * inspecting `where`/`by`, so tests are order-independent.
 */
interface State {
  companyName: string;
  activeStudents: number;
  todayNewStudents: number;
  droppedStudentIds: number[];
  newLeads: number;
  convertedLeads: number;
  todayPayments: { amount: number; count: number };
  todayMethods: Array<{ method: string; amount: number }>;
  todayExpenses: number;
  attendance: Array<{ status: string; _count: number }>;
  lessonGroups: number;
  mtdIncome: number;
  mtdExpenses: number;
  mtdAdvances: number;
  flags: Array<{ type: string; amount: number; count: number }>;
  yesterdaySnapshot: {
    totalDebt: number;
    debtorCount: number;
  } | null;
  forecastEnrollments: Array<any>;
  ceo: { id: number } | null;
  salaryTotals: {
    fullDeserved: number | null;
    covered: number;
    centerFunded: number;
  } | null;
  /** «Dars bo'ldimi?» questions unanswered for more than a day. */
  staleUnmarked?: number;
  /** Bot sign-up join requests unanswered for more than a day. */
  staleJoinRequests?: number;
}

function defaultState(): State {
  return {
    companyName: 'DaF Sprachzentrum',
    activeStudents: 1240,
    todayNewStudents: 3,
    droppedStudentIds: [10001],
    newLeads: 5,
    convertedLeads: 1,
    todayPayments: { amount: 8_400_000, count: 14 },
    todayMethods: [
      { method: 'CASH', amount: 3_200_000 },
      { method: 'PAYME', amount: 3_100_000 },
      { method: 'CLICK', amount: 1_300_000 },
      { method: 'TRANSFER', amount: 800_000 },
    ],
    todayExpenses: 1_850_000,
    attendance: [
      { status: 'PRESENT', _count: 198 },
      { status: 'LATE', _count: 6 },
      { status: 'ABSENT', _count: 18 },
      { status: 'EXCUSED', _count: 4 },
    ],
    lessonGroups: 18,
    mtdIncome: 280_000_000,
    mtdExpenses: 95_000_000,
    mtdAdvances: 0,
    flags: [
      { type: 'REFUND', amount: -350_000, count: 1 },
      { type: 'DEBT_WRITE_OFF', amount: 900_000, count: 1 },
    ],
    yesterdaySnapshot: { totalDebt: 18_990_000, debtorCount: 46 },
    forecastEnrollments: [],
    ceo: { id: 1 },
    salaryTotals: {
      fullDeserved: 40_000_000,
      covered: 32_000_000,
      centerFunded: 8_000_000,
    },
  };
}

function makePrisma(state: State) {
  return {
    company: { findUnique: jest.fn(async () => ({ name: state.companyName })) },
    student: {
      // No `aggregate`/`findMany`: the debt is `ReportsService.getDebtSplit`'s
      // (ADR-0059), so a report that reads it from `Student` itself throws here.
      count: jest.fn(async ({ where }: any) =>
        where.createdAt ? state.todayNewStudents : state.activeStudents,
      ),
    },
    enrollment: {
      findMany: jest.fn(async ({ where }: any) =>
        where.status === 'DROPPED'
          ? state.droppedStudentIds.map((studentId) => ({ studentId }))
          : state.forecastEnrollments,
      ),
    },
    lead: {
      count: jest.fn(async ({ where }: any) =>
        where.statusEnum ? state.convertedLeads : state.newLeads,
      ),
    },
    payment: {
      aggregate: jest.fn(async ({ where }: any) =>
        where.createdAt?.lt
          ? {
              _sum: { amount: state.todayPayments.amount },
              _count: state.todayPayments.count,
            }
          : { _sum: { amount: state.mtdIncome } },
      ),
      groupBy: jest.fn(async () =>
        state.todayMethods.map((m) => ({
          method: m.method,
          _sum: { amount: m.amount },
        })),
      ),
    },
    expense: {
      aggregate: jest.fn(async ({ where }: any) => {
        // Today's spend uses an exact DATE (`date` is a Date instance); the two
        // MTD queries use a {gte,lte} window and are told apart by category:
        // the advance query pins `category: 'TEACHER_ADVANCE'`, the operational
        // query excludes it via `{ not: 'TEACHER_ADVANCE' }`.
        if (where.date instanceof Date) {
          return { _sum: { amount: state.todayExpenses } };
        }
        if (where.category === 'TEACHER_ADVANCE') {
          return { _sum: { amount: state.mtdAdvances } };
        }
        return { _sum: { amount: state.mtdExpenses } };
      }),
    },
    attendance: {
      groupBy: jest.fn(async ({ by }: any) =>
        by[0] === 'status'
          ? state.attendance
          : Array.from({ length: state.lessonGroups }, (_, i) => ({
              groupId: `g${i}`,
            })),
      ),
    },
    transaction: {
      groupBy: jest.fn(async () =>
        state.flags.map((f) => ({
          type: f.type,
          _sum: { amount: f.amount },
          _count: f.count,
        })),
      ),
    },
    dailyFinancialSnapshot: {
      findFirst: jest.fn(async () => state.yesterdaySnapshot),
      upsert: jest.fn(async () => ({})),
    },
    user: { findFirst: jest.fn(async () => state.ceo) },
    unmarkedLesson: { count: jest.fn(async () => state.staleUnmarked ?? 0) },
    studentJoinRequest: {
      count: jest.fn(async () => state.staleJoinRequests ?? 0),
    },
    // Only a branch-scoped run names its scope in the header.
    branch: {
      findMany: jest.fn(async () => [{ id: 2, name: 'Namangan filiali' }]),
    },
  };
}

function makeSalary(state: State) {
  return {
    getMonthly: jest.fn(async () => ({
      totals: state.salaryTotals ?? {
        fullDeserved: 0,
        covered: 0,
        centerFunded: 0,
      },
    })),
  };
}

/**
 * The debt as `ReportsService.getDebtSplit` returns it (ADR-0059): two numbers
 * that are never added. The studying one is 20.07M / 48, so against the default
 * yesterday's snapshot (18.99M / 46) it reads ▲ 1 080 000 · +2.
 */
const DEBT_SPLIT: DebtSplit = {
  studying: {
    total: 20_070_000,
    count: 48,
    currentMonth: 18_000_000,
    currentMonthCount: 0,
    older: 2_070_000,
    olderCount: 9,
  },
  notStudying: {
    total: 8_190_000,
    count: 29,
    currentMonth: 0,
    byKind: {
      ungrouped: { total: 2_790_000, count: 10 },
      frozen: { total: 3_600_000, count: 11 },
      left: { total: 1_800_000, count: 8 },
    },
  },
};

/** `DEBT_SPLIT` with some figures changed. */
function splitOf(
  studying: Partial<DebtSplit['studying']> = {},
  notStudying: Partial<DebtSplit['notStudying']> = {},
): DebtSplit {
  return {
    studying: { ...DEBT_SPLIT.studying, ...studying },
    notStudying: { ...DEBT_SPLIT.notStudying, ...notStudying },
  };
}

/** A `ReportsService` that answers the split a test wants and little else. */
function reportsWithDebt(split: DebtSplit) {
  return {
    getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 12_345_678 }),
    getDebtSplit: jest.fn().mockResolvedValue(split),
  };
}

async function buildService(prisma: any, salary: any, reports?: any) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TelegramGroupDailyReportService,
      { provide: PrismaService, useValue: prisma },
      { provide: SalaryMonthlyService, useValue: salary },
      {
        // The «Sof foyda» line now reads the canonical figure. Default mock
        // returns a fixed number; pass your own to assert the fallback.
        // `getDebtSplit` answers `DEBT_SPLIT` unless the test passes its own.
        provide: ReportsService,
        useValue: {
          getDebtSplit: jest.fn().mockResolvedValue(DEBT_SPLIT),
          ...(reports ?? {
            getMonthlyNetProfit: jest
              .fn()
              .mockResolvedValue({ netProfit: 12_345_678 }),
          }),
        },
      },
    ],
  }).compile();
  return module.get(TelegramGroupDailyReportService);
}

describe('TelegramGroupDailyReportService', () => {
  beforeEach(() => {
    // Pin now to a non-Sunday weekday for deterministic weekday/month labels.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-08T16:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('renders every section with the expected figures (happy path)', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001, null);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');

    // Header + company name (escaped) + weekday.
    expect(message).toContain('DaF Sprachzentrum');
    // 💰 Bugungi moliya
    expect(message).toContain("• Kirim: <b>14 ta · 8 400 000 so'm</b>");
    expect(message).toContain(
      "Naqd 3 200 000 · Payme 3 100 000 · Click 1 300 000 · O'tkazma 800 000",
    );
    expect(message).toContain("• Chiqim: <b>1 850 000 so'm</b>");
    expect(message).toContain("• Sof (bugun): <b>+6 550 000 so'm</b>");
    // 👥 Movement: 3 new − 1 departed = +2 net; 5 leads (1 converted).
    expect(message).toContain(
      "Yangi o'quvchilar: <b>3</b> · Ketgan: <b>1</b> — sof <b>+2</b>",
    );
    expect(message).toContain(
      "Yangi lidlar: <b>5</b> (1 tasi o'quvchiga aylandi)",
    );
    // 🎓 Operations: 18 groups, attendance 204/(204+18)=92%.
    expect(message).toContain("Dars o'tilgan guruhlar: <b>18</b>");
    expect(message).toContain(
      '<b>198</b> keldi · <b>6</b> kech · <b>18</b> kelmadi · <b>4</b> uzrli — <b>92%</b>',
    );
    // 📌 Current state + the debt as two numbers (ADR-0059). The first one's
    // delta: 20.07M vs yesterday 18.99M = ▲ 1.08M, +2 debtors.
    expect(message).toContain("Faol o'quvchilar: <b>1 240</b>");
    expect(message).toContain(
      "• O'qiyotganlar qarzi: <b>48</b> ta — <b>20 070 000 so'm</b>  (bugun ▲ 1 080 000 · +2)",
    );
    expect(message).toContain(
      "   🟡 shu oy 18 000 000 so'm · 🔴 eski qarz 2 070 000 so'm",
    );
    expect(message).toContain(
      "• O'qimayotganlar qarzi: <b>29</b> ta — <b>8 190 000 so'm</b>",
    );
    // 📅 MTD: 280M − 95M = +185M net.
    expect(message).toContain("Tushum (haqiqiy): <b>280 000 000 so'm</b>");
    // Headline is the canonical figure from the mock; the cash reading moved to
    // its own honestly-named line.
    expect(message).toContain("• Sof foyda: <b>+12 345 678 so'm</b>");
    expect(message).toContain(
      "• Kassa harakati (oyliksiz): <b>+185 000 000 so'm</b>",
    );
    // 💵 Salary top-up block.
    expect(message).toContain("To'liq ishlangan: <b>40 000 000 so'm</b>");
    expect(message).toContain("O'quvchilar to'lagan: <b>32 000 000 so'm</b>");
    expect(message).toContain("🏛 Markaz qo'shimchasi: <b>8 000 000 so'm</b>");
    // 🚩 Diqqat flags.
    expect(message).toContain("Qaytarilgan to'lov: <b>350 000 so'm</b> (1 ta)");
    expect(message).toContain("Qarz kechirildi: <b>900 000 so'm</b> (1 ta");
  });

  it('prints the shared collection ratio and the month-end expectation', async () => {
    const state = defaultState();
    const getIncomeMonthAttribution = jest.fn().mockResolvedValue({
      total: 142_000_000,
      currentMonth: 100_000_000,
      advance: 42_000_000,
      lateTotal: 0,
      late: [],
      lessonsValue: 173_783_991,
      collectionPct: 82,
    });
    const getMonthlyExpectation = jest
      .fn()
      .mockResolvedValue({ expectedValue: 155_765_411 });
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution,
      getMonthlyExpectation,
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/\u00A0/g, ' ');

    expect(message).toContain(
      "\u2022 Shu oyning darslari: <b>173 783 991 so'm</b>",
    );
    expect(message).toContain(
      "\u2022 Shundan yig'ildi: <b>142 000 000 so'm</b> (<b>82%</b>)",
    );
    expect(message).toContain(
      "\u2022 Oy oxiriga kutilyapti: <b>155 765 411 so'm</b>",
    );
    // The month-plan reading: 142 000 000 of the whole 155 765 411, NOT of the
    // 173 783 991 lessons already held (which is the 82% line above). Getting
    // these two denominators the wrong way round is the whole point of the
    // line, so assert the number, not just that a percent appears.
    expect(message).toContain("\u2022 Oy rejasidan yig'ildi: <b>91%</b>");
    // The four-week forecast is gone from the message entirely \u2014 not renamed,
    // not demoted. Two near-identical numbers is the disease being cured.
    expect(message.toLowerCase()).not.toContain('prognoz');
    // Both figures are company-wide and cover the report's own month.
    expect(getIncomeMonthAttribution).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({ branchIds: null, startDate: '2026-07-01' }),
    );
    expect(getMonthlyExpectation).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({ branchIds: null, month: '2026-07' }),
    );
  });

  it('drops each block rather than inventing a figure when it fails', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest.fn().mockRejectedValue(new Error('boom')),
      getMonthlyExpectation: jest.fn().mockRejectedValue(new Error('boom')),
    });

    const { message } = await service.build(1001, null);

    expect(message).not.toContain("Shundan yig'ildi");
    expect(message).not.toContain('Oy oxiriga kutilyapti');
    // The month-plan percentage needs BOTH figures — it must vanish with them
    // rather than divide by a missing denominator.
    expect(message).not.toContain("Oy rejasidan yig'ildi");
    expect(message).toContain('Tushum (haqiqiy)'); // rest of the report survives
  });

  it('keeps the month-end figure but drops the plan % when collection alone fails', async () => {
    // Asymmetric failure: the percentage needs a numerator the other service
    // owns. Printing the expectation without it is fine; printing a percentage
    // computed from a missing numerator would be a fabricated figure.
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest.fn().mockRejectedValue(new Error('boom')),
      getMonthlyExpectation: jest
        .fn()
        .mockResolvedValue({ expectedValue: 155_765_411 }),
    });

    const { message } = await service.build(1001, null);

    expect(message).toContain('Oy oxiriga kutilyapti');
    expect(message).not.toContain("Oy rejasidan yig'ildi");
  });

  /**
   * The shape the real `getIncomeMonthAttribution` returns. Kept whole so a
   * test never asserts against a half-mock the service could not receive in
   * production.
   */
  function fullAttribution(overrides: Record<string, unknown> = {}) {
    return {
      total: 42_500_000,
      currentMonth: 31_200_000,
      advance: 0,
      lateTotal: 11_300_000,
      late: [
        { monthKey: '2026-06', label: 'Iyun 2026', amount: 7_900_000 },
        { monthKey: '2026-05', label: 'May 2026', amount: 3_400_000 },
      ],
      lessonsValue: 40_000_000,
      collectionPct: 78,
      ...overrides,
    };
  }

  it('breaks the month income into this-month vs each older month', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest.fn().mockResolvedValue(fullAttribution()),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/\u00A0/g, ' ');

    // The headline comes from the SAME object as the split, so the figures
    // printed here always add up in front of the reader.
    expect(message).toContain("• Tushum (haqiqiy): <b>42 500 000 so'm</b>");
    expect(message).toContain("   Shu oy uchun: <b>31 200 000 so'm</b> (73%)");
    expect(message).toContain(
      "   Eski qarzlar uchun: <b>11 300 000 so'm</b> (27%)",
    );
    // EVERY older month is listed (CEO decision), newest first.
    expect(message).toContain("      Iyun 2026 — <b>7 900 000 so'm</b>");
    expect(message).toContain("      May 2026 — <b>3 400 000 so'm</b>");
    expect(message.indexOf('Iyun 2026')).toBeLessThan(
      message.indexOf('May 2026'),
    );
  });

  it('adds the split up to the printed income figure', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest
        .fn()
        .mockResolvedValue(
          fullAttribution({ currentMonth: 21_200_000, advance: 10_000_000 }),
        ),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/\u00A0/g, ' ');
    const money = (label: string) =>
      Number(
        message
          .match(new RegExp(`${label}: <b>([\\d ]+) so'm</b>`))![1]
          .replace(/ /g, ''),
      );
    // Only the indented month rows — anchored, because the debt line elsewhere
    // in the report is also "… — <b>N so'm</b>" and would be swept in.
    const monthSum = [
      ...message.matchAll(/^ {6}.+ — <b>([\d ]+) so'm<\/b>$/gm),
    ].reduce((sum, m) => sum + Number(m[1].replace(/ /g, '')), 0);

    expect(
      money('Shu oy uchun') +
        money('Oldindan \\(keyingi oy uchun\\)') +
        monthSum,
    ).toBe(money('Tushum \\(haqiqiy\\)'));
  });

  it('prints the advance between this month and old debt, the three shares summing to 100', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest
        .fn()
        .mockResolvedValue(
          fullAttribution({ currentMonth: 21_200_000, advance: 10_000_000 }),
        ),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/\u00A0/g, ' ');

    expect(message).toContain(
      [
        "• Tushum (haqiqiy): <b>42 500 000 so'm</b>",
        "   Shu oy uchun: <b>21 200 000 so'm</b> (50%)",
        "   Oldindan (keyingi oy uchun): <b>10 000 000 so'm</b> (23%)",
        "   Eski qarzlar uchun: <b>11 300 000 so'm</b> (27%)",
      ].join('\n'),
    );
  });

  it('says there is no old debt in one line when none was settled', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest
        .fn()
        .mockResolvedValue(
          fullAttribution({ total: 31_200_000, lateTotal: 0, late: [] }),
        ),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message } = await service.build(1001, null);

    expect(message).toContain(
      "Hammasi shu oy uchun — eski qarz uchun to'lov yo'q",
    );
    expect(message).not.toContain('Eski qarzlar uchun');
  });

  it('still splits the cash in a month with no lessons held yet', async () => {
    // `collectionPct` is null exactly when `lessonsValue` is 0 (the 1st of the
    // month, a holiday week). The composition of the cash is still a real
    // answer, so it must survive the ratio's absence — the helper this replaced
    // returned null here and would have dropped the split with it.
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest
        .fn()
        .mockResolvedValue(
          fullAttribution({ lessonsValue: 0, collectionPct: null }),
        ),
      getMonthlyExpectation: jest
        .fn()
        .mockResolvedValue({ expectedValue: 62_400_000 }),
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/\u00A0/g, ' ');

    expect(message).toContain("   Shu oy uchun: <b>31 200 000 so'm</b> (73%)");
    // No lessons held → no ratio, and no "null%" anywhere near it.
    expect(message).not.toContain("Shundan yig'ildi");
    expect(message).not.toContain('null');
    // The month-plan reading divides by the month EXPECTATION, not by the
    // lessons held, so it is still answerable: 31 200 000 / 62 400 000.
    expect(message).toContain("• Oy rejasidan yig'ildi: <b>50%</b>");
  });

  it('keeps the income line on its old basis when attribution fails', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest.fn().mockRejectedValue(new Error('boom')),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/\u00A0/g, ' ');

    // state.mtdIncome — the pre-existing aggregate, untouched by this feature.
    expect(message).toContain("• Tushum (haqiqiy): <b>280 000 000 so'm</b>");
    expect(message).not.toContain('Shu oy uchun');
    expect(message).not.toContain('Eski qarzlar uchun');
  });

  it('queries Attendance.date as a single DATE, never a {gte,lt} window (regression)', async () => {
    const state = defaultState();
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));

    await service.build(1001, null);

    for (const call of prisma.attendance.groupBy.mock.calls) {
      const where = call[0].where;
      expect(where.date).toBeInstanceOf(Date);
      expect(where.date).not.toEqual(
        expect.objectContaining({
          gte: expect.anything(),
          lt: expect.anything(),
        }),
      );
      expect(where.date.getUTCHours()).toBe(0);
    }
  });

  it('splits teacher advances into their own MTD line and nets them out of the cash reading', async () => {
    const state = defaultState();
    state.mtdIncome = 144_431_991;
    state.mtdExpenses = 20_017_000;
    state.mtdAdvances = 12_150_000;
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/\u00a0/g, ' ');

    // Xarajat = pure operational spend (advance-free); Avans is a standalone
    // line, not a "shundan" sub-line of Xarajat.
    expect(message).toContain("• Xarajat: <b>20 017 000 so'm</b>");
    expect(message).toContain("• Avans (ustozlarga): <b>12 150 000 so'm</b>");
    // Cash reading = Tushum − Xarajat − Avans = 144 431 991 − 20 017 000 − 12 150 000.
    // (The «Sof foyda» headline is the canonical figure, not this.)
    expect(message).toContain(
      "• Kassa harakati (oyliksiz): <b>+112 264 991 so'm</b>",
    );
  });

  it('omits the Avans line when there are no MTD advances (self-suppressing)', async () => {
    const state = defaultState();
    state.mtdAdvances = 0;
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/\u00a0/g, ' ');
    expect(message).not.toContain('Avans (ustozlarga)');
    // Cash reading unchanged: 280M − 95M − 0 = +185M.
    expect(message).toContain(
      "• Kassa harakati (oyliksiz): <b>+185 000 000 so'm</b>",
    );
  });

  it('bounds the MTD Expense query by a date-only Tashkent month window, never a -5h shifted timestamp (regression)', async () => {
    const state = defaultState();
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));

    await service.build(1001, null);

    // The two MTD aggregates (operational + advance) filter `date` as a
    // {gte,lte} window; today's spend uses an exact Date. Inspect the windows.
    const monthlyWheres = prisma.expense.aggregate.mock.calls
      .map((c: any) => c[0].where)
      .filter((w: any) => w.date && !(w.date instanceof Date));
    expect(monthlyWheres.length).toBe(2);

    for (const where of monthlyWheres) {
      // Lower bound is the 1st of the Tashkent month at 00:00 UTC — NOT the
      // buggy 19:00-of-the-previous-30th that firstOfThisMonthUtc() produced
      // (which Postgres floored to the prior day and leaked June into July).
      expect(where.date.gte).toBeInstanceOf(Date);
      expect(where.date.gte.getUTCHours()).toBe(0);
      expect(where.date.gte.getUTCDate()).toBe(1);
      expect(where.date.gte.getUTCMonth()).toBe(6); // July (0-indexed)
      // An upper bound now exists (was missing → future-dated rows leaked in).
      expect(where.date.lte).toBeInstanceOf(Date);
      expect(where.date.lte.getUTCHours()).toBe(0);
    }
  });

  it('shows a ▼ arrow when debt shrinks vs yesterday', async () => {
    const state = defaultState();
    state.yesterdaySnapshot = { totalDebt: 22_000_000, debtorCount: 48 };
    const service = await buildService(
      makePrisma(state),
      makeSalary(state),
      reportsWithDebt(
        splitOf({
          total: 20_000_000,
          count: 44,
          currentMonth: 18_000_000,
          currentMonthCount: 0,
          older: 2_000_000,
        }),
      ),
    );

    const { message: raw } = await service.build(1001, null);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).toContain('(bugun ▼ 2 000 000 · -4)');
  });

  it('omits the debt delta when there is no prior snapshot', async () => {
    const state = defaultState();
    state.yesterdaySnapshot = null;
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001, null);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    // The three lines still print — only the arrow and its figures need
    // yesterday's snapshot.
    expect(message).toContain(
      "• O'qiyotganlar qarzi: <b>48</b> ta — <b>20 070 000 so'm</b>\n",
    );
    expect(message).toContain("• O'qimayotganlar qarzi: <b>29</b> ta");
    expect(message).not.toContain('bugun ▲');
    expect(message).not.toContain('bugun ▼');
  });

  it('hides the salary block when getMonthly returns all-zero (config-gap month)', async () => {
    const state = defaultState();
    state.salaryTotals = { fullDeserved: 0, covered: 0, centerFunded: 0 };
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001, null);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).not.toContain('Ustozlar oyligi');
    expect(message).not.toContain("Markaz qo'shimchasi");
  });

  it('hides the salary block when the company has no CEO/Admin caller', async () => {
    const state = defaultState();
    state.ceo = null;
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001, null);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).not.toContain('Ustozlar oyligi');
  });

  it('collapses 🚩 Diqqat to a clean line and goes 🟢 when nothing is wrong', async () => {
    const state = defaultState();
    state.flags = []; // no refunds/write-offs/adjustments
    state.yesterdaySnapshot = { totalDebt: 20_070_000, debtorCount: 48 }; // no debt growth
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001, null);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).toContain("✅ <b>Bugun jiddiy muammo yo'q</b>");
    expect(message).not.toContain('🚩');
    expect(message).toContain('🟢');
  });

  it('goes 🔴 when the day is cash-negative', async () => {
    const state = defaultState();
    state.todayPayments = { amount: 500_000, count: 1 };
    state.todayExpenses = 2_000_000; // net = -1.5M
    state.flags = [];
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001, null);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    // The verdict line itself: the debt's «🔴 eski qarz» now puts a 🔴 in every
    // message, so the bare emoji no longer says anything about the day.
    expect(message).toContain("🔴 <i>Kun yakuni: e'tibor talab</i>");
    expect(message).toContain("• Sof (bugun): <b>-1 500 000 so'm</b>");
  });

  it('drops sub-threshold adjustments but keeps refunds/write-offs', async () => {
    const state = defaultState();
    state.flags = [
      { type: 'ADJUSTMENT', amount: 100_000, count: 1 }, // below 500k threshold
      { type: 'REFUND', amount: -200_000, count: 1 },
    ];
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001, null);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).not.toContain('Katta tuzatish');
    expect(message).toContain("Qaytarilgan to'lov: <b>200 000 so'm</b>");
  });

  it("reads today's flags from live ledger rows only: a cancelled refund leaves both of its rows out", async () => {
    const state = defaultState();
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));

    await service.build(1001, null);

    // Cancelling writes a counter-row of the SAME type (positive for a refund)
    // with `reversedTransactionId` set and `reversedAt: null`; `reversedAt: null`
    // alone keeps it, and the flag reports a refund that was undone.
    expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['type'],
        where: expect.objectContaining({
          companyId: 1001,
          type: { in: ['REFUND', 'DEBT_WRITE_OFF', 'ADJUSTMENT'] },
          reversedAt: null,
          reversedTransactionId: null,
        }),
      }),
    );
  });

  it("flags lessons waiting more than a day for «Dars bo'ldimi?»", async () => {
    const state = { ...defaultState(), staleUnmarked: 3 };
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));
    const { message } = await service.build(1001, null);
    expect(message).toContain(
      '• Javobsiz darslar (1 kundan ortiq): <b>3</b> ta',
    );
    expect(prisma.unmarkedLesson.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 1001,
        status: 'PENDING',
        group: { deletedAt: null },
      }),
    });
  });

  it('prints no «Javobsiz darslar» line when nothing is waiting', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state));
    const { message } = await service.build(1001, null);
    expect(message).not.toContain('Javobsiz darslar');
  });

  it('flags join requests waiting more than a day (ADR-0080)', async () => {
    const state = { ...defaultState(), staleJoinRequests: 2 };
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));
    const { message } = await service.build(1001, null);
    expect(message).toContain(
      "• Javobsiz o'quvchi so'rovlari (1 kundan ortiq): <b>2</b> ta",
    );
    expect(prisma.studentJoinRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 1001,
        status: 'PENDING',
        createdAt: { lt: expect.any(Date) },
      }),
    });
  });

  it("counts only the join requests of the group's own branches", async () => {
    const state = { ...defaultState(), staleJoinRequests: 1 };
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));

    await service.build(1001, [2]);
    expect(prisma.studentJoinRequest.count).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        companyId: 1001,
        status: 'PENDING',
        branchId: { in: [2] },
      }),
    });

    // A company-wide run has no branch filter at all.
    await service.build(1001, null);
    const [{ where }] = prisma.studentJoinRequest.count.mock
      .lastCall as unknown as [{ where: object }];
    expect(where).not.toHaveProperty('branchId');
  });

  it('prints no join request line when nothing waits', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state));
    const { message } = await service.build(1001, null);
    expect(message).not.toContain("o'quvchi so'rovlari");
  });

  it('does NOT write the snapshot itself any more', async () => {
    // Writing it here meant it only happened after a confirmed Telegram send,
    // and this cron skips Sundays and holidays — so those days had no row and
    // a month closing on a Sunday had no closing figure. `DailySnapshotCron`
    // writes it every day instead. Do not re-attach it to the send path.
    const state = defaultState();
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));

    await service.build(1001, null);

    expect(prisma.dailyFinancialSnapshot.upsert).not.toHaveBeenCalled();
    expect((service as any).persistSnapshot).toBeUndefined();
  });
});

/**
 * H5: «Sof foyda» had four different definitions across the app. This message
 * carried the worst one — `tushum − xarajat − avans`, which subtracts NO salary
 * (payroll never reaches the `Expense` table) while still deducting advance cash
 * the canonical formula does not treat as an expense. It then printed the full
 * deserved salary a few lines below its own inflated profit.
 */
describe('TelegramGroupDailyReportService — canonical Sof foyda', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-08T16:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('falls back to an honestly-named cash line when the canonical figure fails', async () => {
    const state = defaultState();
    const svc = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockRejectedValue(new Error('db down')),
    });

    const { message } = await svc.build(1, null);

    // No "Sof foyda" claim at all — a cash number must never wear that label.
    expect(message).not.toContain('• Sof foyda:');
    expect(message).toContain('• Kassa harakati (oyliksiz):');
  });

  it('asks for the Tashkent calendar month of today', async () => {
    const state = defaultState();
    const getMonthlyNetProfit = jest
      .fn()
      .mockResolvedValue({ netProfit: 1_000 });
    const svc = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit,
    });

    await svc.build(1, null);

    expect(getMonthlyNetProfit).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ month: '2026-07' }),
    );
  });
});

/**
 * ADR-0058: from 2026-09 every course is paid monthly, so the month's headline
 * is what was CHARGED — «Bu oy hisoblandi / To'landi / Qoldi» from
 * `ReportsService.getMonthCharges`. The lesson-based collection and month-end
 * lines it replaces stay for the months before it.
 */
describe('TelegramGroupDailyReportService — «Bu oy hisoblandi» (ADR-0058)', () => {
  // 21:00 Tashkent on 8 October 2026 — a monthly-billing month.
  const OCTOBER = new Date('2026-10-08T16:00:00Z');
  const monthCharges = {
    month: '2026-10',
    charged: 159_300_000,
    paid: 122_310_000,
    unpaid: 36_990_000,
    paidPct: 76.8,
    students: 219,
  };
  // The message is `lines.join('\n')`, so the three lines are ONE contiguous
  // block and a single `toContain` checks the wording and the order. `formatSum`
  // rather than a literal: its thousands separator is a non-breaking space.
  const chargesBlock = [
    `• Bu oy hisoblandi: <b>${formatSum(159_300_000)}</b>`,
    `• To'landi: <b>${formatSum(122_310_000)}</b> (<b>76.8%</b>)`,
    `• Qoldi: <b>${formatSum(36_990_000)}</b>`,
  ].join('\n');

  /**
   * Everything the OLD lines are built from is present, so their absence from
   * the October message is the feature's doing and not a thin mock's.
   */
  function reportsMock(overrides: Record<string, unknown> = {}) {
    return {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest.fn().mockResolvedValue({
        total: 142_000_000,
        currentMonth: 142_000_000,
        advance: 0,
        lateTotal: 0,
        late: [],
        lessonsValue: 173_783_991,
        collectionPct: 82,
      }),
      getMonthlyExpectation: jest
        .fn()
        .mockResolvedValue({ expectedValue: 155_765_411 }),
      getMonthCharges: jest.fn().mockResolvedValue(monthCharges),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(OCTOBER);
  });
  afterEach(() => jest.useRealTimers());

  it("prints hisoblandi / to'landi / qoldi after «Shu oyning darslari» and drops the lesson-based lines", async () => {
    const state = defaultState();
    const reports = reportsMock();
    const service = await buildService(
      makePrisma(state),
      makeSalary(state),
      reports,
    );

    const { message } = await service.build(1001, null);

    expect(message).toContain(chargesBlock);
    // «Shu oyning darslari» (revenue recognised so far) stays; the block follows it.
    const lessons = message.indexOf('• Shu oyning darslari:');
    expect(lessons).toBeGreaterThan(-1);
    expect(message.indexOf(chargesBlock)).toBeGreaterThan(lessons);
    // The three lines it replaces.
    expect(message).not.toContain('Oy oxiriga kutilyapti');
    expect(message).not.toContain("Oy rejasidan yig'ildi");
    expect(message).not.toContain("Shundan yig'ildi");
    expect(reports.getMonthCharges).toHaveBeenCalledWith(1001, {
      month: '2026-10',
      branchIds: null,
    });
  });

  it("asks for the charges of the group's own branches", async () => {
    const state = defaultState();
    const reports = reportsMock();
    const service = await buildService(
      makePrisma(state),
      makeSalary(state),
      reports,
    );

    await service.build(1001, [2]);

    expect(reports.getMonthCharges).toHaveBeenCalledWith(1001, {
      month: '2026-10',
      branchIds: [2],
    });
  });

  it('prints neither the new nor the old month lines when getMonthCharges fails, warns and sends the rest', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      const state = defaultState();
      const service = await buildService(
        makePrisma(state),
        makeSalary(state),
        reportsMock({
          getMonthCharges: jest.fn().mockRejectedValue(new Error('boom')),
        }),
      );

      const { message } = await service.build(1001, null);

      // No hisoblandi / to'landi / qoldi …
      expect(message).not.toContain('Bu oy hisoblandi');
      expect(message).not.toContain('Qoldi:');
      // … and NOT the lesson-based lines in their place: in a billing month
      // they are the wrong figures, whether or not the charges could be read.
      expect(message).not.toContain("Shundan yig'ildi");
      expect(message).not.toContain('Oy oxiriga kutilyapti');
      expect(message).not.toContain("Oy rejasidan yig'ildi");
      // The rest of the report is sent, «Shu oyning darslari» included.
      expect(message).toContain('Tushum (haqiqiy)');
      expect(message).toContain('• Shu oyning darslari:');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Oy hisoblari olinmadi: boom'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps the lesson-based lines for a month before 2026-09 and never asks for charges', async () => {
    jest.setSystemTime(new Date('2026-08-12T16:00:00Z'));
    const state = defaultState();
    const reports = reportsMock();
    const service = await buildService(
      makePrisma(state),
      makeSalary(state),
      reports,
    );

    const { message } = await service.build(1001, null);

    expect(reports.getMonthCharges).not.toHaveBeenCalled();
    expect(message).toContain("Shundan yig'ildi");
    expect(message).toContain('Oy oxiriga kutilyapti');
    expect(message).toContain("Oy rejasidan yig'ildi");
    expect(message).not.toContain('Bu oy hisoblandi');
  });
});

/**
 * ADR-0059: the debt is two numbers that are never added — «O'qiyotganlar»
 * (students in an active group, with its shu oy / eski qarz split) and
 * «O'qimayotganlar» (every other non-archived debtor). `ReportsService
 * .getDebtSplit` is their one source; the ▲/▼ delta, the 🟡 light and the
 * snapshot data all follow the FIRST number alone.
 */
describe('TelegramGroupDailyReportService — debt as two numbers (ADR-0059)', () => {
  // 21:00 Tashkent on 8 July 2026 — a Wednesday, like the blocks above.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-08T16:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  // 219 studying debtors owe 39.15M (36.99M of it this month's charges), 305
  // others owe 36.54M. Yesterday's snapshot held 38.7M / 217, so the studying
  // number reads ▲ 450 000 · +2.
  const split = splitOf(
    {
      total: 39_150_000,
      count: 219,
      currentMonth: 36_990_000,
      currentMonthCount: 0,
      older: 2_160_000,
    },
    {
      total: 36_540_000,
      count: 305,
      currentMonth: 0,
      byKind: {
        ungrouped: { total: 11_340_000, count: 94 },
        frozen: { total: 16_200_000, count: 136 },
        left: { total: 9_000_000, count: 75 },
      },
    },
  );
  const yesterday = { totalDebt: 38_700_000, debtorCount: 217 };

  async function buildWith(
    reports: ReturnType<typeof reportsWithDebt>,
    overrides: Partial<State> = {},
    branchIds: number[] | null = null,
  ) {
    const state = {
      ...defaultState(),
      yesterdaySnapshot: yesterday,
      ...overrides,
    };
    const service = await buildService(
      makePrisma(state),
      makeSalary(state),
      reports,
    );
    return service.build(1001, branchIds);
  }

  it("prints «O'qiyotganlar» with its delta and split, then «O'qimayotganlar»", async () => {
    const { message } = await buildWith(reportsWithDebt(split));

    // One contiguous block, so a single `toContain` checks wording and order.
    // `formatSum` / `formatNumber` rather than literals: their thousands
    // separator is a non-breaking space.
    const debtBlock = [
      `• O'qiyotganlar qarzi: <b>${formatNumber(219)}</b> ta — <b>${formatSum(39_150_000)}</b>  (bugun ▲ ${formatNumber(450_000)} · +2)`,
      `   🟡 shu oy ${formatSum(36_990_000)} · 🔴 eski qarz ${formatSum(2_160_000)}`,
      `• O'qimayotganlar qarzi: <b>${formatNumber(305)}</b> ta — <b>${formatSum(36_540_000)}</b>`,
    ].join('\n');
    expect(message).toContain(debtBlock);
    // Under «Faol o'quvchilar», in «Hozirgi holat».
    expect(message.indexOf(debtBlock)).toBeGreaterThan(
      message.indexOf("• Faol o'quvchilar:"),
    );
    // The single combined line is gone.
    expect(message).not.toContain('Qarzdorlar:');
  });

  it('never adds the two numbers', async () => {
    const { message } = await buildWith(reportsWithDebt(split));

    expect(message).not.toContain('Jami qarz');
    expect(message).not.toContain(formatNumber(39_150_000 + 36_540_000));
  });

  it('prints no shu oy / eski qarz line when nobody studying owes', async () => {
    const { message } = await buildWith(
      reportsWithDebt(
        splitOf({
          total: 0,
          count: 0,
          currentMonth: 0,
          currentMonthCount: 0,
          older: 0,
          olderCount: 0,
        }),
      ),
      { yesterdaySnapshot: null },
    );

    expect(message).toContain(
      [
        `• O'qiyotganlar qarzi: <b>${formatNumber(0)}</b> ta — <b>${formatSum(0)}</b>`,
        `• O'qimayotganlar qarzi: <b>${formatNumber(29)}</b> ta — <b>${formatSum(8_190_000)}</b>`,
      ].join('\n'),
    );
    expect(message).not.toContain('🟡 shu oy');
  });

  it('moves the ▲/▼ and the 🟡 light with the studying number only', async () => {
    // Studying debt is exactly yesterday's; the OTHER number is large and
    // changed. No arrow, and — with no flag, a positive day and good
    // attendance — the day stays 🟢.
    const { message } = await buildWith(
      reportsWithDebt(
        splitOf(
          { total: 38_700_000, count: 217 },
          {
            total: 90_000_000,
            count: 600,
            currentMonth: 0,
            byKind: {
              ungrouped: { total: 30_000_000, count: 200 },
              frozen: { total: 40_000_000, count: 270 },
              left: { total: 20_000_000, count: 130 },
            },
          },
        ),
      ),
      { flags: [] },
    );

    expect(message).not.toContain('bugun ▲');
    expect(message).not.toContain('bugun ▼');
    expect(message).toContain('Kun yakuni: yaxshi');
  });

  it.each([
    [500_000, "Kun yakuni: ehtiyot bo'ling"], // exactly the threshold → 🟡
    [499_999, 'Kun yakuni: yaxshi'],
  ])('a studying debt up by %i is read as «%s»', async (growth, subtitle) => {
    // Yesterday's 217 debtors, their debt up by `growth` in this month's
    // charges: the split stays whole (total = shu oy + eski qarz).
    const { message } = await buildWith(
      reportsWithDebt(
        splitOf({
          total: 38_700_000 + growth,
          count: 217,
          currentMonth: 36_540_000 + growth,
          older: 2_160_000,
        }),
      ),
      { flags: [] },
    );

    // The verdict's subtitle, not its emoji: «🟡 shu oy» is on the debt line.
    expect(message).toContain(subtitle);
  });

  it("asks for the report's own scope, and not for a month", async () => {
    const all = reportsWithDebt(split);
    await buildWith(all);
    const branch = reportsWithDebt(split);
    await buildWith(branch, {}, [2]);

    // «This month» is the current Tashkent month by default, which is the
    // report's own — passing one would only invite the two to drift.
    expect(all.getDebtSplit).toHaveBeenCalledTimes(1);
    expect(all.getDebtSplit).toHaveBeenCalledWith(1001, { branchIds: null });
    expect(branch.getDebtSplit).toHaveBeenCalledWith(1001, { branchIds: [2] });
  });

  it('hands the studying number on as the snapshot data', async () => {
    // `DailySnapshotService` writes the day's row from the same split; both
    // carry the studying total and count, never the two added.
    const { snapshot } = await buildWith(reportsWithDebt(split));

    expect(snapshot).toEqual({
      totalDebt: 39_150_000,
      debtorCount: 219,
      activeStudents: 1240,
      mtdIncome: 280_000_000,
    });
  });

  it('does not invent a zero when the split cannot be read', async () => {
    // Read like the other Prisma figures of the report: a failure fails the
    // build, so no message claims nobody owes.
    const reports = {
      ...reportsWithDebt(split),
      getDebtSplit: jest.fn().mockRejectedValue(new Error('boom')),
    };

    await expect(buildWith(reports)).rejects.toThrow('boom');
  });
});
