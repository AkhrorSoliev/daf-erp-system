import {
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { FUNNEL_STAGES, UNPAID_STATUS_BUCKETS } from './lead-funnel.math';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class LeadFunnelQueryDto {
  /** Sarlavhadagi filial tanlagichi `x-branch-id` orqali keladi; bu faqat qabul qilinadi. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Matches(DATE, { message: "Sana YYYY-MM-DD shaklida bo'lishi kerak" })
  startDate?: string;

  @IsOptional()
  @Matches(DATE, { message: "Sana YYYY-MM-DD shaklida bo'lishi kerak" })
  endDate?: string;
}

export const PEOPLE_STAGES = [...FUNNEL_STAGES, 'unpaid'] as const;

export class LeadFunnelPeopleQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Matches(DATE, { message: "Sana YYYY-MM-DD shaklida bo'lishi kerak" })
  startDate?: string;

  @IsOptional()
  @Matches(DATE, { message: "Sana YYYY-MM-DD shaklida bo'lishi kerak" })
  endDate?: string;

  @IsIn(PEOPLE_STAGES)
  stage!: (typeof PEOPLE_STAGES)[number];

  @IsOptional()
  @IsIn(['all', 'stuck'])
  mode?: 'all' | 'stuck' = 'all';

  /** Manba id'si yoki `none` (manbasizlar). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceId?: string;

  /** To'lamaganlar ro'yxatini holat bo'yicha toraytirish. */
  @IsOptional()
  @IsIn(UNPAID_STATUS_BUCKETS)
  status?: (typeof UNPAID_STATUS_BUCKETS)[number];
}
