import { Transform } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toNumberArray } from '../../common/dto/to-array';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak";
// A cleared date input arrives as "" — that means "no bound", not a bad date.
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class LeadsArchiveQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Comma-separated user ids ("Kim tomonidan"); the column is an int4. */
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  @Max(2147483647, { each: true })
  deletedById?: number[];

  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(DAY, { message: DAY_MESSAGE })
  startDate?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(DAY, { message: DAY_MESSAGE })
  endDate?: string;
}
