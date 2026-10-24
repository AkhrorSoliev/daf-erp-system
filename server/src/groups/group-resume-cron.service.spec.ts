import { GroupResumeCronService } from './group-resume-cron.service';

// 05.11.2026 00:10 Tashkent
const NOW = new Date('2026-11-04T19:10:00.000Z');

describe('GroupResumeCronService', () => {
  let prisma: any;
  let status: any;
  let service: GroupResumeCronService;

  beforeEach(() => {
    prisma = {
      groupPause: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ groupId: 'g1', companyId: 1001 }]),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    status = { changeStatus: jest.fn().mockResolvedValue({}) };
    service = new GroupResumeCronService(prisma, status);
  });

  it('asks only for paused groups whose resume day has come', async () => {
    await service.run(NOW);
    expect(prisma.groupPause.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          endedAt: null,
          resumeOn: { not: null, lte: new Date('2026-11-05T00:00:00.000Z') },
          group: { deletedAt: null, statusEnum: 'PAUSED' },
        }),
      }),
    );
  });

  it('resumes through changeStatus with today as the restart day', async () => {
    expect(await service.run(NOW)).toEqual({ resumed: 1, failed: 0 });
    expect(status.changeStatus).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ status: 'ACTIVE', resumeOn: '2026-11-05' }),
      1,
      1001,
    );
  });

  it('counts a failure and goes on', async () => {
    prisma.groupPause.findMany.mockResolvedValue([
      { groupId: 'g1', companyId: 1001 },
      { groupId: 'g2', companyId: 1001 },
    ]);
    status.changeStatus.mockRejectedValueOnce(new Error('boom'));
    expect(await service.run(NOW)).toEqual({ resumed: 1, failed: 1 });
  });

  it('fails a company that has no CEO instead of resuming as nobody', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    expect(await service.run(NOW)).toEqual({ resumed: 0, failed: 1 });
    expect(status.changeStatus).not.toHaveBeenCalled();
  });
});
