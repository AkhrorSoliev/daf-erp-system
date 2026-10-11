import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { toNumberArray, toStringArray } from '../../../common/dto/to-array';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NOT_A_DAY = { message: "Bunday sana kalendarda yo'q" };

/** The page's period (spec B4 §3.3); both required — checked in `parsePaymentPeriod` with the page's own messages. */
export class PaymentPeriodDto {
  @IsOptional() @Matches(DAY, NOT_A_DAY) startDate?: string;
  @IsOptional() @Matches(DAY, NOT_A_DAY) endDate?: string;
}

/** `GET /payments/list/rows` (spec B4 §5.2). Multi-value filters are comma lists. */
export class PaymentListQueryDto extends PaginationDto {
  /** The page shows 50 or 100 rows (spec §3.7); `PaginationDto` defaults to 10. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;

  @IsOptional() @Matches(DAY, NOT_A_DAY) startDate?: string;
  @IsOptional() @Matches(DAY, NOT_A_DAY) endDate?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional()
  @IsIn(['CURRENT', 'ADVANCE', 'LATE'])
  part?: 'CURRENT' | 'ADVANCE' | 'LATE';
  @IsOptional() @IsIn(['ADMIN', 'ONLINE']) source?: 'ADMIN' | 'ONLINE';
  /** «Kim qabul qildi: Onlayn»; with `receivedById` the two are OR-ed. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  online?: boolean;
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(PaymentMethod, { each: true })
  method?: PaymentMethod[];
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsUUID('4', { each: true })
  groupId?: string[];
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsUUID('4', { each: true })
  courseId?: string[];
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  teacherId?: number[];
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  receivedById?: number[];
  @IsOptional()
  @IsIn(['COMPLETED', 'REVERSED', 'ALL'])
  status?: 'COMPLETED' | 'REVERSED' | 'ALL';
}
