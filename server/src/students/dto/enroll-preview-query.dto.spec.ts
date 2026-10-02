import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EnrollPreviewQueryDto } from './enroll-preview-query.dto';

async function rejected(query: object) {
  const dto = plainToInstance(EnrollPreviewQueryDto, query);
  return (
    await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  ).map((e) => e.property);
}

describe('EnrollPreviewQueryDto', () => {
  it('accepts a group with no start day, and with a YYYY-MM-DD start day', async () => {
    expect(await rejected({ groupId: 'grp-1' })).toEqual([]);
    expect(
      await rejected({ groupId: 'grp-1', startDate: '2026-10-17' }),
    ).toEqual([]);
  });

  it('refuses a missing or empty group', async () => {
    expect(await rejected({})).toEqual(['groupId']);
    expect(await rejected({ groupId: '' })).toEqual(['groupId']);
  });

  it.each(['2026-10-7', '17.10.2026', '2026-10-17T00:00:00.000Z', 'ertaga'])(
    'refuses the start day %s',
    async (startDate) => {
      expect(await rejected({ groupId: 'grp-1', startDate })).toEqual([
        'startDate',
      ]);
    },
  );
});
