import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AGE_BUCKETS,
  REFUNDABLE_TABS,
  type AgeBucket,
  type RefundableTab,
} from '../refundable.math';

/** `GET /refundable/list` and `/excel` — the names the page keeps in its URL. */
export class RefundableQueryDto {
  @IsOptional() @IsIn(REFUNDABLE_TABS) tab: RefundableTab = 'muzlatilgan';

  /** Muzlatilganlar only. */
  @IsOptional() @IsIn(AGE_BUCKETS) age?: AgeBucket;

  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pendingPage?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pendingPageSize?: number = 10;

  /** Read by `BranchScopeGuard`; the service reads the resolved scope. */
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}
