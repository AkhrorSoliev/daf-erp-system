import { KpiRecorderListener } from './kpi-recorder.listener';

describe('KpiRecorderListener', () => {
  const setup = () => {
    const results = {
      recordForPayment: jest.fn().mockResolvedValue([]),
      cancelForPayment: jest.fn().mockResolvedValue(0),
    };
    return { results, listener: new KpiRecorderListener(results as never) };
  };

  it('records a received payment and cancels a reversed one with its correction flag', async () => {
    const s = setup();
    await s.listener.onReceived({ paymentId: 'p1' } as never);
    expect(s.results.recordForPayment).toHaveBeenCalledWith('p1');

    await s.listener.onReversed({ paymentId: 'p1', correction: true } as never);
    expect(s.results.cancelForPayment).toHaveBeenCalledWith('p1', {
      correction: true,
    });
    await s.listener.onReversed({ paymentId: 'p3' } as never);
    expect(s.results.cancelForPayment).toHaveBeenLastCalledWith('p3', {
      correction: false,
    });
  });

  it('never lets a failure reach the payment — the nightly run heals it', async () => {
    const s = setup();
    s.results.recordForPayment.mockRejectedValue(new Error('db down'));
    s.results.cancelForPayment.mockRejectedValue(new Error('db down'));
    await expect(
      s.listener.onReceived({ paymentId: 'p1' } as never),
    ).resolves.toBeUndefined();
    await expect(
      s.listener.onReversed({ paymentId: 'p1' } as never),
    ).resolves.toBeUndefined();
  });
});
