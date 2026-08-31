import {
  IsArray,
  IsBooleanString,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { LeadStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toStringArray } from '../../common/dto/to-array';

export class LeadQueryDto extends PaginationDto {
  // Free-text search across first name, last name and phone.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  sourceId?: string[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  columnId?: string[];

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  // "true" → only leads already marked called (calledAt set); "false" → only
  // not-yet-called leads. Omitted → no contact filter.
  @IsOptional()
  @IsBooleanString()
  called?: string;

  // "true" → only leads with at least one comment; "false" → only leads with
  // none. Omitted → no comment filter.
  @IsOptional()
  @IsBooleanString()
  hasComments?: string;

  // createdAt range (yyyy-MM-dd).
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
