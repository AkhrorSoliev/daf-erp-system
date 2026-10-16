import { LeadOwnershipCron } from './lead-ownership.cron';

describe('LeadOwnershipCron.tick', () => {
  it('does not start a second run while one is still going, and recovers after a failure', async () => {
    let release!: () => void;
    const expireOverdue = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise<number>((resolve) => (release = () => resolve(0))),
      )
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(0);
    const cron = new LeadOwnershipCron({ expireOverdue } as never);

    const first = cron.tick();
    await cron.tick();
    expect(expireOverdue).toHaveBeenCalledTimes(1);

    release();
    await first;
    await expect(cron.tick()).rejects.toThrow('boom');
    await cron.tick();
    expect(expireOverdue).toHaveBeenCalledTimes(3);
  });
});
