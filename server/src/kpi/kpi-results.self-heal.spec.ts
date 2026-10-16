import { CANCEL_REASON } from './kpi-rules';
import { setupKpiResults } from './kpi-results.testing';

describe('KpiResultsService.selfHeal', () => {
  const NOW = new Date('2026-10-22T22:30:00Z');

  it('cancels the results of payments that no longer stand and walks the last two days again', async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.findMany.mockResolvedValue([
      { paymentId: 'p1' },
      { paymentId: 'p3' },
    ]);
    s.prisma.payment.findMany
      .mockResolvedValueOnce([{ id: 'p1' }])
      .mockResolvedValueOnce([{ id: 'p2' }, { id: 'p4' }]);
    s.prisma.payment.findFirst.mockResolvedValue({ id: 'p2' });
    const cancel = jest
      .spyOn(s.service, 'cancelForPayment')
      .mockResolvedValue(1);
    const record = jest
      .spyOn(s.service, 'recordForPayment')
      .mockResolvedValue([{} as never]);

    await expect(s.service.selfHeal(NOW)).resolves.toEqual({
      cancelled: 1,
      written: 3,
    });

    expect(s.prisma.payment.findMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ['p1', 'p3'] }, status: { not: 'COMPLETED' } },
      select: { id: true },
    });
    // p1 was corrected by p2: its results move, they are not "reversed".
    expect(s.prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { correctsPaymentId: 'p1' },
      select: { id: true },
    });
    expect(cancel).toHaveBeenCalledWith('p1', { correction: true }, NOW);
    expect(s.prisma.payment.findMany.mock.calls[1][0].where).toEqual({
      status: 'COMPLETED',
      createdAt: { gte: new Date(NOW.getTime() - 2 * 86_400_000) },
    });
    expect(record.mock.calls.map((c) => c[0])).toEqual(['p2', 'p2', 'p4']);
  });

  it('a plain reversal (no payment corrects it) is cancelled as a reversal', async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.findMany.mockResolvedValue([{ paymentId: 'p1' }]);
    s.prisma.payment.findMany
      .mockResolvedValueOnce([{ id: 'p1' }])
      .mockResolvedValueOnce([]);
    s.prisma.payment.findFirst.mockResolvedValue(null);
    const cancel = jest
      .spyOn(s.service, 'cancelForPayment')
      .mockResolvedValue(2);

    await expect(s.service.selfHeal(NOW)).resolves.toEqual({
      cancelled: 2,
      written: 0,
    });
    expect(cancel).toHaveBeenCalledWith('p1', { correction: false }, NOW);
  });

  it("a corrected payment's results are cancelled with the CORRECTED reason (the reason the move looks them up by)", async () => {
    const s = setupKpiResults({ enabled: false });
    // The real cancelForPayment: selfHeal lists the standing payments, then the cancel lists the ACTIVE rows.
    s.prisma.kpiResult.findMany
      .mockResolvedValueOnce([{ paymentId: 'p1' }]) // standing
      .mockResolvedValueOnce([
        { id: 'r1', type: 'LEAD_PAID', studentId: 10500, companyId: 1001 },
      ]) // cancelForPayment's ACTIVE rows
      .mockResolvedValue([]);
    s.prisma.payment.findMany
      .mockResolvedValueOnce([{ id: 'p1' }])
      .mockResolvedValueOnce([]);
    s.prisma.payment.findFirst.mockResolvedValue({ id: 'p2' });
    s.prisma.kpiResult.updateMany.mockResolvedValue({ count: 1 });

    await s.service.selfHeal(NOW);

    expect(s.prisma.kpiResult.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cancelReason: CANCEL_REASON.CORRECTED,
        }),
      }),
    );
  });

  it('one failing payment does not stop the run', async () => {
    const s = setupKpiResults();
    // No standing result: only the recent payments are read.
    s.prisma.kpiResult.findMany.mockResolvedValue([]);
    s.prisma.payment.findMany.mockResolvedValueOnce([
      { id: 'p2' },
      { id: 'p4' },
    ]);
    jest
      .spyOn(s.service, 'recordForPayment')
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce([{} as never]);
    await expect(s.service.selfHeal(NOW)).resolves.toEqual({
      cancelled: 0,
      written: 1,
    });
  });
});
