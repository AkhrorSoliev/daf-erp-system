import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CenterActivityService } from './center-activity.service';
import type { CenterFacts } from './center-activity.types';

const d = (s: string) => new Date(s);
const W = { start: '08:00', end: '22:30' };

const room = (
  id: string,
  branchId: number,
  branchName: string,
  createdAt: string,
) => ({
  id,
  name: `${id}-xona`,
  branchId,
  branchName,
  createdAt: d(createdAt),
  deletedAt: null,
  status: 'ACTIVE' as const,
  capacityNow: 16,
  capacityHistory: [],
  window: W,
});

const facts: CenterFacts = {
  rooms: [room('r1', 1, "Farg'ona", '2026-05-01T00:00:00Z')],
  groups: [],
  courses: new Map(),
};

describe('CenterActivityService', () => {
  const loader = { load: jest.fn().mockResolvedValue(facts) };
  const service = new CenterActivityService(loader as never);

  beforeEach(() => {
    loader.load.mockReset();
    loader.load.mockResolvedValue(facts);
  });

  it('refuses an empty scope before reading anything', async () => {
    await expect(service.overview(1001, [], {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('refuses a bad month and a future month', async () => {
    await expect(
      service.overview(1001, null, { oy: '2026-04' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.overview(1001, null, { oy: '2999-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reads the whole range once and answers', async () => {
    const out = await service.overview(1001, [1], { oy: '2026-09' });
    expect(out.month).toBe('2026-09');
    expect(loader.load).toHaveBeenCalledTimes(1);
    const [company, scope, firstAt, lastAt] = loader.load.mock.calls[0];
    expect(company).toBe(1001);
    expect(scope).toEqual([1]);
    // 2026-05 starts 2026-04-30T19:00Z in Tashkent; 2026-09 ends 2026-09-30T18:59:59.999Z
    expect(firstAt.toISOString()).toBe('2026-04-30T19:00:00.000Z');
    expect(lastAt.toISOString()).toBe('2026-09-30T18:59:59.999Z');
    expect(out.months.map((m) => m.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('turns a branch outside the caller scope into 400', async () => {
    await expect(
      service.overview(1001, [1], { oy: '2026-09', filial: 99 }),
    ).rejects.toEqual(
      new BadRequestException("Bu filial tanlangan qamrovda yo'q"),
    );
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('falls back to the first branch when the picked in-scope branch has no rooms yet that month', async () => {
    // branch 2 opened in July; viewed in June it has no room, so the heat is for branch 1
    loader.load.mockResolvedValue({
      ...facts,
      rooms: [
        room('r1', 1, "Farg'ona", '2026-05-01T00:00:00Z'),
        room('r2', 2, 'Namangan', '2026-07-10T00:00:00Z'),
      ],
    });
    const out = await service.overview(1001, [1, 2], {
      oy: '2026-06',
      filial: 2,
    });
    expect(out.heat?.branchId).toBe(1);
    expect(out.branches.map((b) => b.id)).toEqual([1]);
  });

  it('honours an in-scope branch that has rooms, for a company-wide caller too', async () => {
    loader.load.mockResolvedValue({
      ...facts,
      rooms: [
        room('r1', 1, "Farg'ona", '2026-05-01T00:00:00Z'),
        room('r2', 2, 'Namangan', '2026-05-01T00:00:00Z'),
      ],
    });
    const out = await service.overview(1001, null, {
      oy: '2026-09',
      filial: 2,
    });
    expect(out.heat?.branchId).toBe(2);
  });

  it('excel builds the workbook of the month and names the file after it', async () => {
    const out = await service.excel(1001, [1], { oy: '2026-09' });
    expect(out.filename).toBe('markaz-faoliyati-2026-09.xlsx');
    expect(out.buffer.length).toBeGreaterThan(0);
    expect(loader.load).toHaveBeenCalledTimes(1);
  });

  it('excel refuses an empty scope before reading anything', async () => {
    await expect(service.excel(1001, [], {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(loader.load).not.toHaveBeenCalled();
  });
});
