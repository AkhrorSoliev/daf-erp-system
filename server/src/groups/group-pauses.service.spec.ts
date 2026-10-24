import { GroupPausesService } from './group-pauses.service';

describe('GroupPausesService', () => {
  let tx: any;
  let history: any;
  let service: GroupPausesService;
  const AT = new Date('2026-10-23T08:00:00.000Z');

  beforeEach(() => {
    tx = {
      groupPause: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
        update: jest.fn(),
      },
      group: {
        findUnique: jest.fn().mockResolvedValue({
          statusChangedAt: new Date('2026-10-05T07:57:00.000Z'),
          statusChangeReason: 'ulgurib kelishmadi',
        }),
        update: jest.fn(),
      },
    };
    history = { recordUpdate: jest.fn() };
    service = new GroupPausesService(history);
  });

  it('opens a pause with the planned restart day as a calendar date', async () => {
    await service.open(tx, {
      groupId: 'g',
      companyId: 1001,
      at: AT,
      plannedResumeOn: '2026-11-05',
      reason: 'x',
      userId: 7,
    });
    expect(tx.groupPause.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: 'g',
        plannedResumeOn: new Date('2026-11-05T00:00:00.000Z'),
        source: 'MANUAL',
        startedById: 7,
      }),
    });
  });

  it('keeps the open pause when the group is already paused', async () => {
    tx.groupPause.findFirst.mockResolvedValue({ id: 'old' });
    const r = await service.open(tx, {
      groupId: 'g',
      companyId: 1001,
      at: AT,
      plannedResumeOn: null,
    });
    expect(r).toEqual({ id: 'old' });
    expect(tx.groupPause.create).not.toHaveBeenCalled();
  });

  it('closes the open pause with the restart day and remembers it on the group', async () => {
    tx.groupPause.findFirst.mockResolvedValue({
      id: 'p',
      extendedLessons: 0,
      endDateBefore: null,
    });
    await service.close(tx, {
      groupId: 'g',
      companyId: 1001,
      at: AT,
      resumeOn: '2026-10-23',
      userId: 1,
    });
    expect(tx.groupPause.update).toHaveBeenCalledWith({
      where: { id: 'p' },
      data: {
        endedAt: AT,
        resumeOn: new Date('2026-10-23T00:00:00.000Z'),
        endedById: 1,
      },
    });
    expect(tx.group.update).toHaveBeenCalledWith({
      where: { id: 'g' },
      data: { lastResumedOn: new Date('2026-10-23T00:00:00.000Z') },
    });
  });

  it('writes a closed row for a group paused before pauses were recorded', async () => {
    await service.close(tx, {
      groupId: 'g',
      companyId: 1001,
      at: AT,
      resumeOn: '2026-10-23',
    });
    expect(tx.groupPause.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startedAt: new Date('2026-10-05T07:57:00.000Z'),
        reason: 'ulgurib kelishmadi',
        endedAt: AT,
      }),
    });
  });

  it('gives the end date back when the group ends instead of coming back', async () => {
    const before = new Date('2027-03-21T00:00:00.000Z');
    tx.groupPause.findFirst.mockResolvedValue({
      id: 'p',
      extendedLessons: 4,
      endDateBefore: before,
    });
    await service.close(tx, {
      groupId: 'g',
      companyId: 1001,
      at: AT,
      resumeOn: null,
    });
    expect(tx.group.update).toHaveBeenCalledWith({
      where: { id: 'g' },
      data: { endDate: before },
    });
  });

  it('records a changed restart day in the group history', async () => {
    tx.groupPause.findFirst.mockResolvedValue({
      id: 'p',
      plannedResumeOn: null,
    });
    const r = await service.setPlanned(tx, {
      groupId: 'g',
      companyId: 1001,
      plannedResumeOn: '2026-11-12',
      userId: 3,
    });
    expect(r?.after).toEqual(new Date('2026-11-12T00:00:00.000Z'));
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Group',
        oldValues: { qaytishSanasi: "noma'lum" },
        newValues: { qaytishSanasi: '2026-11-12' },
      }),
    );
  });
});
