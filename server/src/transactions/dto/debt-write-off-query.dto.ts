import { IsBooleanString, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params for `GET /transactions/debt-write-offs` — the audit log
 * page for the "yo'qolgan o'quvchi" write-off flow. CEO sees the whole
 * company; BD is scoped to their branches at the service layer.
 */
export class DebtWriteOffQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  performedById?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  // When true, also returns rows whose write-off was later reversed.
  @IsOptional()
  @IsBooleanString()
  includeReversed?: string;
}
