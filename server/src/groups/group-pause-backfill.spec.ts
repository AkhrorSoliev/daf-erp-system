import { pausesFromHistory, type GroupStatusRow } from './group-pause-backfill';

const row = (
  groupId: string,
  fromStatus: string,
  toStatus: string,
  iso: string,
  reason: string | null = null,
): GroupStatusRow => ({
  groupId,
  companyId: 1001,
  fromStatus,
  toStatus,
  reason,
  changedById: 7,
  createdAt: new Date(iso),
});

describe('pausesFromHistory', () => {
  it('a group still paused gets one open pause', () => {
    const plans = pausesFromHistory([
      row(
        'g1',
        'ACTIVE',
        'PAUSED',
        '2026-10-05T07:57:00Z',
        'ulgurib kelishmadi',
      ),
    ]);
    expect(plans).toEqual([
      expect.objectContaining({
        groupId: 'g1',
        reason: 'ulgurib kelishmadi',
        endedAt: null,
        resumeOn: null,
      }),
    ]);
  });

  it('a pause that ended with ACTIVE names the day the group came back', () => {
    const plans = pausesFromHistory([
      row('g1', 'ACTIVE', 'PAUSED', '2026-10-13T07:41:00Z'),
      row('g1', 'PAUSED', 'ACTIVE', '2026-10-17T07:34:00Z'),
      row('g1', 'ACTIVE', 'PAUSED', '2026-10-20T07:30:00Z'),
    ]);
    expect(plans).toHaveLength(2);
    expect(plans[0]).toEqual(
      expect.objectContaining({
        resumeOn: '2026-10-17',
        endedAt: new Date('2026-10-17T07:34:00Z'),
      }),
    );
    expect(plans[1]).toEqual(expect.objectContaining({ endedAt: null }));
  });

  it('a pause that ended in CANCELLED has no restart day', () => {
    const [p] = pausesFromHistory([
      row('g1', 'ACTIVE', 'PAUSED', '2026-10-13T07:41:00Z'),
      row('g1', 'PAUSED', 'CANCELLED', '2026-10-19T07:00:00Z'),
    ]);
    expect(p.resumeOn).toBeNull();
    expect(p.endedAt).toEqual(new Date('2026-10-19T07:00:00Z'));
  });

  it('keeps groups apart and reads rows in time order', () => {
    const plans = pausesFromHistory([
      row('g2', 'ACTIVE', 'PAUSED', '2026-10-02T00:00:00Z'),
      row('g1', 'PAUSED', 'ACTIVE', '2026-10-17T07:34:00Z'),
      row('g1', 'ACTIVE', 'PAUSED', '2026-10-13T07:41:00Z'),
    ]);
    expect(plans.map((p) => p.groupId).sort()).toEqual(['g1', 'g2']);
    expect(plans.find((p) => p.groupId === 'g1')?.resumeOn).toBe('2026-10-17');
  });
});
