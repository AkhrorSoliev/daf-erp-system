import { TelegramGroupReportMenuService } from './telegram-group-report-menu.service';

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

function makeDeps(overrides: { groupStatus?: string; systemStartDate?: Date | null } = {}) {
  const prisma: any = {
    telegramGroup: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'g1',
        companyId: 1001,
        chatId: 111n,
        branchId: null,
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
          overrides.systemStartDate === undefined ? null : overrides.systemStartDate,
      }),
    },
    branch: {
      findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Asosiy' }]),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
  };
  const reportsExcel: any = {
    generate: jest.fn().mockResolvedValue(Buffer.from('xlsx-bytes')),
  };
  const reportsFinancial: any = {
    getFinancialOverview: jest.fn().mockResolvedValue({
      income: { actual: 280_000_000, byMethod: [] },
      forecast: {
        recognizedRevenueForecast: 420_000_000,
        outstandingReceivable: -22_300_000,
        debtorExposure: { count: 48, avgDebt: 0 },
      },
      salary: { paid: 30_000_000, pending: 0, advances: 0 },
      expenses: 95_000_000,
      netProfit: 185_000_000,
    }),
  };
  const service = new TelegramGroupReportMenuService(
    prisma,
    reportsExcel,
    reportsFinancial,
        null
  );
  return { service, prisma, reportsExcel, reportsFinancial };
}

describe('TelegramGroupReportMenuService', () => {
  beforeEach(() => {
    // 2026-07-08 Tashkent → floor 2026-05, current 2026-07.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-08T16:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('moreButton() carries the rm:open callback', () => {
    const kb = JSON.stringify(TelegramGroupReportMenuService.moreButton());
    expect(kb).toContain('rm:open');
    expect(kb).toContain("Ko'proq imkoniyatlar");
  });

  it('sendMonthExcel generates a single-month workbook with no comparison', async () => {
    const { service, reportsExcel } = makeDeps();
    const ctx = makeCtx();

    await service.sendMonthExcel(ctx, '2026-06');

    expect(reportsExcel.generate).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        compareModes: [],
        performedById: 7,
        companyName: 'DaF Sprachzentrum',
      }),
    );
    const [, extra] = ctx.replyWithDocument.mock.calls[0];
    expect(ctx.replyWithDocument.mock.calls[0][0]).toEqual(
      expect.objectContaining({ filename: 'moliyaviy-hisobot-2026-06.xlsx' }),
    );
    expect(extra.caption).toContain("To'liq moliyaviy hisobot — 06.2026");
  });

  it('sendComparisonExcel puts the LATER month as the period and the earlier as compare', async () => {
    const { service, reportsExcel } = makeDeps();
    const ctx = makeCtx();

    // Pass reversed to prove ordering: earlier=2026-05, later=2026-06.
    await service.sendComparisonExcel(ctx, '2026-06', '2026-05');

    expect(reportsExcel.generate).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        compareModes: ['custom'],
        compareStartDate: '2026-05-01',
        compareEndDate: '2026-05-31',
      }),
    );
    expect(ctx.replyWithDocument.mock.calls[0][0].filename).toBe(
      'taqqoslash-2026-06-vs-2026-05.xlsx',
    );
  });

  it('sendYearlyExcel spans the full year with the yearly comparison sheet', async () => {
    const { service, reportsExcel } = makeDeps();
    const ctx = makeCtx();

    await service.sendYearlyExcel(ctx, 2026);

    expect(reportsExcel.generate).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        compareModes: ['yearly'],
      }),
    );
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
        compareModes: [],
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
    const { service } = makeDeps({ systemStartDate: new Date('2026-06-01T00:00:00Z') });
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
    ctx.replyWithDocument.mockRejectedValueOnce({ response: { error_code: 403 } });

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

  it('openMenu posts a fresh menu message with the root keyboard', async () => {
    const { service } = makeDeps();
    const ctx = makeCtx();

    await service.openMenu(ctx);

    expect(ctx.reply).toHaveBeenCalled();
    const kb = JSON.stringify(ctx.reply.mock.calls[0][1]);
    expect(kb).toContain('rm:full');
    expect(kb).toContain('rm:cmp');
    expect(kb).toContain('rm:pre');
    expect(kb).toContain('rm:cfin');
  });
});
