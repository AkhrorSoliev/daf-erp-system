import { Logger } from '@nestjs/common';
import { TelegramGroupReportMenuService } from './telegram-group-report-menu.service';
import type { ReportsService } from '../reports/reports.service';
import { formatSum } from './utils/format.util';

function makeCtx(chatId = 111) {
  return {
    chat: { id: chatId },
    match: undefined as any,
    answerCbQuery: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue(true),
    replyWithDocument: jest.fn().mockResolvedValue(true),
    editMessageText: jest.fn().mockResolvedValue(true),
    deleteMessage: jest.fn().mockResolvedValue(true),
    sendChatAction: jest.fn().mockResolvedValue(true),
  } as any;
}

function makeDeps(
  overrides: {
    groupStatus?: string;
    systemStartDate?: Date | null;
    branchId?: number | null;
    receivesAllBranches?: boolean;
    reports?: Record<string, jest.Mock>;
  } = {},
) {
  const prisma: any = {
    telegramGroup: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'g1',
        companyId: 1001,
        chatId: 111n,
        branchId: overrides.branchId ?? null,
        receivesAllBranches: overrides.receivesAllBranches ?? false,
        status: overrides.groupStatus ?? 'APPROVED',
        isActive: true,
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    company: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'DaF Sprachzentrum',
        systemStartDate:
          overrides.systemStartDate === undefined
            ? null
            : overrides.systemStartDate,
      }),
    },
    branch: {
      findMany: jest.fn().mockResolvedValue([
        { id: 1, name: "Farg'ona filiali" },
        { id: 2, name: 'Namangan filiali' },
      ]),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
  };
  const reportsExcel: any = {
    generate: jest.fn().mockResolvedValue(Buffer.from('xlsx-bytes')),
  };
  const reportsFinancial: any = {
    // No `forecast` and no debt: the raw overview carries neither any more
    // (ADR-0059), so a card that still read them would fail loudly here.
    getFinancialOverview: jest.fn().mockResolvedValue({
      income: { actual: 280_000_000, byMethod: [] },
      salary: { paid: 30_000_000, pending: 0, advances: 0 },
      expenses: 95_000_000,
      netProfit: 185_000_000,
    }),
  };
  // `ReportsService` is absent unless a test passes `reports`: the financial
  // card must degrade to the honestly-labelled cash line when the canonical net
  // profit cannot be computed, and to a card without its month line when the
  // month's figure cannot be read — the default tests below rely on both.
  const service = new TelegramGroupReportMenuService(
    prisma,
    reportsExcel,
    reportsFinancial,
    (overrides.reports ?? null) as unknown as ReportsService,
  );
  return { service, prisma, reportsExcel, reportsFinancial };
}

describe('TelegramGroupReportMenuService', () => {
  beforeEach(() => {
    // 2026-07-08 Tashkent → floor 2026-05, current 2026-07.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-08T16:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  // The workbook carries every payment and expense line item. It used to be
  // built with `branchIds: null` and captioned 'Barcha filiallar' no matter
  // what the group was, so a group confined to Fargona received Namangan's
  // rows — and its own `receivesAllBranches: false` said it should not.
  describe('branch scope comes from the group', () => {
    it('confines the workbook to the group branch and labels it', async () => {
      const { service, reportsExcel } = makeDeps({ branchId: 2 });

      await service.sendMonthExcel(makeCtx(), '2026-06');

      expect(reportsExcel.generate).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          branchIds: [2],
          branchLabel: 'Namangan filiali',
        }),
      );
    });

    it('keeps the workbook company-wide for a declared org-wide group', async () => {
      const { service, reportsExcel } = makeDeps({
        branchId: null,
        receivesAllBranches: true,
      });

      await service.sendMonthExcel(makeCtx(), '2026-06');

      expect(reportsExcel.generate).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          branchIds: null,
          branchLabel: 'Barcha filiallar',
        }),
      );
    });

    it('confines the financial card to the group branch and names the scope', async () => {
      const { service, reportsFinancial } = makeDeps({ branchId: 1 });
      const ctx = makeCtx();

      await service.sendFinancialCard(ctx);

      expect(reportsFinancial.getFinancialOverview).toHaveBeenCalledWith(1001, {
        branchIds: [1],
      });
      expect(ctx.reply.mock.calls[0][0]).toContain("Farg'ona filiali");
    });
  });

  it('moreButton() carries the rm:open callback', () => {
    const kb = JSON.stringify(TelegramGroupReportMenuService.moreButton());
    expect(kb).toContain('rm:open');
    expect(kb).toContain("Ko'proq imkoniyatlar");
  });

  it('sendMonthExcel generates a single-month workbook with the default sheets', async () => {
    const { service, reportsExcel } = makeDeps();
    const ctx = makeCtx();

    await service.sendMonthExcel(ctx, '2026-06');

    expect(reportsExcel.generate).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        include: [],
        performedById: 7,
        companyName: 'DaF Sprachzentrum',
      }),
    );
    const [, extra] = ctx.replyWithDocument.mock.calls[0];
    expect(ctx.replyWithDocument.mock.calls[0][0]).toEqual(
      expect.objectContaining({ filename: 'hisobot-2026-06.xlsx' }),
    );
    expect(extra.caption).toContain('Hisobot — 06.2026');
  });

  // Every sheet a caption names must exist in the file it is attached to. The
  // «Taqqoslash» / «Asosiy xulosa» / KPI / Guruhlar sheets are gone, so no bot
  // message may mention them.
  it('never names a sheet the workbook no longer contains', async () => {
    const { service } = makeDeps();
    const gone = ['Taqqoslash', 'Asosiy xulosa', 'KPI', 'Guruhlar'];

    for (const send of [
      (ctx: any) => service.sendMonthExcel(ctx, '2026-06'),
      (ctx: any) => service.sendPresetExcel(ctx, 3),
      (ctx: any) => service.sendYearlyExcel(ctx, 2026),
    ]) {
      const ctx = makeCtx();
      await send(ctx);
      const caption = ctx.replyWithDocument.mock.calls[0][1].caption as string;
      for (const sheet of gone) expect(caption).not.toContain(sheet);
    }
  });

  it('sendYearlyExcel spans the full year as a plain range export', async () => {
    const { service, reportsExcel } = makeDeps();
    const ctx = makeCtx();

    await service.sendYearlyExcel(ctx, 2026);

    expect(reportsExcel.generate).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        include: [],
      }),
    );
  });

  it('answers a stale comparison button instead of leaving it spinning', async () => {
    const { service, reportsExcel } = makeDeps();
    const ctx = makeCtx();

    await service.showRetiredComparison(ctx);

    expect(reportsExcel.generate).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery.mock.calls[0][0]).toContain(
      'Davrlar taqqoslash olib tashlandi',
    );
    // The root menu comes back, minus the retired branch.
    const kb = JSON.stringify(ctx.editMessageText.mock.calls[0][1]);
    expect(kb).toContain('rm:full');
    expect(kb).not.toContain('rm:cmp');
  });

  it('sendPresetExcel(3) builds a trailing 3-month range ending this month', async () => {
    const { service, reportsExcel } = makeDeps();
    const ctx = makeCtx();

    await service.sendPresetExcel(ctx, 3);

    // current 2026-07 → start month 2026-05.
    expect(reportsExcel.generate).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({
        startDate: '2026-05-01',
        endDate: '2026-07-31',
        include: [],
      }),
    );
  });

  it('showFullMonths lists floor..current months as buttons', async () => {
    const { service } = makeDeps();
    const ctx = makeCtx();

    await service.showFullMonths(ctx, 2026);

    const [text, extra] = ctx.editMessageText.mock.calls[0];
    expect(text).toContain('Qaysi oy? (2026)');
    const kb = JSON.stringify(extra);
    expect(kb).toContain('rm:fm:2026-05');
    expect(kb).toContain('rm:fm:2026-06');
    expect(kb).toContain('rm:fm:2026-07');
    // Nothing before the floor month.
    expect(kb).not.toContain('rm:fm:2026-04');
  });

  it('respects Company.systemStartDate as the floor month', async () => {
    const { service } = makeDeps({
      systemStartDate: new Date('2026-06-01T00:00:00Z'),
    });
    const ctx = makeCtx();

    await service.showFullMonths(ctx, 2026);
    const kb = JSON.stringify(ctx.editMessageText.mock.calls[0][1]);
    expect(kb).toContain('rm:fm:2026-06');
    expect(kb).not.toContain('rm:fm:2026-05');
  });

  it('refuses to act for a non-approved group (no Excel generated)', async () => {
    const { service, reportsExcel } = makeDeps({ groupStatus: 'PENDING' });
    const ctx = makeCtx();

    await service.sendMonthExcel(ctx, '2026-06');

    expect(reportsExcel.generate).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      'Bu guruh tasdiqlanmagan.',
      expect.objectContaining({ show_alert: true }),
    );
  });

  it('marks the group inactive when Telegram returns 403 on send', async () => {
    const { service, prisma, reportsExcel } = makeDeps();
    const ctx = makeCtx();
    reportsExcel.generate.mockResolvedValue(Buffer.from('x'));
    ctx.replyWithDocument.mockRejectedValueOnce({
      response: { error_code: 403 },
    });

    await service.sendMonthExcel(ctx, '2026-06');

    expect(prisma.telegramGroup.updateMany).toHaveBeenCalledWith({
      where: { chatId: 111n },
      data: { isActive: false },
    });
  });

  it('ignores a rapid second tap while a report is still generating', async () => {
    const { service, reportsExcel } = makeDeps();
    const ctx = makeCtx();
    // Hang generate until we release it; signal when the first call reaches it.
    let releaseGen: (b: Buffer) => void = () => undefined;
    let reachedGen: () => void = () => undefined;
    const reachedGenP = new Promise<void>((r) => (reachedGen = r));
    reportsExcel.generate.mockImplementation(() => {
      reachedGen();
      return new Promise<Buffer>((res) => (releaseGen = res));
    });

    // The in-flight guard is added SYNCHRONOUSLY in each call's prefix (before
    // any await), so firing both back-to-back — no await between — deterministic-
    // ally makes the second see the guard and bail.
    const first = service.sendMonthExcel(ctx, '2026-06');
    const second = service.sendMonthExcel(ctx, '2026-06'); // second tap — bails

    await reachedGenP; // first call has reached generate()
    releaseGen(Buffer.from('xlsx'));
    await Promise.all([first, second]);

    // Only ONE workbook generated despite two taps.
    expect(reportsExcel.generate).toHaveBeenCalledTimes(1);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      '⏳ Oldingi hisobot hali tayyorlanmoqda…',
    );
  });

  it('sendFinancialCard posts an in-chat summary (no file)', async () => {
    const { service, reportsFinancial } = makeDeps();
    const ctx = makeCtx();

    await service.sendFinancialCard(ctx);

    // Company-wide, stated explicitly: a group chat carries no per-user ERP
    // identity, so there is no branch to scope by.
    expect(reportsFinancial.getFinancialOverview).toHaveBeenCalledWith(1001, {
      branchIds: null,
    });
    const text = (ctx.reply.mock.calls[0][0] as string).replace(/\u00A0/g, ' ');
    expect(text).toContain('Moliyaviy xulosa');
    expect(text).toContain('280 000 000');
    expect(ctx.replyWithDocument).not.toHaveBeenCalled();
  });

  it('sendFinancialCard shows which months the cash belongs to', async () => {
    const { service, reportsFinancial } = makeDeps();
    const ctx = makeCtx();
    reportsFinancial.getIncomeMonthAttribution = jest.fn().mockResolvedValue({
      total: 280_000_000,
      currentMonth: 210_000_000,
      lateTotal: 70_000_000,
      late: [
        { monthKey: '2026-06', label: 'Iyun 2026', amount: 50_000_000 },
        { monthKey: '2026-05', label: 'May 2026', amount: 20_000_000 },
      ],
      lessonsValue: 1,
      collectionPct: 1,
    });

    await service.sendFinancialCard(ctx);

    const text = (ctx.reply.mock.calls[0][0] as string).replace(/\u00A0/g, ' ');
    expect(text).toContain("• Tushum (haqiqiy): <b>280 000 000 so'm</b>");
    expect(text).toContain("   Shu oy uchun: <b>210 000 000 so'm</b> (75%)");
    expect(text).toContain(
      "   Eski qarzlar uchun: <b>70 000 000 so'm</b> (25%)",
    );
    expect(text).toContain("      Iyun 2026 — <b>50 000 000 so'm</b>");
    expect(text).toContain("      May 2026 — <b>20 000 000 so'm</b>");
    // The card's own month, stated explicitly: the split must describe the
    // month the card's title names.
    expect(reportsFinancial.getIncomeMonthAttribution).toHaveBeenCalledWith(
      1001,
      { branchIds: null, startDate: '2026-07-01', endDate: '2026-07-31' },
    );
  });

  it('sendFinancialCard survives an attribution failure', async () => {
    const { service, reportsFinancial } = makeDeps();
    const ctx = makeCtx();
    reportsFinancial.getIncomeMonthAttribution = jest
      .fn()
      .mockRejectedValue(new Error('boom'));

    await service.sendFinancialCard(ctx);

    const text = (ctx.reply.mock.calls[0][0] as string).replace(/\u00A0/g, ' ');
    // The card keeps its own income figure and simply loses the split.
    expect(text).toContain("• Tushum (haqiqiy): <b>280 000 000 so'm</b>");
    expect(text).not.toContain('Shu oy uchun');
  });

  // ADR-0058: from 2026-09 the card's month line is «Bu oy hisoblandi / To'landi
  // / Qoldi»; before it, «Oy oxiriga kutilyapti» — now read from the reports
  // facade (A2.2: the card printed `getFinancialOverview().income.expected`,
  // which the raw service hard-coded to 0 — the field is gone now).
  describe('the month line', () => {
    const monthCharges = {
      month: '2026-10',
      charged: 177_000_000,
      paid: 135_900_000,
      unpaid: 41_100_000,
      paidPct: 76.8,
      students: 237,
    };
    // `formatSum`, not a literal: its thousands separator is a non-breaking space.
    const chargesBlock = [
      `• Bu oy hisoblandi: <b>${formatSum(177_000_000)}</b>`,
      `• To'landi: <b>${formatSum(135_900_000)}</b> (<b>76.8%</b>)`,
      `• Qoldi: <b>${formatSum(41_100_000)}</b>`,
    ].join('\n');
    const reportsWith = (overrides: Record<string, jest.Mock> = {}) => ({
      getMonthlyNetProfit: jest
        .fn()
        .mockResolvedValue({ netProfit: 12_345_678 }),
      getMonthCharges: jest.fn().mockResolvedValue(monthCharges),
      getMonthlyExpectation: jest
        .fn()
        .mockResolvedValue({ expectedValue: 150_000_000 }),
      ...overrides,
    });

    it("prints hisoblandi / to'landi / qoldi for October 2026, for the group's branch", async () => {
      jest.setSystemTime(new Date('2026-10-08T16:00:00Z'));
      const reports = reportsWith();
      const { service } = makeDeps({ branchId: 1, reports });
      const ctx = makeCtx();

      await service.sendFinancialCard(ctx);

      const text = ctx.reply.mock.calls[0][0] as string;
      expect(text).toContain(chargesBlock);
      // Neither the old line nor its hard-coded 0.
      expect(text).not.toContain('Oy oxiriga kutilyapti');
      expect(reports.getMonthCharges).toHaveBeenCalledWith(1001, {
        month: '2026-10',
        branchIds: [1],
      });
      expect(reports.getMonthlyExpectation).not.toHaveBeenCalled();
    });

    it('prints the real «Oy oxiriga kutilyapti» before 2026-09, not the raw 0', async () => {
      jest.setSystemTime(new Date('2026-08-12T16:00:00Z'));
      const reports = reportsWith();
      const { service } = makeDeps({ reports });
      const ctx = makeCtx();

      await service.sendFinancialCard(ctx);

      const text = ctx.reply.mock.calls[0][0] as string;
      expect(text).toContain(
        `• Oy oxiriga kutilyapti: <b>${formatSum(150_000_000)}</b>`,
      );
      expect(text).not.toContain('Bu oy hisoblandi');
      expect(reports.getMonthlyExpectation).toHaveBeenCalledWith(1001, {
        month: '2026-08',
        branchIds: null,
      });
      expect(reports.getMonthCharges).not.toHaveBeenCalled();
    });

    it('still sends the card, without the month line, when the figure cannot be read', async () => {
      jest.setSystemTime(new Date('2026-10-08T16:00:00Z'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      try {
        const { service } = makeDeps({
          reports: reportsWith({
            getMonthCharges: jest.fn().mockRejectedValue(new Error('boom')),
          }),
        });
        const ctx = makeCtx();

        await service.sendFinancialCard(ctx);

        // One message, and it is the card — not the «Ma'lumot yuklanmadi» apology.
        expect(ctx.reply).toHaveBeenCalledTimes(1);
        const text = ctx.reply.mock.calls[0][0] as string;
        expect(text).toContain('Moliyaviy xulosa');
        expect(text).toContain('Tushum (haqiqiy)');
        expect(text).not.toContain('Bu oy hisoblandi');
        expect(text).not.toContain('Oy oxiriga kutilyapti');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
      } finally {
        warn.mockRestore();
      }
    });
  });

  // ADR-0059: the card's debt is TWO numbers — «O'qiyotganlar qarzi» with its
  // shu oy / eski split, and «O'qimayotganlar qarzi» — read from the facade's
  // split for the group's own scope, never added and never from the raw
  // overview (whose status-ACTIVE «Qarzdorlar» count is gone).
  describe('the debt lines', () => {
    const split = {
      studying: {
        total: 43_500_000,
        count: 237,
        currentMonth: 41_100_000,
        older: 2_400_000,
      },
      notStudying: { total: 40_600_000, count: 327 },
    };
    // The card's other reads are not what is under test: they answer plainly.
    const reportsWith = (overrides: Record<string, jest.Mock> = {}) => ({
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getMonthlyExpectation: jest
        .fn()
        .mockResolvedValue({ expectedValue: 150_000_000 }),
      getDebtSplit: jest.fn().mockResolvedValue(split),
      ...overrides,
    });

    it('prints the two debts on their own lines, from the split', async () => {
      const { service } = makeDeps({ reports: reportsWith() });
      const ctx = makeCtx();

      await service.sendFinancialCard(ctx);

      // `formatSum`, not a literal: its thousands separator is a non-breaking space.
      const text = ctx.reply.mock.calls[0][0] as string;
      expect(text).toContain(
        `• O'qiyotganlar qarzi: <b>237 ta — ${formatSum(43_500_000)}</b> (shu oy ${formatSum(41_100_000)} · eski ${formatSum(2_400_000)})`,
      );
      expect(text).toContain(
        `• O'qimayotganlar qarzi: <b>327 ta — ${formatSum(40_600_000)}</b>`,
      );
    });

    it('never adds the two, and the old single «Qarzdorlar» line is gone', async () => {
      const { service } = makeDeps({ reports: reportsWith() });
      const ctx = makeCtx();

      await service.sendFinancialCard(ctx);

      const text = ctx.reply.mock.calls[0][0] as string;
      expect(text).not.toContain('Qarzdorlar');
      expect(text).not.toContain('Jami qarz');
      expect(text).not.toContain(formatSum(43_500_000 + 40_600_000));
      // Their own lines, not one line holding both.
      const debtLines = text.split('\n').filter((l) => l.includes('qarzi:'));
      expect(debtLines).toHaveLength(2);
    });

    it("asks for the group's branch and the card's own month", async () => {
      const reports = reportsWith();
      const { service } = makeDeps({ branchId: 1, reports });
      const ctx = makeCtx();

      await service.sendFinancialCard(ctx);

      // The month is passed explicitly, like the income split's: the card
      // resolves it once, for its title and every figure on it. 08.07.2026 here.
      expect(reports.getDebtSplit).toHaveBeenCalledTimes(1);
      expect(reports.getDebtSplit).toHaveBeenCalledWith(1001, {
        branchIds: [1],
        month: '2026-07',
      });
    });

    it('a group that sees every branch gets the company-wide split', async () => {
      const reports = reportsWith();
      const { service } = makeDeps({
        branchId: null,
        receivesAllBranches: true,
        reports,
      });

      await service.sendFinancialCard(makeCtx());

      expect(reports.getDebtSplit).toHaveBeenCalledWith(1001, {
        branchIds: null,
        month: '2026-07',
      });
    });

    it('nobody owes: both lines still print, as zeros', async () => {
      const { service } = makeDeps({
        reports: reportsWith({
          getDebtSplit: jest.fn().mockResolvedValue({
            studying: { total: 0, count: 0, currentMonth: 0, older: 0 },
            notStudying: { total: 0, count: 0 },
          }),
        }),
      });
      const ctx = makeCtx();

      await service.sendFinancialCard(ctx);

      const text = ctx.reply.mock.calls[0][0] as string;
      expect(text).toContain(
        `• O'qiyotganlar qarzi: <b>0 ta — ${formatSum(0)}</b> (shu oy ${formatSum(0)} · eski ${formatSum(0)})`,
      );
      expect(text).toContain(
        `• O'qimayotganlar qarzi: <b>0 ta — ${formatSum(0)}</b>`,
      );
    });

    it('still sends the card, without the debt lines, when the split cannot be read', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      try {
        const { service } = makeDeps({
          reports: reportsWith({
            getDebtSplit: jest.fn().mockRejectedValue(new Error('boom')),
          }),
        });
        const ctx = makeCtx();

        await service.sendFinancialCard(ctx);

        // One message, and it is the card — not the «Ma'lumot yuklanmadi»
        // apology. A missing line is honest; a zero would claim nobody owes.
        expect(ctx.reply).toHaveBeenCalledTimes(1);
        const text = ctx.reply.mock.calls[0][0] as string;
        expect(text).toContain('Moliyaviy xulosa');
        expect(text).toContain('Tushum (haqiqiy)');
        expect(text).not.toContain('qarzi');
        expect(text).not.toContain('Qarzdorlar');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
      } finally {
        warn.mockRestore();
      }
    });
  });

  it('openMenu posts a fresh menu message with the root keyboard', async () => {
    const { service } = makeDeps();
    const ctx = makeCtx();

    await service.openMenu(ctx);

    expect(ctx.reply).toHaveBeenCalled();
    const kb = JSON.stringify(ctx.reply.mock.calls[0][1]);
    expect(kb).toContain('rm:full');
    expect(kb).toContain('rm:pre');
    expect(kb).toContain('rm:cfin');
  });
});
