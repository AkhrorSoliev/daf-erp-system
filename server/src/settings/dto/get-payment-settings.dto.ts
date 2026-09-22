import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class GetPaymentSettingsDto {
  // CEO uchun ixtiyoriy: qaysi filial ko'zi bilan qarash. Berilmasa —
  // kompaniya darajasidagi qiymat. Branch Director uchun bu maydon
  // e'tiborga OLINMAYDI — kontroller ularni har doim o'z filialiga
  // qulflaydi (`resolveCallerBranchScope`).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}
