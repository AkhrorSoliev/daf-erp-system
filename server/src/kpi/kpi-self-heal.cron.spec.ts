import { KpiSelfHealCron } from './kpi-self-heal.cron';

describe('KpiSelfHealCron.tick', () => {
  it('does not start a second run while one is still going, and recovers after a failure', async () => {
    let release!: () => void;
    const selfHeal = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ cancelled: 0, written: 0 });
          }),
      )
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ cancelled: 0, written: 0 });
    const cron = new KpiSelfHealCron({ selfHeal } as never);

    const first = cron.tick();
    await cron.tick();
    expect(selfHeal).toHaveBeenCalledTimes(1);

    release();
    await first;
    await expect(cron.tick()).rejects.toThrow('boom');
    await cron.tick();
    expect(selfHeal).toHaveBeenCalledTimes(3);
  });
});
