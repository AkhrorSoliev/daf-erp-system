import {
  IsArray,
  IsBooleanString,
  IsDateString,
  IsEnum,
  IsIn,
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

  // Bosqich filtri — bir nechta bosqich birga tanlanishi mumkin.
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(LeadStatus, { each: true })
  status?: LeadStatus[];

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

  /**
   * Sana oralig'i qaysi maydonga tushishi. Standart `createdAt` (lid qachon
   * kelgani). `statusChangedAt` — lid qachon o'quvchiga aylangani; "shu oyda
   * nechta odam o'quvchi bo'ldi" savoliga aynan shu javob beradi.
   */
  @IsOptional()
  @IsIn(['createdAt', 'statusChangedAt'])
  dateField?: 'createdAt' | 'statusChangedAt';

  // createdAt range (yyyy-MM-dd).
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
