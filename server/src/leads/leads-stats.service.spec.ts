import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LeadsStatsService, leadStatsRange } from './leads-stats.service';
import { LeadStatsQueryDto } from './dto/lead-stats-query.dto';

// Thursday 2026-10-08, 02:00 Tashkent (still 07.10 in UTC).
const NOW = new Date('2026-10-07T21:00:00Z');

describe('leadStatsRange', () => {
  it('reads the Tashkent day, not the UTC one', () => {
    expect(leadStatsRange('month', NOW)).toEqual({
      gte: new Date('2026-09-30T19:00:00Z'),
      lt: new Date('2026-10-08T19:00:00Z'),
    });
  });

  it('starts the week on Monday', () => {
    expect(leadStatsRange('week', NOW).gte).toEqual(
      new Date('2026-10-04T19:00:00Z'),
    );
  });

  it('covers the whole previous month', () => {
    expect(leadStatsRange('last-month', NOW)).toEqual({
      gte: new Date('2026-08-31T19:00:00Z'),
      lt: new Date('2026-09-30T19:00:00Z'),
    });
  });
});

describe('LeadsStatsService', () => {
  const prisma = {
    lead: { count: jest.fn(), groupBy: jest.fn() },
    leadSource: { findMany: jest.fn() },
  };
  const service = new LeadsStatsService(prisma as never);
  const scope = [3];
  const branch = { OR: [{ branchId: { in: [3] } }, { branchId: null }] };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.lead.count.mockResolvedValue(0);
    prisma.lead.groupBy.mockResolvedValue([
      { sourceId: 's1', _count: { _all: 70 } },
      { sourceId: 's2', _count: { _all: 37 } },
    ]);
    prisma.leadSource.findMany.mockResolvedValue([
      { id: 's2', name: 'Instagram' },
      { id: 's1', name: 'Tanishlar' },
    ]);
  });

  const countWheres = () =>
    prisma.lead.count.mock.calls.map(([arg]) => arg.where);

  it('counts board leads only, inside the branch scope', async () => {
    await service.getStats(1, scope, 'month', NOW);
    for (const where of countWheres()) {
      expect(where).toMatchObject({
        companyId: 1,
        sectionId: { not: null },
        ...branch,
      });
    }
  });

  it('builds each figure from its own predicate', async () => {
    await service.getStats(1, scope, 'month', NOW);
    const range = leadStatsRange('month', NOW);
    const [onBoard, uncalled, overWeek, created, converted, lost] =
      countWheres();
    expect(onBoard).toMatchObject({
      deletedAt: null,
      statusEnum: { not: 'CONVERTED' },
    });
    expect(uncalled).toMatchObject({ deletedAt: null, calledAt: null });
    expect(overWeek.createdAt).toEqual({
      lt: new Date('2026-09-30T21:00:00Z'),
    });
    expect(created).toEqual(expect.objectContaining({ createdAt: range }));
    expect(created).not.toHaveProperty('deletedAt');
    expect(converted).toMatchObject({
      statusEnum: 'CONVERTED',
      statusChangedAt: range,
    });
    expect(lost).toMatchObject({ statusEnum: 'LOST', statusChangedAt: range });
  });

  it('names the two largest sources, skipping leads with none', async () => {
    const res = await service.getStats(1, scope, 'month', NOW);
    expect(prisma.lead.groupBy.mock.calls[0][0]).toMatchObject({
      where: { sourceId: { not: null } },
      take: 2,
    });
    expect(res.flow.topSources).toEqual([
      { name: 'Tanishlar', count: 70 },
      { name: 'Instagram', count: 37 },
    ]);
  });
});

describe('LeadStatsQueryDto', () => {
  const errors = (period: unknown) =>
    validateSync(plainToInstance(LeadStatsQueryDto, { period }));

  it('accepts the three periods and none', () => {
    expect(errors(undefined)).toHaveLength(0);
    for (const p of ['week', 'month', 'last-month']) {
      expect(errors(p)).toHaveLength(0);
    }
  });

  it('rejects anything else', () => {
    expect(errors('year')).toHaveLength(1);
  });
});
