import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { RefundStatus } from '@prisma/client';
import { toStringArray } from '../../common/dto/to-array';

/** `GET /refunds` — the history page asks `?status=COMPLETED,REJECTED`. */
export class RefundListQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(RefundStatus, { each: true })
  status?: RefundStatus[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 10;

  /** Read by `BranchScopeGuard`; the service reads the resolved scope. */
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}
