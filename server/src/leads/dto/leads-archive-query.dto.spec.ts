import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LeadsArchiveQueryDto } from './leads-archive-query.dto';

const check = (raw: object) => {
  const dto = plainToInstance(LeadsArchiveQueryDto, raw);
  return { dto, errors: validateSync(dto) };
};

describe('LeadsArchiveQueryDto', () => {
  it('treats empty dates as absent', () => {
    const { dto, errors } = check({ startDate: '', endDate: '' });
    expect(errors).toHaveLength(0);
    expect(dto.startDate).toBeUndefined();
    expect(dto.endDate).toBeUndefined();
  });

  it('rejects a malformed date and keeps a good one', () => {
    expect(check({ startDate: '01.10.2026' }).errors).toHaveLength(1);
    expect(check({ startDate: '2026-10-01' }).errors).toHaveLength(0);
  });

  it('reads comma-separated deletedById and refuses ids beyond int4', () => {
    expect(check({ deletedById: '5,9' }).dto.deletedById).toEqual([5, 9]);
    expect(check({ deletedById: '99999999999' }).errors).toHaveLength(1);
  });
});
