import { IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Query params for `GET /payments/frozen-balances`. Same shape as the
 * debtors list's branch filter — `branchId` is the branch-switcher pick,
 * narrowed against the caller's own scope inside the service.
 */
export class FrozenBalancesQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}
