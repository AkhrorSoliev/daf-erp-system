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
  @IsInt({ message: "Sahifa hajmi butun son bo'lsin" })
  @Min(1, { message: "Sahifa hajmi kamida 1 bo'lsin" })
  @Max(100, { message: 'Sahifa hajmi 100 dan oshmasin' })
  pageSize?: number = 50;

  @IsOptional() @Matches(DAY, NOT_A_DAY) startDate?: string;
  @IsOptional() @Matches(DAY, NOT_A_DAY) endDate?: string;
  @IsOptional()
  @IsString({ message: "Qidiruv matn bo'lsin" })
  @MaxLength(100, { message: 'Qidiruv 100 belgidan oshmasin' })
  search?: string;
  @IsOptional()
  @IsIn(['CURRENT', 'ADVANCE', 'LATE'], {
    message: "Noma'lum 'nimaga ketdi' qiymati",
  })
  part?: 'CURRENT' | 'ADVANCE' | 'LATE';
  @IsOptional()
  @IsIn(['ADMIN', 'ONLINE'], { message: "Noma'lum manba qiymati" })
  source?: 'ADMIN' | 'ONLINE';
  /** «Kim qabul qildi: Onlayn»; with `receivedById` the two are OR-ed. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: "Onlayn qiymati noto'g'ri" })
  online?: boolean;
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray({ message: "To'lov usullari ro'yxat bo'lsin" })
  @IsEnum(PaymentMethod, { each: true, message: "Noma'lum to'lov usuli" })
  method?: PaymentMethod[];
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray({ message: "Guruhlar ro'yxat bo'lsin" })
  @IsUUID('4', { each: true, message: "Guruh identifikatori noto'g'ri" })
  groupId?: string[];
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray({ message: "Kurslar ro'yxat bo'lsin" })
  @IsUUID('4', { each: true, message: "Kurs identifikatori noto'g'ri" })
  courseId?: string[];
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray({ message: "Ustozlar ro'yxat bo'lsin" })
  @IsInt({ each: true, message: "Ustoz identifikatori noto'g'ri" })
  teacherId?: number[];
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray({ message: "Qabul qilganlar ro'yxat bo'lsin" })
  @IsInt({ each: true, message: "Qabul qilgan xodim identifikatori noto'g'ri" })
  receivedById?: number[];
  @IsOptional()
  @IsIn(['COMPLETED', 'REVERSED', 'ALL'], { message: "Noma'lum holat qiymati" })
  status?: 'COMPLETED' | 'REVERSED' | 'ALL';
}
