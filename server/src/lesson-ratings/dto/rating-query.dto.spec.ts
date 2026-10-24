import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RatingLowQueryDto } from './rating-query.dto';

const parse = (commented?: string) => {
  const dto = plainToInstance(RatingLowQueryDto, { commented });
  return { dto, errors: validateSync(dto) };
};

describe('RatingLowQueryDto.commented', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['0', undefined],
    ['abc', undefined],
    [undefined, undefined],
  ])('parses %s', (raw, want) => {
    const { dto, errors } = parse(raw);
    expect(dto.commented).toBe(want);
    expect(errors).toHaveLength(0);
  });
});
