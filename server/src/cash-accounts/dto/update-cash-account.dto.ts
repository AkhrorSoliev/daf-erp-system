import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Name / active toggle only. Balance is never edited directly — it moves via
// CashMovement rows (transfer / reconcile / inflow / outflow). Type and branch
// are immutable once set (changing them would misattribute existing movements).
export class UpdateCashAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
