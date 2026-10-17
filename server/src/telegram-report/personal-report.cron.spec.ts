import { PersonalReportCron } from './personal-report.cron';

const FRI_1830 = new Date('2026-10-16T13:30:00Z'); // Friday 18:30 Tashkent
const SUN = new Date('2026-10-18T13:30:00Z');
const TODAY = new Date('2026-10-16T00:00:00.000Z');

function setup(
  due: { id: number; lastSentDate: Date | null }[] = [
    { id: 1, lastSentDate: null },
  ],
) {
  const prisma = {
    telegramReportRecipient: {
      findMany: jest.fn().mockResolvedValue(due),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const holidays = {
    findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
  };
  const reports = { deliver: jest.fn().mockResolvedValue({ ok: true }) };
  const cron = new PersonalReportCron(
    prisma as never,
    holidays as never,
    reports as never,
  );
  return { cron, prisma, holidays, reports };
}

describe('PersonalReportCron', () => {
  it('skips Sundays', async () => {
    const { cron, prisma } = setup();
    expect(await cron.run(SUN)).toBe(0);
    expect(prisma.telegramReportRecipient.findMany).not.toHaveBeenCalled();
  });

  it('skips a company-wide holiday', async () => {
    const { cron, holidays, prisma } = setup();
    holidays.findActiveHolidayCovering.mockResolvedValue({
      id: 1,
      name: 'Bayram',
    });
    expect(await cron.run(FRI_1830)).toBe(0);
    // The date-only Tashkent day (UTC midnight), never the instant.
    expect(holidays.findActiveHolidayCovering).toHaveBeenCalledWith(
      TODAY,
      null,
    );
    expect(prisma.telegramReportRecipient.findMany).not.toHaveBeenCalled();
  });

  it("picks active recipients whose time has come and who have not had today's report", async () => {
    const { cron, prisma } = setup();
    await cron.run(FRI_1830);
    expect(prisma.telegramReportRecipient.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        sendTime: { lte: '18:30' },
        OR: [{ lastSentDate: null }, { lastSentDate: { lt: TODAY } }],
      },
    });
  });

  it('claims before sending and counts a send', async () => {
    const { cron, prisma, reports } = setup();
    expect(await cron.run(FRI_1830)).toBe(1);
    expect(prisma.telegramReportRecipient.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        OR: [{ lastSentDate: null }, { lastSentDate: { lt: TODAY } }],
      },
      data: { lastSentDate: TODAY },
    });
    expect(reports.deliver).toHaveBeenCalledTimes(1);
  });

  it('a claim another instance won is skipped', async () => {
    const { cron, prisma, reports } = setup();
    prisma.telegramReportRecipient.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    expect(await cron.run(FRI_1830)).toBe(0);
    expect(reports.deliver).not.toHaveBeenCalled();
  });

  it('a transient failure gives the claim back; a permanent one keeps it', async () => {
    const { cron, prisma, reports } = setup([
      { id: 1, lastSentDate: null },
      { id: 2, lastSentDate: null },
    ]);
    reports.deliver
      .mockResolvedValueOnce({
        ok: false,
        reason: 'SEND_FAILED',
        kind: 'transient',
        description: 'x',
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: 'SEND_FAILED',
        kind: 'permanent',
        description: 'y',
      });
    await cron.run(FRI_1830);
    const releases =
      prisma.telegramReportRecipient.updateMany.mock.calls.filter(
        (c) => c[0].where.lastSentDate,
      );
    expect(releases).toEqual([
      [{ where: { id: 1, lastSentDate: TODAY }, data: { lastSentDate: null } }],
    ]);
  });

  it('one recipient throwing does not stop the next', async () => {
    const { cron, reports } = setup([
      { id: 1, lastSentDate: null },
      { id: 2, lastSentDate: null },
    ]);
    reports.deliver
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce({ ok: true });
    expect(await cron.run(FRI_1830)).toBe(1);
  });
  it('a claim DB error for one recipient does not stop the next', async () => {
    const { cron, prisma, reports } = setup([
      { id: 1, lastSentDate: null },
      { id: 2, lastSentDate: null },
    ]);
    prisma.telegramReportRecipient.updateMany.mockRejectedValueOnce(
      new Error('db'),
    );
    expect(await cron.run(FRI_1830)).toBe(1);
    expect(reports.deliver).toHaveBeenCalledTimes(1);
    expect(reports.deliver.mock.calls[0][0].id).toBe(2);
  });

  it('a failed give-back for one recipient does not stop the next', async () => {
    const { cron, prisma, reports } = setup([
      { id: 1, lastSentDate: null },
      { id: 2, lastSentDate: null },
    ]);
    reports.deliver
      .mockResolvedValueOnce({ ok: false, reason: 'NO_BOT' })
      .mockResolvedValueOnce({ ok: true });
    prisma.telegramReportRecipient.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim 1
      .mockRejectedValueOnce(new Error('db')); // give-back 1
    expect(await cron.run(FRI_1830)).toBe(1);
    expect(reports.deliver).toHaveBeenCalledTimes(2);
  });

  it('NO_BOT restores the claim to the previous lastSentDate', async () => {
    const prev = new Date('2026-10-15T00:00:00.000Z');
    const { cron, prisma, reports } = setup([{ id: 1, lastSentDate: prev }]);
    reports.deliver.mockResolvedValueOnce({ ok: false, reason: 'NO_BOT' });
    expect(await cron.run(FRI_1830)).toBe(0);
    expect(prisma.telegramReportRecipient.updateMany).toHaveBeenLastCalledWith({
      where: { id: 1, lastSentDate: TODAY },
      data: { lastSentDate: prev },
    });
  });

  it('a thrown deliver restores the claim', async () => {
    const { cron, prisma, reports } = setup([{ id: 1, lastSentDate: null }]);
    reports.deliver.mockRejectedValueOnce(new Error('boom'));
    expect(await cron.run(FRI_1830)).toBe(0);
    expect(prisma.telegramReportRecipient.updateMany).toHaveBeenLastCalledWith({
      where: { id: 1, lastSentDate: TODAY },
      data: { lastSentDate: null },
    });
  });
});
