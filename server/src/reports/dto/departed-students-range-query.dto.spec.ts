import { ValidationPipe } from '@nestjs/common';
import { DepartedStudentsRangeQueryDto } from './departed-students-range-query.dto';

/**
 * The departed-students dynamics chart sends a Tashkent day range. These run
 * the REAL pipe with the REAL global settings (main.ts), so the date format
 * is checked at the door, like every other report range.
 */
describe('DepartedStudentsRangeQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = {
    type: 'query' as const,
    metatype: DepartedStudentsRangeQueryDto,
  };

  it('accepts the exact query the dynamics chart sends', async () => {
    const out: unknown = await pipe.transform(
      { branchId: '1', startDate: '2026-07-01', endDate: '2026-09-30' },
      meta,
    );
    expect(out).toEqual({
      branchId: 1,
      startDate: '2026-07-01',
      endDate: '2026-09-30',
    });
  });

  it.each(['', '2026-7-1', '01.07.2026', 'xyz', '2026-07-01T00:00:00Z'])(
    'rejects %p as a start or an end date',
    async (bad) => {
      await expect(
        pipe.transform({ startDate: bad, endDate: '2026-09-30' }, meta),
      ).rejects.toThrow();
      await expect(
        pipe.transform({ startDate: '2026-07-01', endDate: bad }, meta),
      ).rejects.toThrow();
    },
  );

  it('requires both dates', async () => {
    await expect(
      pipe.transform({ startDate: '2026-07-01' }, meta),
    ).rejects.toThrow();
    await expect(
      pipe.transform({ endDate: '2026-09-30' }, meta),
    ).rejects.toThrow();
  });
});
