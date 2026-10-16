import { PersonalReportCron } from './personal-report.cron';

const FRI_1830 = new Date('2026-10-16T13:30:00Z'); // Friday 18:30 Tashkent
const SUN = new Date('2026-10-18T13:30:00Z');
const TODAY = new Date('2026-10-16T00:00:00.000Z');

function setup(due = [{ id: 1, lastSentDate: null }]) {
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
    expect(holidays.findActiveHolidayCovering).toHaveBeenCalledWith(
      FRI_1830,
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
});
