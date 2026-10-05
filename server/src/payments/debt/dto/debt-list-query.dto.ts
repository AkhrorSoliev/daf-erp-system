import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toNumberArray, toStringArray } from '../../../common/dto/to-array';
import {
  DEBT_TABS,
  type DebtKindKey,
  type DebtTab,
} from '../../../reports/debt-split';
import type { DebtSort, PromiseFilter } from '../debt-list.math';

/** `GET /payments/debt/list` and `/excel` — the names the client keeps in its URL (spec §2.4). */
export class DebtListQueryDto {
  @IsOptional() @IsIn(DEBT_TABS) tab: DebtTab = 'shu-oy';

  /** O'qimayotganlar only. */
  @IsOptional() @IsIn(['ungrouped', 'frozen', 'left']) kind?: DebtKindKey;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];

  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  teacherIds?: number[];

  @IsOptional() @IsIn(['open', 'broken', 'none']) promise?: PromiseFilter;

  @IsOptional() @IsIn(['debt', 'oldest', 'broken', 'name']) sort: DebtSort =
    'debt';

  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  /** Read by `BranchScopeGuard` when a page names one branch; the service reads the resolved scope. */
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}
