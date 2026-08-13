import { IsOptional, IsInt, IsEnum, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class PaymentQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  studentId?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  // Debtors list: unified search across firstName / lastName / phone / id.
  @IsOptional()
  @IsString()
  search?: string;

  // Debtors list sorting. Defaults (no params) keep `balance asc` =
  // largest debt first.
  @IsOptional()
  @IsIn(['balance', 'firstName', 'lastName'])
  sortBy?: 'balance' | 'firstName' | 'lastName';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  // Debtors list: filter by payment-promise state.
  // has_open = has an active promise; overdue = has a broken promise.
  @IsOptional()
  @IsIn(['has_open', 'overdue'])
  promise?: 'has_open' | 'overdue';

  /**
   * Debtors list: student status. `'all'` (the default) lists every debtor
   * whatever their status — a frozen or expelled student still owes the money.
   */
  @IsOptional()
  @IsIn(['all', 'ACTIVE', 'FROZEN', 'EXPELLED', 'GRADUATED', 'ARCHIVED'])
  studentStatus?:
    | 'all'
    | 'ACTIVE'
    | 'FROZEN'
    | 'EXPELLED'
    | 'GRADUATED'
    | 'ARCHIVED';
}
