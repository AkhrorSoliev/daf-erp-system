import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryMonthlyService } from '../salary/salary-monthly.service';
import { TelegramGroupDailyReportService } from './telegram-group-daily-report.service';

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
  debt: { total: number; count: number };
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
    gap: number;
  } | null;
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
    debt: { total: 22_300_000, count: 48 },
    mtdIncome: 280_000_000,
    mtdExpenses: 95_000_000,
    mtdAdvances: 0,
    flags: [
      { type: 'REFUND', amount: -350_000, count: 1 },
      { type: 'DEBT_WRITE_OFF', amount: 900_000, count: 1 },
    ],
    yesterdaySnapshot: { totalDebt: 21_100_000, debtorCount: 46 },
    forecastEnrollments: [],
    ceo: { id: 1 },
    salaryTotals: { fullDeserved: 40_000_000, covered: 32_000_000, gap: 8_000_000 },
  };
}

function makePrisma(state: State) {
  return {
    company: { findUnique: jest.fn(async () => ({ name: state.companyName })) },
    student: {
      count: jest.fn(async ({ where }: any) =>
        where.createdAt ? state.todayNewStudents : state.activeStudents,
      ),
      aggregate: jest.fn(async () => ({
        _sum: { balance: -state.debt.total },
        _count: state.debt.count,
      })),
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
          ? { _sum: { amount: state.todayPayments.amount }, _count: state.todayPayments.count }
          : { _sum: { amount: state.mtdIncome } },
      ),
      groupBy: jest.fn(async () =>
        state.todayMethods.map((m) => ({ method: m.method, _sum: { amount: m.amount } })),
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
          : Array.from({ length: state.lessonGroups }, (_, i) => ({ groupId: `g${i}` })),
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
  };
}

function makeSalary(state: State) {
  return {
    getMonthly: jest.fn(async () => ({
      totals: state.salaryTotals ?? {
        fullDeserved: 0,
        covered: 0,
        gap: 0,
      },
    })),
  };
}

async function buildService(prisma: any, salary: any) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TelegramGroupDailyReportService,
      { provide: PrismaService, useValue: prisma },
      { provide: SalaryMonthlyService, useValue: salary },
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

    const { message: raw } = await service.build(1001);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');

    // Header + company name (escaped) + weekday.
    expect(message).toContain('DaF Sprachzentrum');
    // 💰 Bugungi moliya
    expect(message).toContain('• Kirim: <b>14 ta · 8 400 000 so\'m</b>');
    expect(message).toContain('Naqd 3 200 000 · Payme 3 100 000 · Click 1 300 000 · O\'tkazma 800 000');
    expect(message).toContain('• Chiqim: <b>1 850 000 so\'m</b>');
    expect(message).toContain('• Sof (bugun): <b>+6 550 000 so\'m</b>');
    // 👥 Movement: 3 new − 1 departed = +2 net; 5 leads (1 converted).
    expect(message).toContain("Yangi o'quvchilar: <b>3</b> · Ketgan: <b>1</b> — sof <b>+2</b>");
    expect(message).toContain("Yangi lidlar: <b>5</b> (1 tasi o'quvchiga aylandi)");
    // 🎓 Operations: 18 groups, attendance 204/(204+18)=92%.
    expect(message).toContain("Dars o'tilgan guruhlar: <b>18</b>");
    expect(message).toContain('<b>198</b> keldi · <b>6</b> kech · <b>18</b> kelmadi · <b>4</b> uzrli — <b>92%</b>');
    // 📌 Current state + debt delta (22.3M vs yesterday 21.1M = ▲ 1.2M, +2 debtors).
    expect(message).toContain('Faol o\'quvchilar: <b>1 240</b>');
    expect(message).toContain('Qarzdorlar: <b>48</b> ta — <b>22 300 000 so\'m</b>  (bugun ▲ 1 200 000 · +2)');
    // 📅 MTD: 280M − 95M = +185M net.
    expect(message).toContain('Tushum (haqiqiy): <b>280 000 000 so\'m</b>');
    expect(message).toContain('Sof foyda: <b>+185 000 000 so\'m</b>');
    // 💵 Salary top-up block.
    expect(message).toContain("To'liq ishlangan: <b>40 000 000 so'm</b>");
    expect(message).toContain("O'quvchilar to'lagan: <b>32 000 000 so'm</b>");
    expect(message).toContain('🏛 Markaz qo\'shimchasi: <b>8 000 000 so\'m</b>');
    // 🚩 Diqqat flags.
    expect(message).toContain("Qaytarilgan to'lov: <b>350 000 so'm</b> (1 ta)");
    expect(message).toContain('Qarz kechirildi: <b>900 000 so\'m</b> (1 ta');
  });

  it('queries Attendance.date as a single DATE, never a {gte,lt} window (regression)', async () => {
    const state = defaultState();
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));

    await service.build(1001);

    for (const call of prisma.attendance.groupBy.mock.calls) {
      const where = call[0].where;
      expect(where.date).toBeInstanceOf(Date);
      expect(where.date).not.toEqual(
        expect.objectContaining({ gte: expect.anything(), lt: expect.anything() }),
      );
      expect(where.date.getUTCHours()).toBe(0);
    }
  });

  it('splits teacher advances into their own MTD line and subtracts them from Sof foyda', async () => {
    const state = defaultState();
    state.mtdIncome = 144_431_991;
    state.mtdExpenses = 20_017_000;
    state.mtdAdvances = 12_150_000;
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001);
    const message = raw.replace(/ /g, ' ');

    // Xarajat = pure operational spend (advance-free); Avans is a standalone
    // line, not a "shundan" sub-line of Xarajat.
    expect(message).toContain("• Xarajat: <b>20 017 000 so'm</b>");
    expect(message).toContain("• Avans (ustozlarga): <b>12 150 000 so'm</b>");
    // Sof foyda = Tushum − Xarajat − Avans = 144 431 991 − 20 017 000 − 12 150 000.
    expect(message).toContain("• Sof foyda: <b>+112 264 991 so'm</b>");
  });

  it('omits the Avans line when there are no MTD advances (self-suppressing)', async () => {
    const state = defaultState();
    state.mtdAdvances = 0;
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001);
    const message = raw.replace(/ /g, ' ');
    expect(message).not.toContain('Avans (ustozlarga)');
    // Sof foyda unchanged: 280M − 95M − 0 = +185M.
    expect(message).toContain("• Sof foyda: <b>+185 000 000 so'm</b>");
  });

  it('bounds the MTD Expense query by a date-only Tashkent month window, never a -5h shifted timestamp (regression)', async () => {
    const state = defaultState();
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));

    await service.build(1001);

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
    state.debt = { total: 20_000_000, count: 44 };
    state.yesterdaySnapshot = { totalDebt: 22_000_000, debtorCount: 48 };
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).toContain('(bugun ▼ 2 000 000 · -4)');
  });

  it('omits the debt delta when there is no prior snapshot', async () => {
    const state = defaultState();
    state.yesterdaySnapshot = null;
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).toContain('Qarzdorlar: <b>48</b> ta — <b>22 300 000 so\'m</b>');
    expect(message).not.toContain('bugun ▲');
    expect(message).not.toContain('bugun ▼');
  });

  it('hides the salary block when getMonthly returns all-zero (config-gap month)', async () => {
    const state = defaultState();
    state.salaryTotals = { fullDeserved: 0, covered: 0, gap: 0 };
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).not.toContain('Ustozlar oyligi');
    expect(message).not.toContain('Markaz qo\'shimchasi');
  });

  it('hides the salary block when the company has no CEO/Admin caller', async () => {
    const state = defaultState();
    state.ceo = null;
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).not.toContain('Ustozlar oyligi');
  });

  it('collapses 🚩 Diqqat to a clean line and goes 🟢 when nothing is wrong', async () => {
    const state = defaultState();
    state.flags = []; // no refunds/write-offs/adjustments
    state.yesterdaySnapshot = { totalDebt: 22_300_000, debtorCount: 48 }; // no debt growth
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001);
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

    const { message: raw } = await service.build(1001);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).toContain('🔴');
    expect(message).toContain('• Sof (bugun): <b>-1 500 000 so\'m</b>');
  });

  it('drops sub-threshold adjustments but keeps refunds/write-offs', async () => {
    const state = defaultState();
    state.flags = [
      { type: 'ADJUSTMENT', amount: 100_000, count: 1 }, // below 500k threshold
      { type: 'REFUND', amount: -200_000, count: 1 },
    ];
    const service = await buildService(makePrisma(state), makeSalary(state));

    const { message: raw } = await service.build(1001);
    // formatNumber uses a non-breaking space (U+00A0) as the thousands
    // separator; normalize to a regular space so expectations stay readable.
    const message = raw.replace(/\u00A0/g, ' ');
    expect(message).not.toContain('Katta tuzatish');
    expect(message).toContain("Qaytarilgan to'lov: <b>200 000 so'm</b>");
  });

  it('persistSnapshot upserts today\'s figures keyed by company + date', async () => {
    const state = defaultState();
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));

    await service.persistSnapshot(1001, {
      totalDebt: 22_300_000,
      debtorCount: 48,
      activeStudents: 1240,
      mtdIncome: 280_000_000,
    });

    expect(prisma.dailyFinancialSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_date: { companyId: 1001, date: expect.any(Date) } },
        create: expect.objectContaining({ companyId: 1001, totalDebt: 22_300_000 }),
        update: expect.objectContaining({ totalDebt: 22_300_000 }),
      }),
    );
  });
});
